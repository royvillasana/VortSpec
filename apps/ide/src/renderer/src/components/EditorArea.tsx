import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { EditorGroup } from "./EditorGroup";
import type { CodeSelection } from "./CodeEditor";
import { PreviewBar } from "./PreviewBar";
import type { WorkspaceFiles } from "../lib/useWorkspaceFiles";

/**
 * The editor group region: tabs + Monaco, with the preview nav bar pinned to its
 * bottom edge (the preview lives here, so it shows only while the editor is on
 * screen). File state is owned by `useWorkspaceFiles` (above) so tabs persist.
 */
export function EditorArea({
  project,
  wf,
  relayoutKey,
  onSelection,
  onOpenInChat,
}: {
  project: Project;
  wf: WorkspaceFiles;
  relayoutKey?: number;
  /** Reports the active editor selection up for assistant grounding. */
  onSelection?: (selection: CodeSelection | null) => void;
  /** "Open in Chat" — attach the selection to the assistant. */
  onOpenInChat?: (selection: CodeSelection) => void;
}): JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <EditorGroup
          files={wf.files}
          activePath={wf.activePath}
          onActivate={wf.setActivePath}
          onClose={wf.close}
          onChange={wf.change}
          onSave={(p) => void wf.save(p)}
          onReload={(p) => void wf.reload(p)}
          loadHead={(p) => api.fileAtHead(project.path, p)}
          relayoutKey={relayoutKey}
          onSelection={onSelection}
          onOpenInChat={onOpenInChat}
        />
      </div>
      <PreviewBar project={project} />
    </div>
  );
}
