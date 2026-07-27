import { useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * Editable light-page canvas on the ISLANDS model (light-design-system, task 5.1). The light page's
 * source IS the DOM, so we render it in a SAME-ORIGIN iframe and instrument it FROM THE PARENT (no guest
 * preload): click selects the nearest `data-component` island, double-click makes text editable, and any
 * edit serializes the whole document straight back to `.vortspec/light-pages/<name>.html` (lossless, no
 * codemods). The framework version is transformed from these same islands in the background.
 *
 * This is the foundational slice — select + edit-text + persist. Drag/container-moves (reusing
 * node-tree/reconcile/layout-structure) and the background transform layer on top.
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
    style.textContent = "[data-lp-selected]{outline:2px solid #6b8afd!important;outline-offset:1px}";
    doc.head?.appendChild(style);

    doc.addEventListener(
      "click",
      (e) => {
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
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-vs-border-subtle px-3 py-1.5 text-[12px]">
        <span className="text-vs-text-muted">Editing</span>
        <span className="font-medium text-vs-text-primary">{name}</span>
        {selected && <span className="rounded bg-vs-bg-hover px-2 py-0.5 text-[11px] text-vs-text-secondary">island: {selected}</span>}
        <span className="ml-auto text-[11px] text-vs-text-muted">{saved ? "Saved ✓" : "Click to select · double-click to edit text"}</span>
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
