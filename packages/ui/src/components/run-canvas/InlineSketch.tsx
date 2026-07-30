import { useRef } from "react";
import type { JSX } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

/**
 * An inline Excalidraw surface for the compose dialog's Draw tab (docs/draw-to-component-graph.md).
 * Default export + kept in its own module so ComposePanel can React.lazy it — Excalidraw is heavy and
 * must NOT land in the main renderer bundle; it only loads when the Draw tab is opened.
 *
 * "Generate from drawing" exports the current sketch to a PNG data URL and hands it up; the compose
 * flow attaches it so the AI builds it INTO the selected spot (no guessing where it goes).
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export default function InlineSketch({
  onGenerate,
  generating,
}: {
  /** Called with the sketch PNG as a data URL when the user hits Generate. */
  onGenerate: (dataUrl: string) => void;
  generating: boolean;
}): JSX.Element {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  async function grab(): Promise<void> {
    const inst = apiRef.current;
    if (!inst) return;
    const blob = await exportToBlob({
      elements: inst.getSceneElements(),
      appState: inst.getAppState(),
      files: inst.getFiles(),
      mimeType: "image/png",
    });
    onGenerate(await blobToDataUrl(blob));
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded border border-vs-border-default">
        <Excalidraw
          excalidrawAPI={(instance) => {
            apiRef.current = instance;
          }}
          theme="dark"
        />
      </div>
      <button
        type="button"
        disabled={generating}
        onClick={() => void grab()}
        className="flex-none self-end rounded-md bg-vs-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate from drawing"}
      </button>
    </div>
  );
}
