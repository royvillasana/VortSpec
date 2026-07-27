import { useRef, useState } from "react";
import { buildStructuralModel, slotAt } from "@vortspec/core/structure-model";
import type { StructureSnapshot, StructuralNode, Slot, NodeDesc } from "@vortspec/core/structure-model";
import { api } from "../lib/api";

/**
 * Editable light-page canvas on the ISLANDS model (light-design-system, task 5.1 + drag polish). The
 * light page's source IS the DOM, so we render it in a SAME-ORIGIN iframe and instrument it FROM THE
 * PARENT (no guest preload): click selects the nearest `data-component` island, double-click makes text
 * editable, and dragging an island MOVES it — container-aware — to a valid drop slot. Any edit serializes
 * the whole document straight back to `.vortspec/light-pages/<name>.html` (lossless, no codemods). The
 * framework version is transformed from these same islands in the background.
 *
 * Container-aware moves reuse the SAME pure geometry as the framework canvas: the parent serializes a
 * `StructureSnapshot` off the live iframe DOM (the "guest serializer" here is just direct same-origin
 * DOM access), `buildStructuralModel` turns it into the nested section→row→column tree, and `slotAt`
 * resolves the deepest valid insertion slot under the cursor — excluding the dragged subtree so a drop
 * can't land inside itself. We then move the real DOM node into that slot and persist.
 */
export function LightPageCanvas({
  projectPath,
  name,
  html,
  onConvert,
}: {
  projectPath: string;
  name: string;
  html: string;
  /** "Convert to code" — generate the real framework page in the background (task 6). */
  onConvert?: () => void;
}): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(): void {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // Serialize a CLONE with our editing artifacts stripped, so the saved page stays clean.
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-lp-selected]").forEach((n) => n.removeAttribute("data-lp-selected"));
    clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
    clone.querySelectorAll("[data-lp-drop]").forEach((n) => n.remove());
    clone.querySelectorAll("style[data-lp-style]").forEach((n) => n.remove());
    void api.liteWritePage(projectPath, name, `<!doctype html>\n${clone.outerHTML}`).then(() => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    });
  }
  function scheduleSave(): void {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, 500);
  }

  function instrument(): void {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || doc.querySelector("style[data-lp-style]")) return; // already instrumented
    const style = doc.createElement("style");
    style.setAttribute("data-lp-style", "");
    style.textContent =
      "[data-lp-selected]{outline:2px solid #6b8afd!important;outline-offset:1px;cursor:grab}" +
      "[data-lp-drop]{position:fixed;background:#6b8afd;border-radius:2px;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 1px rgba(107,138,253,.35)}";
    doc.head?.appendChild(style);

    // ── drag state (per page-load; lives with these listeners) ────────────────
    type Drag = {
      el: HTMLElement;
      id: string;
      startX: number;
      startY: number;
      active: boolean;
      model: StructuralNode | null;
      elById: Map<string, Element>;
      slot: Slot | null;
    };
    let drag: Drag | null = null;
    let suppressClick = false;

    const showDrop = (line: Slot["line"]): void => {
      let ov = doc.querySelector<HTMLElement>("[data-lp-drop]");
      if (!ov) {
        ov = doc.createElement("div");
        ov.setAttribute("data-lp-drop", "");
        doc.body.appendChild(ov);
      }
      const left = Math.min(line.x1, line.x2);
      const top = Math.min(line.y1, line.y2);
      ov.style.left = `${left}px`;
      ov.style.top = `${top}px`;
      ov.style.width = `${Math.max(Math.abs(line.x2 - line.x1), 2)}px`;
      ov.style.height = `${Math.max(Math.abs(line.y2 - line.y1), 2)}px`;
    };
    const hideDrop = (): void => doc.querySelector("[data-lp-drop]")?.remove();
    const endDrag = (d: Drag | null): void => {
      hideDrop();
      doc.body.style.cursor = "";
      doc.body.style.userSelect = "";
      if (d?.active) d.el.style.opacity = "";
    };

    doc.addEventListener(
      "click",
      (e) => {
        if (suppressClick) {
          // A drag just finished — swallow the trailing click so it doesn't re-select/deselect.
          suppressClick = false;
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
        const t = e.target as Element | null;
        if (!t) return;
        e.preventDefault();
        const island = t.closest("[data-component]") ?? t;
        doc.querySelectorAll("[data-lp-selected]").forEach((n) => n.removeAttribute("data-lp-selected"));
        island.setAttribute("data-lp-selected", "");
        setSelected(island.getAttribute("data-component") ?? island.tagName.toLowerCase());
      },
      true,
    );
    doc.addEventListener(
      "dblclick",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        t.setAttribute("contenteditable", "true");
        t.focus();
      },
      true,
    );
    doc.addEventListener("input", () => scheduleSave(), true);
    doc.addEventListener(
      "blur",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (t?.getAttribute("contenteditable") === "true") {
          t.removeAttribute("contenteditable");
          scheduleSave();
        }
      },
      true,
    );

    // ── drag to move an island (container-aware) ──────────────────────────────
    doc.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t || t.isContentEditable) return; // don't hijack text editing
        const island = t.closest<HTMLElement>("[data-component]");
        if (!island) return;
        drag = { el: island, id: "", startX: e.clientX, startY: e.clientY, active: false, model: null, elById: new Map(), slot: null };
      },
      true,
    );
    doc.addEventListener(
      "pointermove",
      (e) => {
        if (!drag) return;
        if (!drag.active) {
          if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
          const win = iframeRef.current?.contentWindow;
          if (!win || !doc.body) {
            drag = null;
            return;
          }
          // Snapshot the live DOM → structural model (once, at drag start).
          const { snap, elById } = snapshotFromDom(doc.body, win);
          drag.elById = elById;
          drag.model = buildStructuralModel(snap);
          for (const [id, el] of elById)
            if (el === drag.el) {
              drag.id = id;
              break;
            }
          drag.active = true;
          drag.el.style.opacity = "0.4";
          doc.body.style.cursor = "grabbing";
          doc.body.style.userSelect = "none";
        }
        if (!drag.model || !drag.id) return;
        const slot = slotAt(drag.model, { x: e.clientX, y: e.clientY }, { excludeSubtree: [drag.id] });
        drag.slot = slot;
        if (slot) showDrop(slot.line);
        else hideDrop();
      },
      true,
    );
    doc.addEventListener(
      "pointerup",
      () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        endDrag(d);
        if (!d.active) return; // was a click, not a drag
        suppressClick = true;
        if (d.slot && d.id && d.el.parentNode) {
          const container = d.elById.get(d.slot.containerId);
          const anchor = d.elById.get(d.slot.anchorId);
          if (container && anchor) {
            const ref = d.slot.position === "before" ? anchor : anchor.nextElementSibling;
            if (ref !== d.el) container.insertBefore(d.el, ref ?? null);
            doc.querySelectorAll("[data-lp-selected]").forEach((n) => n.removeAttribute("data-lp-selected"));
            d.el.setAttribute("data-lp-selected", "");
            setSelected(d.el.getAttribute("data-component") ?? d.el.tagName.toLowerCase());
            save();
          }
        }
      },
      true,
    );
    doc.addEventListener(
      "pointercancel",
      () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        endDrag(d);
      },
      true,
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-vs-border-subtle px-3 py-1.5 text-[12px]">
        <span className="text-vs-text-muted">Editing</span>
        <span className="font-medium text-vs-text-primary">{name}</span>
        {selected && <span className="rounded bg-vs-bg-hover px-2 py-0.5 text-[11px] text-vs-text-secondary">island: {selected}</span>}
        <span className="ml-auto text-[11px] text-vs-text-muted">{saved ? "Saved ✓" : "Click to select · drag to move · double-click to edit text"}</span>
        {onConvert && (
          <button
            type="button"
            onClick={onConvert}
            title="Generate the real framework page from this light page, in the background"
            className="rounded bg-vs-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            Convert to code
          </button>
        )}
      </div>
      {html.trim() ? (
        <iframe
          key={name}
          ref={iframeRef}
          title={`Edit ${name}`}
          className="min-h-0 flex-1 border-0 bg-white"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={instrument}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-vs-text-muted">
          <p>
            This light page is <span className="text-vs-text-secondary">empty</span> — the composed HTML for “{name}” couldn’t be read
            (no content at <code>.vortspec/light-pages/{name}.html</code>).
          </p>
          <p className="text-[12px]">Recompose it: use “+ New light page” with the same name, or describe it in the chat.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Serialize the live iframe subtree into a `StructureSnapshot` (light-design-system, drag polish). This is
 * the parent-side equivalent of the framework canvas's guest serializer — here we have direct same-origin
 * DOM access, so we walk elements, read the layout-relevant computed styles + bounding rects, and hand the
 * flat map to the pure `buildStructuralModel`. Ids are transient (per drag) and never touch the saved HTML.
 */
function snapshotFromDom(root: Element, win: Window): { snap: StructureSnapshot; elById: Map<string, Element> } {
  const nodes: Record<string, NodeDesc> = {};
  const elById = new Map<string, Element>();
  let counter = 0;
  const walk = (el: Element): string => {
    const id = `n${counter++}`;
    elById.set(id, el);
    const cs = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const childIds = Array.from(el.children)
      .filter((c) => !c.hasAttribute("data-lp-drop")) // never treat our own overlay as content
      .map((c) => walk(c));
    nodes[id] = {
      id,
      fingerprint: id,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      computed: {
        display: cs.display,
        "flex-direction": cs.flexDirection,
        "grid-auto-flow": cs.gridAutoFlow,
        gap: cs.gap,
      },
      childIds,
    };
    return id;
  };
  const rootId = walk(root);
  return { snap: { rootId, nodes }, elById };
}
