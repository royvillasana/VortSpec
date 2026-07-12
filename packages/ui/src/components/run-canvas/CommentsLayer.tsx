import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { CommentThread, CommentCollaborator } from "@vortspec/core/comment";
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
  /** @mention autocomplete candidates. */
  collaborators?: CommentCollaborator[];
  /** The last notify outcome (success note or fix-it), shown as a dismissible toast. */
  notice?: { ok: boolean; text: string } | null;
  onClearNotice?: () => void;
  onSelectThread: (id: string | null) => void;
  onCreate: (body: string) => void;
  onReply: (threadId: string, body: string) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
  onCancelTarget: () => void;
  /** Push the auto-committed comment commits (manual Share). */
  onShare?: () => void;
}

export function CommentsLayer({
  zoom,
  threads,
  anchorRects,
  target,
  activeId,
  collaborators = [],
  notice = null,
  onClearNotice,
  onSelectThread,
  onCreate,
  onReply,
  onResolve,
  onCancelTarget,
  onShare,
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
      {/* Share — push the auto-committed comment commits (teammates pull to see them). */}
      {onShare && ordered.length > 0 && (
        <button
          type="button"
          onClick={onShare}
          title="Push the comment commits so teammates get them on pull"
          className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-1 text-[11px] font-medium text-vs-text-secondary shadow hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ⇪ Share comments
        </button>
      )}

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
            collaborators={collaborators}
            onSubmit={(body) => onCreate(body)}
            onCancel={onCancelTarget}
          />
        </PopoverCard>
      )}

      {/* The open thread's popover, next to its pin (or centered if unanchored). */}
      {active && !target && (
        <PopoverCard rect={rectFor(active)} zoom={zoom}>
          <ThreadView
            thread={active}
            number={numberOf.get(active.id) ?? 0}
            collaborators={collaborators}
            onReply={onReply}
            onResolve={onResolve}
            onClose={() => onSelectThread(null)}
          />
        </PopoverCard>
      )}

      {/* Notify outcome (e.g. "Notified on GitHub" or "connect GitHub to notify"). */}
      {notice && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-vs-border-default bg-vs-bg-elevated px-3 py-1.5 text-[11px] shadow">
          <span className={notice.ok ? "text-vs-text-secondary" : "text-vs-warning"}>{notice.text}</span>
          <button className="rounded px-1 text-vs-text-muted hover:bg-vs-bg-hover" onClick={onClearNotice} aria-label="Dismiss">
            ✕
          </button>
        </div>
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
  collaborators,
  onReply,
  onResolve,
  onClose,
}: {
  thread: CommentThread;
  number: number;
  collaborators: CommentCollaborator[];
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
            {m.notified?.github?.url && (
              <a
                href={m.notified.github.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-block text-[10px] text-vs-accent hover:underline"
              >
                Notified on GitHub ↗
              </a>
            )}
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
      <Composer
        placeholder="Reply… use @name to notify"
        submitLabel="Reply"
        collaborators={collaborators}
        onSubmit={(body) => onReply(thread.id, body)}
      />
    </div>
  );
}

/**
 * A small textarea + submit with @mention autocomplete. Typing `@` filters the
 * repo collaborators; picking one (click or Enter) inserts `@login`. Enter (no
 * shift) submits when the picker is closed; Escape cancels.
 */
function Composer({
  placeholder,
  submitLabel,
  autoFocus = false,
  collaborators = [],
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  collaborators?: CommentCollaborator[];
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // The `@partial` handle being typed at the caret (or null), and its matches.
  const upToCaret = draft.slice(0, caret);
  const mention = /(?:^|\s)@([A-Za-z\d-]*)$/.exec(upToCaret);
  const query = mention ? mention[1].toLowerCase() : null;
  const suggestions =
    query !== null
      ? collaborators
          .filter((c) => c.login.toLowerCase().includes(query) || (c.name ?? "").toLowerCase().includes(query))
          .slice(0, 6)
      : [];

  const insertMention = (login: string): void => {
    const at = upToCaret.lastIndexOf("@");
    const next = `${draft.slice(0, at)}@${login} ${draft.slice(caret)}`;
    const pos = at + login.length + 2;
    setDraft(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = (): void => {
    const body = draft.trim();
    if (!body) return;
    onSubmit(body);
    setDraft("");
    setCaret(0);
  };
  const syncCaret = (el: HTMLTextAreaElement): void => setCaret(el.selectionStart ?? el.value.length);

  return (
    <div className="relative flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          syncCaret(e.target);
        }}
        onClick={(e) => syncCaret(e.currentTarget)}
        onKeyUp={(e) => syncCaret(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (suggestions.length > 0) insertMention(suggestions[0].login);
            else submit();
          } else if (e.key === "Escape") {
            onCancel?.();
          }
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl">
          {suggestions.map((c) => (
            <li key={c.login}>
              <button
                type="button"
                onClick={() => insertMention(c.login)}
                className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[11px] hover:bg-vs-bg-hover"
              >
                <span className="font-medium text-vs-text-primary">@{c.login}</span>
                {c.name && <span className="truncate text-vs-text-muted">{c.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
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
