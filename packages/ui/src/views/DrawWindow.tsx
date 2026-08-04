import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { api } from "../lib/api";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * The Draw window (docs/draw-to-component-graph.md) — its OWN movable OS window, big and draggable, not
 * a modal. It hosts the project's persistent Excalidraw canvas; "Use this drawing" hands the sketch back
 * to the WAITING compose dialog in the main window, which composes it INTO the selected slot on the
 * current screen (api.drawReturnSketch → main broadcasts DRAW_SKETCH_READY → the dialog generates).
 */
export function DrawWindow({ project }: { project: string }): React.JSX.Element {
  const name = project.split("/").filter(Boolean).pop() ?? "project";
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const raw = await api.canvasLoadScene(project).catch(() => null);
      if (!alive) return;
      let data: ExcalidrawInitialDataState | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ExcalidrawInitialDataState;
          data = { elements: parsed.elements ?? [], appState: parsed.appState ?? {}, files: parsed.files ?? undefined, scrollToContent: true };
        } catch {
          data = null;
        }
      }
      setInitialData(data);
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  const onChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void api.canvasSaveScene(project, serializeAsJSON(elements, appState, files, "local")).catch(() => undefined);
      }, 800);
    },
    [project],
  );
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Hand ONLY the selected drawing back to the compose dialog. The canvas is a durable workspace with
  // many drawings/iterations — the user selects the shapes (or a frame) they want to build, and only
  // that selection becomes the component. Nothing selected → prompt them to select first.
  const useDrawing = useCallback(async () => {
    const inst = apiRef.current;
    if (!inst) return;
    const appState = inst.getAppState();
    const all = inst.getSceneElements();
    const selectedIds = appState.selectedElementIds ?? {};
    // A selected FRAME brings its contents; otherwise take exactly the selected shapes.
    const selectedFrames = new Set(all.filter((e) => e.type === "frame" && selectedIds[e.id]).map((e) => e.id));
    const chosen = all.filter((e) => selectedIds[e.id] || (e.frameId && selectedFrames.has(e.frameId)));
    if (chosen.length === 0) {
      setNeedsSelection(true);
      return;
    }
    setNeedsSelection(false);
    const blob = await exportToBlob({ elements: chosen, appState, files: inst.getFiles(), mimeType: "image/png" });
    await api.drawReturnSketch(project, await blobToDataUrl(blob)).catch(() => undefined);
    setSent(true);
    window.setTimeout(() => setSent(false), 2500);
  }, [project]);

  return (
    <div className="flex h-screen w-screen flex-col bg-vs-bg-base text-vs-text-primary">
      <header
        className="flex flex-none items-center gap-2 border-b border-vs-border-subtle py-2 ps-20 pe-4 text-[13px]"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="font-medium">Draw</span>
        <span className="text-vs-text-muted">— {name}</span>
        {sent && <span className="ms-2 text-[11px] text-vs-success">Sent to the compose dialog ✓</span>}
        {needsSelection && (
          <span className="ms-2 text-[11px] text-vs-warning">Select the drawing you want first — only the selection is built.</span>
        )}
        <button
          type="button"
          onClick={() => void useDrawing()}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="ml-auto rounded-md bg-vs-accent px-3 py-1 text-[12px] font-medium text-white hover:brightness-110"
        >
          Use this drawing →
        </button>
      </header>
      {/* The canvas is a durable workspace with all your drawings/iterations — SELECT the shapes (or a
          frame) you want to build before "Use this drawing"; only that selection becomes the component. */}
      <div className="flex flex-none items-center gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-4 py-1.5 text-[11px] text-vs-text-muted">
        <span className="text-vs-text-secondary">Tip:</span>
        <span>draw freely — then <b className="text-vs-text-secondary">select</b> the shapes (or a frame) you want and hit <b className="text-vs-text-secondary">Use this drawing</b>. Only the selection is built.</span>
      </div>

      <div className="relative min-h-0 flex-1">
        {initialData === undefined ? (
          <div className="flex h-full items-center justify-center text-[13px] text-vs-text-muted">Loading your canvas…</div>
        ) : (
          <Excalidraw
            excalidrawAPI={(instance) => {
              apiRef.current = instance;
            }}
            initialData={initialData}
            onChange={onChange}
            theme="dark"
          />
        )}
      </div>
    </div>
  );
}
