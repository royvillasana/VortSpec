import { useState } from "react";
import type { FsEntry } from "@vortspec/core/ipc";
import type { ChatMessage } from "@vortspec/ui/run-model";
import { cn } from "../../lib/cn";
import { FileTree } from "./FileTree";

/**
 * Chat context attachments — files, folders, code selections, AND other
 * conversations the user pulls in the way the Claude Code extension does: type
 * `@` to pick a file or a conversation, drag a file in from the Explorer, "Open
 * in Chat" an editor selection, or send a highlighted selection from another
 * conversation. Each becomes a removable chip and is expanded into the prompt.
 */
export interface ChatAttachment {
  id: string;
  kind: "file" | "dir" | "selection" | "conversation" | "text";
  /** Workspace-relative path (file/dir/selection). */
  path?: string;
  /** For a selection: the 1-based line range and the selected text. */
  startLine?: number;
  endLine?: number;
  text?: string;
  /** For a conversation reference: the target id. */
  convId?: string;
  /** Display label + source (conversation/text). */
  label?: string;
}

/** Read-only access to the other open conversations (for @-refs + expansion). */
export interface ConversationRegistry {
  list: () => { id: string; label: string }[];
  transcript: (id: string) => ChatMessage[];
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

/** A short label for a chip (basename, line range, or conversation label). */
export function attachmentLabel(a: ChatAttachment): string {
  if (a.kind === "conversation") return a.label ?? "conversation";
  if (a.kind === "text") return a.label ? `${a.label} ⧉` : "snippet";
  const base = (a.path ?? "").split("/").pop() || (a.path ?? "");
  if (a.kind === "selection" && a.startLine) {
    return a.startLine === a.endLine ? `${base}:${a.startLine}` : `${base}:${a.startLine}-${a.endLine}`;
  }
  return base;
}

/** Format a conversation transcript newest-first, capped to `maxChars`. */
export function capTranscript(messages: ChatMessage[], maxChars = 2500): string {
  const parts: string[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`;
    if (total + line.length > maxChars && parts.length > 0) break;
    parts.push(line);
    total += line.length;
  }
  return parts.join("\n\n");
}

/**
 * Expand attachments into a prompt context block. `registry` resolves a
 * referenced conversation's (capped, most-recent-first) transcript.
 */
export function expandAttachments(atts: ChatAttachment[], registry?: ConversationRegistry): string {
  if (atts.length === 0) return "";
  const blocks = atts.map((a) => {
    if (a.kind === "conversation" && a.convId) {
      const body = registry ? capTranscript(registry.transcript(a.convId)) : "";
      return `[Referenced conversation "${a.label ?? a.convId}" — most recent first]\n${body || "(no messages yet)"}`;
    }
    if (a.kind === "text") {
      return `[From ${a.label ?? "another conversation"}]\n\`\`\`\n${a.text ?? ""}\n\`\`\``;
    }
    if (a.kind === "selection" && a.startLine) {
      const range = a.startLine === a.endLine ? `L${a.startLine}` : `L${a.startLine}-L${a.endLine}`;
      const snippet = a.text ? `\n\`\`\`\n${a.text}\n\`\`\`` : "";
      return `- ${a.path}:${range}${snippet}`;
    }
    return `- @${a.path} (${a.kind === "dir" ? "folder" : "file"})`;
  });
  return `[Referenced context — read these as needed]\n${blocks.join("\n\n")}`;
}

const ICON: Record<ChatAttachment["kind"], string> = {
  file: "📄",
  dir: "📁",
  selection: "⧉",
  conversation: "💬",
  text: "❝",
};

export function AttachmentChips({
  attachments,
  onRemove,
  onAdd,
  loadDir,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  /** Add an attachment — used when selecting a file/folder inside the tree preview. */
  onAdd?: (att: Omit<ChatAttachment, "id">) => void;
  /** Fetch a folder's children — enables the File Tree preview on `@folder` chips. */
  loadDir?: (path: string) => Promise<FsEntry[]>;
}): React.JSX.Element | null {
  const [preview, setPreview] = useState<string | null>(null);
  if (attachments.length === 0) return null;
  const previewAtt = attachments.find((a) => a.id === preview && a.kind === "dir");

  // Which file/folder paths are currently attached (for tree selection state).
  const isSelected = (path: string): boolean =>
    attachments.some((a) => a.path === path && a.kind !== "selection");
  // Toggle a tree entry in/out of the context attachments.
  const toggleSelect = (entry: FsEntry): void => {
    const existing = attachments.find((a) => a.path === entry.path && a.kind !== "selection");
    if (existing) onRemove(existing.id);
    else onAdd?.({ path: entry.path, kind: entry.type === "dir" ? "dir" : "file" });
  };
  return (
    <div className="mb-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const canPreview = a.kind === "dir" && Boolean(loadDir);
          return (
            <span
              key={a.id}
              title={a.path}
              data-testid="attachment-chip"
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-vs-border-default bg-vs-bg-elevated px-1.5 py-0.5 text-[11px] text-vs-text-secondary"
            >
              <button
                type="button"
                disabled={!canPreview}
                onClick={() => setPreview((p) => (p === a.id ? null : a.id))}
                className={cn("flex min-w-0 items-center gap-1", canPreview && "hover:text-vs-text-primary")}
                title={canPreview ? "Preview folder" : a.path}
              >
                <span aria-hidden>{ICON[a.kind]}</span>
                <span className="truncate font-mono">{attachmentLabel(a)}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemove(a.id);
                  setPreview((p) => (p === a.id ? null : p));
                }}
                title="Remove"
                className="ml-0.5 rounded px-0.5 leading-none text-vs-text-muted hover:text-vs-text-primary"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      {previewAtt?.path && loadDir && (
        <div className="rounded-md border border-vs-border-subtle bg-vs-bg-primary" data-testid="folder-preview">
          <div className="flex items-center justify-between border-b border-vs-border-subtle px-2 py-1 text-[10px] text-vs-text-muted">
            <span>
              <span className="font-mono text-vs-text-secondary">{previewAtt.path}</span> — click items to add them, or keep the whole folder
            </span>
            <button
              type="button"
              onClick={() => onRemove(previewAtt.id)}
              className="shrink-0 rounded px-1 hover:text-vs-text-primary"
              title="Remove the whole folder"
            >
              whole folder ✓
            </button>
          </div>
          <FileTree root={previewAtt.path} loadDir={loadDir} onSelect={onAdd ? toggleSelect : undefined} isSelected={isSelected} />
        </div>
      )}
    </div>
  );
}

/** A `@`-mention candidate: an open conversation or a workspace file/folder. */
export type MentionOption =
  | { kind: "conversation"; id: string; label: string }
  | { kind: "file"; entry: FsEntry };

/** The `@`-mention picker shown while typing `@query` (conversations + files). */
export function MentionMenu({
  items,
  activeIndex,
  onPick,
}: {
  items: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="mention-menu"
      className="mb-2 max-h-56 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-lg"
    >
      {items.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-vs-text-muted">No matches.</div>
      ) : (
        items.map((o, i) => {
          const key = o.kind === "conversation" ? `c:${o.id}` : `f:${o.entry.path}`;
          const icon = o.kind === "conversation" ? "💬" : o.entry.type === "dir" ? "📁" : "📄";
          const text = o.kind === "conversation" ? o.label : o.entry.path;
          return (
            <button
              key={key}
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => onPick(o)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                i === activeIndex ? "bg-vs-accent-muted text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
              )}
            >
              <span aria-hidden>{icon}</span>
              <span className="truncate font-mono text-[11px]">{text}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
