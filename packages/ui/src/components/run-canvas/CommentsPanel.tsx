import { useState } from "react";
import type { JSX } from "react";
import type { CommentThread } from "@vortspec/core/comment";
import type { Rect } from "@vortspec/core/ipc";
import type { CanvasMode } from "../../lib/useInspectorBridge";
import { COMMENT_FILTERS, filterThreads, type CommentFilter, type Me } from "../../lib/comment-filters";

/**
 * The Comments panel (change: run-canvas-comments, Phase 5) — the sidebar view in
 * comment mode: browse/filter every thread, jump the canvas to a pin, resolve, and
 * open a notified thread on GitHub. Threads whose element isn't on the current view
 * fall to an "unanchored" section with their thumbnails.
 */
export interface CommentsPanelProps {
  threads: CommentThread[];
  /** Live anchor rects (fingerprint → rect|null) — null/absent = unanchored. */
  anchorRects: Record<string, Rect | null>;
  activeId: string | null;
  me: Me;
  mode: CanvasMode;
  onModeChange: (m: CanvasMode) => void;
  /** Jump the canvas to a thread's pin. */
  onSelect: (thread: CommentThread) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onShare?: () => void;
}

export function CommentsPanel({
  threads,
  anchorRects,
  activeId,
  me,
  mode,
  onModeChange,
  onSelect,
  onResolve,
  onShare,
}: CommentsPanelProps): JSX.Element {
  const [filter, setFilter] = useState<CommentFilter>("open");
  // Stable pin numbers across the full set (match the canvas), then filter.
  const ordered = [...threads].sort((a, b) => a.id.localeCompare(b.id));
  const numberOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const shown = filterThreads(ordered, filter, me);
  const anchored = shown.filter((t) => anchorRects[t.anchor.fingerprint]);
  const unanchored = shown.filter((t) => !anchorRects[t.anchor.fingerprint]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-vs-bg-primary text-vs-text-primary">
      <div className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary">Comments</span>
        <div className="ml-auto flex overflow-hidden rounded border border-vs-border-default text-[10px]">
          {(["inspect", "interact", "comment"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`px-2 py-0.5 capitalize ${
                mode === m ? "bg-vs-accent text-white" : "text-vs-text-secondary hover:bg-vs-bg-hover"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-none flex-wrap gap-1 border-b border-vs-border-subtle px-3 py-2">
        {COMMENT_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              filter === f.key
                ? "bg-vs-accent-subtle text-vs-accent"
                : "text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
        {onShare && threads.length > 0 && (
          <button
            type="button"
            onClick={onShare}
            title="Push the comment commits so teammates get them on pull"
            className="ml-auto rounded px-2 py-0.5 text-[10px] text-vs-text-secondary hover:bg-vs-bg-hover"
          >
            ⇪ Share
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-vs-text-muted">No comments here yet.</p>
        ) : (
          <>
            {anchored.map((t) => (
              <ThreadRow key={t.id} thread={t} number={numberOf.get(t.id) ?? 0} active={t.id === activeId} onSelect={onSelect} onResolve={onResolve} />
            ))}
            {unanchored.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-vs-text-muted">Not on this view</p>
                {unanchored.map((t) => (
                  <ThreadRow key={t.id} thread={t} number={numberOf.get(t.id) ?? 0} active={t.id === activeId} onSelect={onSelect} onResolve={onResolve} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  number,
  active,
  onSelect,
  onResolve,
}: {
  thread: CommentThread;
  number: number;
  active: boolean;
  onSelect: (t: CommentThread) => void;
  onResolve: (id: string, resolved: boolean) => void;
}): JSX.Element {
  const last = thread.messages[thread.messages.length - 1];
  const notifiedUrl = thread.messages.find((m) => m.notified?.github)?.notified?.github?.url;
  return (
    <div className={`border-b border-vs-border-subtle px-3 py-2 ${active ? "bg-vs-accent-subtle/40" : ""}`}>
      <button type="button" onClick={() => onSelect(thread)} className="flex w-full items-start gap-2 text-left">
        <span className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-[9px] ${thread.resolved ? "bg-vs-bg-hover text-vs-text-muted" : "bg-vs-accent text-white"}`}>
          {thread.resolved ? "✓" : number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-vs-text-primary">{thread.anchor.label}</span>
          <span className="block truncate text-[11px] text-vs-text-secondary">
            {last?.author.name}: {last?.body}
          </span>
        </span>
        {thread.anchor.thumbnail && <img src={thread.anchor.thumbnail} alt="" className="h-7 w-9 flex-none rounded object-cover" />}
      </button>
      <div className="mt-1 flex items-center gap-2 pl-6 text-[10px]">
        <button type="button" onClick={() => onResolve(thread.id, !thread.resolved)} className="text-vs-text-muted hover:text-vs-text-secondary">
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
        {notifiedUrl && (
          <a href={notifiedUrl} target="_blank" rel="noreferrer" className="text-vs-accent hover:underline">
            View on GitHub ↗
          </a>
        )}
      </div>
    </div>
  );
}
