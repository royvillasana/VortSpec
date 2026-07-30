import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";

/** Slug a label into a stable frame id / component name (mirrors normSegment on the main side). */
function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "sketch";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * The Draw window (docs/draw-to-component-graph.md) — its OWN window, never an overlay on the
 * Playground. It hosts the project's PERSISTENT Excalidraw canvas; "Generate" turns the sketch into a
 * design-system-grounded component: export the sketch PNG, run the grounded prompt (selectSubgraph +
 * renderSubgraphForPrompt) via the agent, and land a light page the Playground previews.
 */
export function DrawWindow({ project }: { project: string }): React.JSX.Element {
  const name = project.split("/").filter(Boolean).pop() ?? "project";
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useAgentRun();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const pending = useRef<{ sketchId: string; name: string } | null>(null);

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
          data = null;
        }
      }
      setInitialData(data);
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  // Debounced autosave.
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

  // Generate: export the sketch → build the grounded prompt → run the agent.
  const generate = useCallback(async () => {
    const inst = apiRef.current;
    if (!inst || !label.trim() || run.running) return;
    setStatus(null);
    const frameId = slug(label);
    try {
      const blob = await exportToBlob({
        elements: inst.getSceneElements(),
        appState: inst.getAppState(),
        files: inst.getFiles(),
        mimeType: "image/png",
      });
      const dataUrl = await blobToDataUrl(blob);
      const pngPath = await api.canvasExportSketch(project, frameId, dataUrl);
      const built = await api.drawGeneratePrompt(project, { frameId, label: label.trim(), note: note.trim() || undefined, pngPath });
      pending.current = { sketchId: built.sketchId, name: built.name };
      await run.start({ prompt: built.prompt, cwd: project, allowedTools: ["Read", "Write", "Edit", "Bash"], bypassPermissions: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [label, note, project, run]);

  // On completion, record provenance in the graph and tell the user where to look.
  useEffect(() => {
    if (run.model.status !== "done" || !pending.current) return;
    const { sketchId, name: comp } = pending.current;
    void api.drawRecordGeneration(project, { sketchId, component: comp }).catch(() => undefined);
    setStatus(`Created “${comp}”. Open the Playground to see it (refresh if it's already open).`);
    pending.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

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

      {/* Generate bar — sketch → design-system component. */}
      <div className="flex flex-none items-center gap-2 border-t border-vs-border-subtle bg-vs-bg-surface px-3 py-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is it? (e.g. Product card)"
          className="w-48 flex-none rounded border border-vs-border-default bg-vs-bg-base px-2 py-1 text-[12px] outline-none focus:border-vs-accent"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. reuse Card, add a rating"
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-base px-2 py-1 text-[12px] outline-none focus:border-vs-accent"
        />
        {status && <span className="max-w-[36ch] truncate text-[11px] text-vs-text-muted" title={status}>{status}</span>}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!label.trim() || run.running}
          className="flex-none rounded bg-vs-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {run.running ? "Generating…" : "Generate component"}
        </button>
      </div>
    </div>
  );
}
