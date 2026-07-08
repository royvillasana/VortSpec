import { useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { EditorGroup } from "./EditorGroup";
import { PreviewPane } from "./PreviewPane";
import type { WorkspaceFiles } from "../lib/useWorkspaceFiles";

/**
 * The center editor region: the editor group (tabs + Monaco) with a live-preview
 * pane, stacked or side-by-side. File state is owned by `useWorkspaceFiles`
 * (above) so tabs persist when the center switches to a panel and back.
 */
export function EditorArea({ project, wf }: { project: Project; wf: WorkspaceFiles }): JSX.Element {
  const [previewOpen, setPreviewOpen] = useState(true);
  const [layout, setLayout] = useState<"stacked" | "side">("stacked");

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Editor toolbar: layout + preview controls */}
      <div className="flex flex-none items-center justify-end gap-1 border-b border-vs-border-subtle bg-vs-bg-surface px-2 py-1 text-[11px] text-vs-text-muted">
        <button
          type="button"
          aria-pressed={layout === "side"}
          onClick={() => setLayout((l) => (l === "stacked" ? "side" : "stacked"))}
          className="rounded px-2 py-0.5 hover:text-vs-text-secondary"
          title="Toggle editor/preview layout"
        >
          {layout === "stacked" ? "Side-by-side" : "Stacked"}
        </button>
        <button
          type="button"
          aria-pressed={previewOpen}
          onClick={() => setPreviewOpen((v) => !v)}
          className={`rounded px-2 py-0.5 ${previewOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
          title="Toggle live preview"
        >
          Preview
        </button>
      </div>

      <div className={`flex min-h-0 min-w-0 flex-1 ${layout === "side" ? "flex-row" : "flex-col"}`}>
        <div className="flex min-h-0 min-w-0 flex-1">
          <EditorGroup
            files={wf.files}
            activePath={wf.activePath}
            onActivate={wf.setActivePath}
            onClose={wf.close}
            onChange={wf.change}
            onSave={(p) => void wf.save(p)}
            onReload={(p) => void wf.reload(p)}
            loadHead={(p) => api.fileAtHead(project.path, p)}
          />
        </div>
        {previewOpen && (
          <div
            className={
              layout === "side"
                ? "min-h-0 w-1/2 shrink-0 border-l border-vs-border-default"
                : "h-2/5 min-h-0 shrink-0 border-t border-vs-border-default"
            }
          >
            <PreviewPane project={project} />
          </div>
        )}
      </div>
    </div>
  );
}
