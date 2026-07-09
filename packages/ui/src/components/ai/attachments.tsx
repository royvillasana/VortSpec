import type { FsEntry } from "@vortspec/core/ipc";
import { cn } from "../../lib/cn";

/**
 * Chat context attachments — files, folders, and code selections the user pulls
 * into the conversation the way the Claude Code extension does: type `@` to pick
 * a file, drag one in from the Explorer, or "Open in Chat" from an editor
 * selection. Each becomes a removable chip above the composer and is expanded
 * into the prompt so Claude reads it.
 */
export interface ChatAttachment {
  id: string;
  /** Workspace-relative path. */
  path: string;
  kind: "file" | "dir" | "selection";
  /** For a selection: the 1-based line range and the selected text. */
  startLine?: number;
  endLine?: number;
  text?: string;
}

/** An "Open in Chat" request from the editor — a selection to attach. `nonce`
 *  bumps each time so the dock re-adds it even for the same range. */
export interface PendingSelectionRef {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  nonce: number;
}

/** A short label for a chip (basename, plus a line range for selections). */
export function attachmentLabel(a: ChatAttachment): string {
  const base = a.path.split("/").pop() || a.path;
  if (a.kind === "selection" && a.startLine) {
    return a.startLine === a.endLine ? `${base}:${a.startLine}` : `${base}:${a.startLine}-${a.endLine}`;
  }
  return base;
}

/** Expand attachments into a prompt context block prepended to the message. */
export function expandAttachments(atts: ChatAttachment[]): string {
  if (atts.length === 0) return "";
  const lines = atts.map((a) => {
    if (a.kind === "selection" && a.startLine) {
      const range = a.startLine === a.endLine ? `L${a.startLine}` : `L${a.startLine}-L${a.endLine}`;
      const snippet = a.text ? `\n\`\`\`\n${a.text}\n\`\`\`` : "";
      return `- ${a.path}:${range}${snippet}`;
    }
    return `- @${a.path} (${a.kind === "dir" ? "folder" : "file"})`;
  });
  return `[Referenced context — read these as needed]\n${lines.join("\n")}`;
}

const ICON: Record<ChatAttachment["kind"], string> = { file: "📄", dir: "📁", selection: "⧉" };

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <span
          key={a.id}
          title={a.path}
          data-testid="attachment-chip"
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-vs-border-default bg-vs-bg-elevated px-1.5 py-0.5 text-[11px] text-vs-text-secondary"
        >
          <span aria-hidden>{ICON[a.kind]}</span>
          <span className="truncate font-mono">{attachmentLabel(a)}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            title="Remove"
            className="ml-0.5 rounded px-0.5 leading-none text-vs-text-muted hover:text-vs-text-primary"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** The `@`-mention file picker shown while typing `@query`. */
export function MentionMenu({
  results,
  activeIndex,
  onPick,
}: {
  results: FsEntry[];
  activeIndex: number;
  onPick: (entry: FsEntry) => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="mention-menu"
      className="mb-2 max-h-56 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-lg"
    >
      {results.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-vs-text-muted">No matching files.</div>
      ) : (
        results.map((e, i) => (
          <button
            key={e.path}
            type="button"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => onPick(e)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
              i === activeIndex ? "bg-vs-accent-muted text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
            )}
          >
            <span aria-hidden>{e.type === "dir" ? "📁" : "📄"}</span>
            <span className="truncate font-mono text-[11px]">{e.path}</span>
          </button>
        ))
      )}
    </div>
  );
}
