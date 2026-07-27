import { useEffect, useRef, useState } from "react";
import { buildStructuralModel, slotAt } from "@vortspec/core/structure-model";
import type { StructureSnapshot, StructuralNode, Slot, NodeDesc } from "@vortspec/core/structure-model";
import type { InspectorToken } from "@vortspec/core/ipc";
import type { CompileResult } from "@vortspec/core/compile";
import { api } from "../lib/api";
import { compileLightHtml } from "../lib/light-compile";

/**
 * Editable light-page canvas on the ISLANDS model (light-design-system, task 5.1 + drag + token polish).
 * The light page's source IS the DOM, so we render it in a SAME-ORIGIN iframe and instrument it FROM THE
 * PARENT (no guest preload). Three edit gestures, all instant + no-Apply, all persisted straight to
 * `.vortspec/light-pages/<name>.html`:
 *   • click an island to select it, double-click to edit its text;
 *   • drag an island to MOVE it — container-aware (see below);
 *   • with an island selected, restyle it from the design tokens in the side panel.
 *
 * Container-aware moves reuse the framework canvas's pure geometry: the parent serializes a
 * `StructureSnapshot` off the live iframe DOM, `buildStructuralModel` builds the nested
 * section→row→column tree, and `slotAt` resolves the deepest valid slot under the cursor (excluding the
 * dragged subtree so a drop can't land inside itself).
 *
 * Token editing writes the token's RESOLVED value into the element's `style` ATTRIBUTE string directly
 * (never via CSSOM, which would normalize `#6b8afd`→`rgb(...)` and break the compile step's value→token
 * lookup). So the saved HTML keeps exact token values, and `compileLightPage` restores the token
 * reference by that value — token discipline stays correct-by-construction.
 */
/** An insertable design-system stand-in: a framework-free HTML snippet for one component variant. */
export interface InsertableStandIn {
  component: string;
  variant: string;
  html: string;
}

export function LightPageCanvas({
  projectPath,
  name,
  html,
  tokens = [],
  standIns = [],
  readiness = {},
  onConvert,
}: {
  projectPath: string;
  name: string;
  html: string;
  /** Design tokens (name + resolved value + category) — the only values the style panel offers. */
  tokens?: InspectorToken[];
  /** Insertable design-system stand-ins for the Insert menu (empty until Figma previews are generated). */
  standIns?: InsertableStandIn[];
  /** component name → readiness: `framework-ready` (real code, Convert reuses) vs `light-only` (Convert builds it). */
  readiness?: Record<string, "light-only" | "framework-ready">;
  /** "Convert to code" — generate the real framework page in the background (task 6). Receives the
   *  deterministic compile of the CURRENT canvas so the background build gets an authoritative skeleton. */
  onConvert?: (compiled?: CompileResult) => void;
}): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [rev, setRev] = useState(0); // bump to re-read the selected element's inline styles
  const [saved, setSaved] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);

  // A new page remounts the iframe (key={name}); drop any selection from the old one.
  useEffect(() => setSelectedEl(null), [name]);

  /** Select an element (or clear) — the single selection path shared by click, drag-drop, and edits. */
  function selectEl(el: Element | null): void {
    const doc = iframeRef.current?.contentDocument;
    doc?.querySelectorAll("[data-lp-selected]").forEach((n) => n.removeAttribute("data-lp-selected"));
    if (el) el.setAttribute("data-lp-selected", "");
    setSelectedEl((el as HTMLElement) ?? null);
  }

  /** Insert a design-system stand-in as a new island — after the selection, else at the page end. */
  function insertStandIn(si: InsertableStandIn): void {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const tmpl = doc.createElement("template");
    tmpl.innerHTML = si.html.trim();
    let root = tmpl.content.firstElementChild as HTMLElement | null;
    if (!root || tmpl.content.children.length !== 1) {
      // Multiple (or zero) roots → wrap into a single island so it's one selectable/draggable unit.
      const wrap = doc.createElement("div");
      wrap.append(...Array.from(tmpl.content.childNodes));
      root = wrap;
    }
    if (!root.hasAttribute("data-component")) root.setAttribute("data-component", si.component);
    if (selectedEl?.parentNode) selectedEl.after(root);
    else doc.body.appendChild(root);
    selectEl(root);
    setInsertOpen(false);
    save();
  }

  /** Duplicate the selected island right after itself. */
  function duplicateSelected(): void {
    if (!selectedEl?.parentNode) return;
    const clone = selectedEl.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-lp-selected");
    selectedEl.after(clone);
    selectEl(clone);
    save();
  }

  /** Remove the selected island. */
  function deleteSelected(): void {
    if (!selectedEl) return;
    selectedEl.remove();
    selectEl(null);
    save();
  }

  const colorTokens = tokens.filter((t) => t.type === "color");
  const spacingTokens = tokens.filter((t) => t.type === "spacing");
  const radiusTokens = tokens.filter((t) => t.type === "radius");

  /** The current page as clean HTML (a clone with all editing artifacts stripped), or null if not ready. */
  function serialize(): string | null {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return null;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-lp-selected]").forEach((n) => n.removeAttribute("data-lp-selected"));
    clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
    clone.querySelectorAll("[data-lp-drop]").forEach((n) => n.remove());
    clone.querySelectorAll("style[data-lp-style]").forEach((n) => n.remove());
    return `<!doctype html>\n${clone.outerHTML}`;
  }

  function save(): void {
    const html = serialize();
    if (html == null) return;
    void api.liteWritePage(projectPath, name, html).then(() => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    });
  }

  /** Convert: deterministically compile the CURRENT canvas, then hand it to the background build. */
  function handleConvert(): void {
    if (!onConvert) return;
    const html = serialize();
    let compiled: CompileResult | undefined;
    try {
      compiled = html ? compileLightHtml(html, tokens) : undefined;
    } catch {
      compiled = undefined; // a parse/compile hiccup must never block Convert — the agent falls back to the HTML
    }
    onConvert(compiled);
  }
  function scheduleSave(): void {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, 500);
  }

  /** Apply (or clear, when value is "") a token value to a CSS property on the selected island. */
  function applyToken(prop: string, value: string): void {
    if (!selectedEl) return;
    setInlineStyle(selectedEl, prop, value || null);
    setRev((r) => r + 1);
    save();
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
        selectEl(t.closest("[data-component]") ?? t);
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
            selectEl(d.el);
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

  const selName = selectedEl ? selectedEl.dataset.component ?? selectedEl.tagName.toLowerCase() : null;
  // `rev` is read so the panel re-computes active tokens after each applyToken.
  void rev;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-vs-border-subtle px-3 py-1.5 text-[12px]">
        <span className="text-vs-text-muted">Editing</span>
        <span className="font-medium text-vs-text-primary">{name}</span>
        {selName && <span className="rounded bg-vs-bg-hover px-2 py-0.5 text-[11px] text-vs-text-secondary">island: {selName}</span>}
        <span className="ml-auto text-[11px] text-vs-text-muted">{saved ? "Saved ✓" : "Click to select · drag to move · double-click to edit text"}</span>
        {standIns.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setInsertOpen((o) => !o)}
              title={selName ? `Insert a component after ${selName}` : "Insert a component at the end of the page"}
              className="rounded border border-vs-border-subtle px-2 py-1 text-[11px] font-medium text-vs-text-primary hover:bg-vs-bg-hover"
            >
              ＋ Insert ▾
            </button>
            {insertOpen && (
              <div className="absolute right-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded border border-vs-border-subtle bg-vs-bg-base py-1 shadow-lg">
                {standIns.map((si) => (
                  <button
                    key={`${si.component}·${si.variant}`}
                    type="button"
                    onClick={() => insertStandIn(si)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-vs-text-primary hover:bg-vs-bg-hover"
                  >
                    <span className="min-w-0 truncate">
                      {si.component}
                      {si.variant && si.variant !== "default" && <span className="text-vs-text-muted"> · {si.variant}</span>}
                    </span>
                    <ReadinessBadge readiness={readiness[si.component]} className="ml-auto flex-none" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onConvert && (
          <button
            type="button"
            onClick={handleConvert}
            title="Generate the real framework page from this light page, in the background"
            className="rounded bg-vs-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            Convert to code
          </button>
        )}
      </div>
      {html.trim() ? (
        <div className="flex min-h-0 flex-1">
          <iframe
            key={name}
            ref={iframeRef}
            title={`Edit ${name}`}
            className="min-h-0 flex-1 border-0 bg-white"
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={instrument}
          />
          {selectedEl && (
            <aside className="flex w-56 flex-none flex-col gap-3 overflow-auto border-l border-vs-border-subtle p-3 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate font-medium text-vs-text-primary">{selName}</span>
                  {selectedEl.dataset.component && <ReadinessBadge readiness={readiness[selectedEl.dataset.component]} className="flex-none" />}
                </span>
                <span className="flex flex-none gap-1">
                  <button
                    type="button"
                    onClick={duplicateSelected}
                    title="Duplicate this island"
                    className="rounded border border-vs-border-subtle px-1.5 py-0.5 text-[11px] text-vs-text-secondary hover:bg-vs-bg-hover"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    title="Delete this island"
                    className="rounded border border-vs-border-subtle px-1.5 py-0.5 text-[11px] text-vs-error hover:bg-vs-bg-hover"
                  >
                    Delete
                  </button>
                </span>
              </div>
              {colorTokens.length + spacingTokens.length + radiusTokens.length === 0 && (
                <p className="text-[11px] leading-snug text-vs-text-muted">No design tokens loaded — style editing appears once tokens are available.</p>
              )}
              {colorTokens.length > 0 && (
                <>
                  <TokenField label="Background" swatch value={getInlineStyle(selectedEl, "background-color")} options={colorTokens} onPick={(v) => applyToken("background-color", v)} />
                  <TokenField label="Text color" swatch value={getInlineStyle(selectedEl, "color")} options={colorTokens} onPick={(v) => applyToken("color", v)} />
                </>
              )}
              {spacingTokens.length > 0 && (
                <>
                  <TokenField label="Padding" value={getInlineStyle(selectedEl, "padding")} options={spacingTokens} onPick={(v) => applyToken("padding", v)} />
                  <TokenField label="Gap" value={getInlineStyle(selectedEl, "gap")} options={spacingTokens} onPick={(v) => applyToken("gap", v)} />
                </>
              )}
              {radiusTokens.length > 0 && (
                <TokenField label="Radius" value={getInlineStyle(selectedEl, "border-radius")} options={radiusTokens} onPick={(v) => applyToken("border-radius", v)} />
              )}
              <p className="mt-1 text-[11px] leading-snug text-vs-text-muted">Values come from your design tokens — the framework build restores each token reference.</p>
            </aside>
          )}
        </div>
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
 * Readiness badge for a design-system component on the canvas: "in code" (a real framework component
 * exists — Convert reuses it) vs "light-only" (designed but not yet coded — Convert will build it). The
 * soft gate made visible; nothing renders for a plain element with no known component.
 */
function ReadinessBadge({ readiness, className = "" }: { readiness?: "light-only" | "framework-ready"; className?: string }): React.JSX.Element | null {
  if (!readiness) return null;
  const ready = readiness === "framework-ready";
  return (
    <span
      title={ready ? "A real framework component exists — Convert reuses it" : "Designed only — Convert will build this component"}
      className={`rounded-full px-1.5 py-px text-[9px] font-medium ${ready ? "bg-vs-success/20 text-vs-success" : "bg-vs-warning/20 text-vs-warning"} ${className}`}
    >
      {ready ? "in code" : "light-only"}
    </span>
  );
}

/** One token-picker row: a native select of tokens, showing the active one when the value matches. */
function TokenField({
  label,
  value,
  options,
  onPick,
  swatch,
}: {
  label: string;
  value: string;
  options: InspectorToken[];
  onPick: (value: string) => void;
  swatch?: boolean;
}): React.JSX.Element {
  // A select shows the active token only when the inline value EXACTLY matches a token value.
  const active = options.find((t) => t.resolvedValue === value)?.resolvedValue ?? "";
  return (
    <label className="block">
      <span className="mb-1 block text-vs-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {swatch && <span className="h-4 w-4 flex-none rounded border border-vs-border-subtle" style={{ background: value || "transparent" }} />}
        <select
          className="min-w-0 flex-1 rounded border border-vs-border-subtle bg-vs-bg-base px-1.5 py-1 text-[11px] text-vs-text-primary"
          value={active}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="">{value && !active ? "(custom)" : "default"}</option>
          {options.map((t) => (
            <option key={t.name} value={t.resolvedValue}>
              {t.name} · {t.resolvedValue}
            </option>
          ))}
        </select>
      </div>
    </label>
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

// ── inline-style attribute helpers ──────────────────────────────────────────
// We edit the `style` ATTRIBUTE string (not CSSOM) so exact token values survive serialization: setting
// `el.style.backgroundColor = "#6b8afd"` would round-trip as `rgb(107,138,253)` and miss the compile
// step's value→token lookup. Writing the attribute keeps the literal the token carries.

function parseStyle(attr: string | null): Array<[string, string]> {
  return (attr ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      return [pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim()] as [string, string];
    })
    .filter(([k]) => k.length > 0);
}

/** Read the value of a single CSS property from an element's inline `style` attribute (last wins). */
function getInlineStyle(el: Element, prop: string): string {
  const found = parseStyle(el.getAttribute("style")).filter(([k]) => k === prop);
  return found.length ? found[found.length - 1][1] : "";
}

/** Set (or, when value is null, remove) a single CSS property in an element's inline `style` attribute. */
function setInlineStyle(el: Element, prop: string, value: string | null): void {
  const pairs = parseStyle(el.getAttribute("style")).filter(([k]) => k !== prop);
  if (value != null && value !== "") pairs.push([prop, value]);
  const s = pairs.map(([k, v]) => `${k}: ${v}`).join("; ");
  if (s) el.setAttribute("style", s);
  else el.removeAttribute("style");
}
