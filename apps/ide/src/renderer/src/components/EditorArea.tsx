import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { EditorGroup } from "./EditorGroup";
import type { CodeSelection } from "./CodeEditor";
import type { WorkspaceFiles } from "../lib/useWorkspaceFiles";

/**
 * The editor group region: tabs + Monaco. File state is owned by
 * `useWorkspaceFiles` (above) so tabs persist across activity switches. The
 * localhost preview lives in the Playground now, so the Explorer editor no longer
 * carries a bottom preview bar.
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
        onReorder={wf.reorder}
      />
    </div>
  );
}
