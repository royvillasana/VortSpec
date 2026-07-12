import type { CommentThread } from "@vortspec/core/comment";

/**
 * Comments-panel filters (change: run-canvas-comments, Phase 5) — pure so the panel
 * stays a thin view and the narrowing is unit-tested.
 */
export type CommentFilter = "open" | "resolved" | "mentions-me" | "mine";

export const COMMENT_FILTERS: { key: CommentFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "mentions-me", label: "@me" },
  { key: "mine", label: "Mine" },
];

/** "Me" for the @me / Mine filters — the active GitHub login and/or display name. */
export interface Me {
  login: string | null;
  name: string;
}

/** Whether `me` authored the thread's first message. */
function isMine(thread: CommentThread, me: Me): boolean {
  const author = thread.messages[0]?.author;
  if (!author) return false;
  if (me.login && author.githubLogin === me.login) return true;
  return author.name === me.name;
}

/** Whether any message in the thread @mentions `me`. */
function mentionsMe(thread: CommentThread, me: Me): boolean {
  if (!me.login) return false;
  return thread.messages.some((m) => m.mentions.includes(me.login as string));
}

/** Narrow threads to the active filter (order preserved). */
export function filterThreads(threads: CommentThread[], filter: CommentFilter, me: Me): CommentThread[] {
  switch (filter) {
    case "open":
      return threads.filter((t) => !t.resolved);
    case "resolved":
      return threads.filter((t) => t.resolved);
    case "mentions-me":
      return threads.filter((t) => mentionsMe(t, me));
    case "mine":
      return threads.filter((t) => isMine(t, me));
  }
}
