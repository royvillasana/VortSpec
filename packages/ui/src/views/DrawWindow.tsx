import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * The Draw window (docs/draw-to-component-graph.md) — its OWN window, never an overlay on the
 * Playground. It hosts the project's persistent drawing canvas; sketches turn into design-system-
 * grounded components via the compose pipeline (coordinated through main).
 *
 * B1 (this): the window plumbing + scene load/save scaffolding, with a placeholder in the canvas
 * region. B2 mounts the Excalidraw editor there (loading the persisted scene, autosaving on change).
 */
export function DrawWindow({ project }: { project: string }): React.JSX.Element {
  const name = project.split("/").filter(Boolean).pop() ?? "project";
  const [ready, setReady] = useState(false);
  const [hasScene, setHasScene] = useState(false);

  // Confirm the canvas store is reachable and restore any saved scene for this project.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const scene = await api.canvasLoadScene(project).catch(() => null);
      if (!alive) return;
      setHasScene(!!scene);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  return (
    <div className="flex h-screen w-screen flex-col bg-vs-bg-base text-vs-text-primary">
      <header
        className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-4 py-2 text-[13px]"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="font-medium">Draw</span>
        <span className="text-vs-text-muted">— {name}</span>
      </header>
      <div className="flex flex-1 items-center justify-center">
        {!ready ? (
          <span className="text-[13px] text-vs-text-muted">Loading your canvas…</span>
        ) : (
          <div className="flex max-w-[42ch] flex-col items-center gap-2 text-center text-[13px] text-vs-text-muted">
            <p className="text-vs-text-secondary">Your drawing canvas mounts here.</p>
            <p>{hasScene ? "Restored your saved canvas for this project." : "A fresh canvas for this project."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
