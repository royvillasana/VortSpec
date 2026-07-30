import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { api } from "../lib/api";

/**
 * The Draw window (docs/draw-to-component-graph.md) — its OWN window, never an overlay on the
 * Playground. It hosts the project's PERSISTENT Excalidraw canvas: the saved scene loads on open,
 * and edits autosave (debounced) back to `.vortspec/canvas/canvas.excalidraw` via the canvas store.
 *
 * B2 (this): the editor + persistence. Generation ("sketch → design-system component") lands in a
 * later increment — the excalidrawAPI ref captured here is what a Generate action will export.
 */
export function DrawWindow({ project }: { project: string }): React.JSX.Element {
  const name = project.split("/").filter(Boolean).pop() ?? "project";
  // undefined = still loading; null = no saved scene (fresh); else the restored scene.
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the persisted scene once for this project.
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
          data = null; // corrupt scene → start fresh rather than fail to open
        }
      }
      setInitialData(data);
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  // Debounced autosave: serialize the scene and persist it to the canvas store.
  const onChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const json = serializeAsJSON(elements, appState, files, "local");
        void api.canvasSaveScene(project, json).catch(() => undefined);
      }, 800);
    },
    [project],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-vs-bg-base text-vs-text-primary">
      <header
        className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-4 py-2 text-[13px]"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="font-medium">Draw</span>
        <span className="text-vs-text-muted">— {name}</span>
      </header>
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
