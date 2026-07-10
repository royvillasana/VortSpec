import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { CommentThread } from "@vortspec/core/comment";
import type { Rect } from "@vortspec/core/ipc";
import { Markdown } from "../Markdown";

/**
 * The comments overlay for the Run Canvas (change: run-canvas-comments, Phase 2).
 *
 * Renders in *screen space* (positions are guest rects × zoom) as a sibling of the
 * scaled stage, so pins and popovers stay a constant size at any zoom (Figma-style).
 * A pin sits on each thread whose anchor the guest still resolves; threads whose
 * element is currently gone fall to an "unanchored" rail with their thumbnail.
 */
export interface CommentsLayerProps {
  zoom: number;
  threads: CommentThread[];
  /** Live rects for watched anchors (fingerprint → rect, null/undefined = unanchored). */
  anchorRects: Record<string, Rect | null>;
  /** A pending new-thread anchor from a comment-mode click, or null. */
  target: { fingerprint: string; label: string; component: string | null; rect: Rect } | null;
  activeId: string | null;
  onSelectThread: (id: string | null) => void;
  onCreate: (body: string) => void;
  onReply: (threadId: string, body: string) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
  onCancelTarget: () => void;
}

export function CommentsLayer({
  zoom,
  threads,
  anchorRects,
  target,
  activeId,
  onSelectThread,
  onCreate,
  onReply,
  onResolve,
  onCancelTarget,
}: CommentsLayerProps): JSX.Element {
  // Number threads in creation order (sortable ids), like Figma's pin numbers.
  const ordered = [...threads].sort((a, b) => a.id.localeCompare(b.id));
  const numberOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const rectFor = (t: CommentThread): Rect | null => anchorRects[t.anchor.fingerprint] ?? null;
  const anchored = ordered.filter((t) => rectFor(t));
  const unanchored = ordered.filter((t) => !rectFor(t));
  const active = ordered.find((t) => t.id === activeId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* Pins on their anchored sections. */}
      {anchored.map((t) => {
        const r = rectFor(t)!;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectThread(t.id === activeId ? null : t.id)}
            title={t.anchor.label}
            style={{ left: r.x * zoom, top: r.y * zoom }}
            className={`pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full rounded-bl-none border text-[11px] font-semibold shadow ${
              t.resolved
                ? "border-vs-border-default bg-vs-bg-elevated text-vs-text-muted"
                : "border-white bg-vs-accent text-white"
            } ${t.id === activeId ? "ring-2 ring-vs-accent ring-offset-1" : ""}`}
          >
            {t.resolved ? "✓" : numberOf.get(t.id)}
          </button>
        );
      })}

      {/* New-thread composer at the just-clicked target. */}
      {target && (
        <PopoverCard rect={target.rect} zoom={zoom}>
          <div className="mb-1.5 text-[11px] font-medium text-vs-text-secondary">
            New comment on <span className="text-vs-text-primary">{target.label}</span>
          </div>
          <Composer
            autoFocus
            placeholder="Leave feedback… use @name to notify"
            submitLabel="Comment"
            onSubmit={(body) => onCreate(body)}
            onCancel={onCancelTarget}
          />
        </PopoverCard>
      )}

      {/* The open thread's popover, next to its pin (or centered if unanchored). */}
      {active && !target && (
        <PopoverCard rect={rectFor(active)} zoom={zoom}>
          <ThreadView thread={active} number={numberOf.get(active.id) ?? 0} onReply={onReply} onResolve={onResolve} onClose={() => onSelectThread(null)} />
        </PopoverCard>
      )}

      {/* Unanchored rail — threads whose element isn't on screen / this route. */}
      {unanchored.length > 0 && (
        <div className="pointer-events-auto absolute bottom-3 right-3 flex max-w-[200px] flex-col gap-1 rounded-md border border-vs-border-default bg-vs-bg-elevated p-1.5 shadow-lg">
          <span className="px-1 text-[10px] font-medium text-vs-text-muted">Not on this view</span>
          {unanchored.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectThread(t.id)}
              className="flex items-center gap-2 rounded px-1 py-1 text-left text-[11px] hover:bg-vs-bg-hover"
            >
              <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-vs-accent text-[9px] text-white">
                {t.resolved ? "✓" : numberOf.get(t.id)}
              </span>
              {t.anchor.thumbnail ? (
                <img src={t.anchor.thumbnail} alt="" className="h-6 w-8 flex-none rounded object-cover" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-vs-text-secondary">{t.anchor.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A screen-space card anchored near a guest rect (right of it, clamped on-screen). */
function PopoverCard({ rect, zoom, children }: { rect: Rect | null; zoom: number; children: React.ReactNode }): JSX.Element {
  const left = rect ? (rect.x + rect.width) * zoom + 8 : 16;
  const top = rect ? rect.y * zoom : 16;
  return (
    <div
      className="pointer-events-auto absolute w-[260px] rounded-lg border border-vs-border-default bg-vs-bg-elevated p-2.5 shadow-2xl"
      style={{ left, top, maxHeight: "70%", overflowY: "auto" }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ThreadView({
  thread,
  number,
  onReply,
  onResolve,
  onClose,
}: {
  thread: CommentThread;
  number: number;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-vs-accent text-[10px] font-semibold text-white">
          {number}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-vs-text-primary">{thread.anchor.label}</span>
        <button type="button" onClick={onClose} className="rounded px-1 text-vs-text-muted hover:bg-vs-bg-hover" aria-label="Close thread">
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {thread.messages.map((m) => (
          <li key={m.id} className="rounded bg-vs-bg-surface p-1.5">
            <div className="mb-0.5 text-[10px] font-medium text-vs-text-secondary">
              {m.author.name}
              {m.author.githubLogin ? ` · @${m.author.githubLogin}` : ""}
            </div>
            <div className="text-[12px] leading-snug text-vs-text-primary [&_p]:m-0">
              <Markdown text={m.body} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onResolve(thread.id, !thread.resolved)}
          className="rounded border border-vs-border-default px-2 py-0.5 text-[11px] text-vs-text-secondary hover:bg-vs-bg-hover"
        >
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>
      <Composer placeholder="Reply… use @name to notify" submitLabel="Reply" onSubmit={(body) => onReply(thread.id, body)} />
    </div>
  );
}

/** A small textarea + submit; Enter (no shift) submits, Escape cancels. */
function Composer({
  placeholder,
  submitLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = (): void => {
    const body = draft.trim();
    if (!body) return;
    onSubmit(body);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            onCancel?.();
          }
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
      />
      <div className="flex items-center justify-end gap-1.5">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-[11px] text-vs-text-secondary hover:bg-vs-bg-hover">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="rounded bg-vs-accent px-2.5 py-0.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
