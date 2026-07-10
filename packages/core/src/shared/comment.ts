import { z } from "zod";

/**
 * Run-Canvas comments (change: run-canvas-comments) — shared contracts.
 *
 * A comment is anchored to a *section of the live app* and stored as a plain file
 * in the project's own Git repo (`.vortspec/comments/<id>.json`), so teammates see
 * it on `git pull` — no VortSpec server, no accounts. Mentions notify through the
 * user's own GitHub (Phase 3). These zod schemas are the single source of truth for
 * the wire (IPC) and the on-disk file; everything is validated at the boundary.
 */

/** Where a comment points: a stable node fingerprint + human/context hints for re-anchoring. */
export const anchorSchema = z.object({
  /** The Run-Canvas Phase-1 serializable DOM-path fingerprint (re-anchors across renders). */
  fingerprint: z.string(),
  /** Resolved component name (`data-component`/heuristic), when known. */
  component: z.string().nullable().default(null),
  /** Source file of the component, when known. */
  file: z.string().nullable().default(null),
  /** Human label — "Button in Header", "Card title". */
  label: z.string(),
  /** Last-seen viewport-relative rect, for fallback placement when the fingerprint is lost. */
  rectHint: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  /** Small (~160px) data-URL screenshot of the element (webview capturePage crop). */
  thumbnail: z.string().default(""),
  /** The app route/path the pin was made on (for multi-page apps), when known. */
  route: z.string().nullable().default(null),
});
export type Anchor = z.infer<typeof anchorSchema>;

/** The GitHub notification receipt for a mention (so we don't double-post + can link out). */
export const notifyReceiptSchema = z.object({
  github: z.object({ issue: z.number(), url: z.string() }).optional(),
});
export type NotifyReceipt = z.infer<typeof notifyReceiptSchema>;

/** One message in a thread. Messages are append-only + immutable once written. */
export const commentMessageSchema = z.object({
  id: z.string(),
  author: z.object({
    name: z.string(),
    githubLogin: z.string().nullable().default(null),
    avatar: z.string().optional(),
  }),
  /** Markdown; `@handles` are plain-text tokens. */
  body: z.string(),
  /** GitHub logins extracted from the body (for the notification). */
  mentions: z.array(z.string()).default([]),
  createdAt: z.string(),
  /** Notification receipt, set once the mention was posted to GitHub. */
  notified: notifyReceiptSchema.optional(),
});
export type CommentMessage = z.infer<typeof commentMessageSchema>;

/** A comment thread: one anchored conversation, one file on disk. */
export const commentThreadSchema = z.object({
  /** Sortable, locally-generated id (also the file stem). */
  id: z.string(),
  anchor: anchorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  resolved: z.boolean().default(false),
  messages: z.array(commentMessageSchema).default([]),
});
export type CommentThread = z.infer<typeof commentThreadSchema>;

// ── Mentions + notification wire shapes (Phase 3) ──────────────────────────────

/** A repo collaborator/contributor offered in the @mention autocomplete. */
export const commentCollaboratorSchema = z.object({
  login: z.string(),
  name: z.string().nullable().default(null),
  avatar: z.string().nullable().default(null),
});
export type CommentCollaborator = z.infer<typeof commentCollaboratorSchema>;

/** Result of a notify attempt — a receipt, or a graceful fix-it reason (never a throw). */
export const notifyResultSchema = z.object({
  notified: z.boolean(),
  /** The GitHub issue/PR URL when notified. */
  url: z.string().optional(),
  /** A human, next-step reason when NOT notified (e.g. "no GitHub remote"). */
  reason: z.string().optional(),
});
export type NotifyResult = z.infer<typeof notifyResultSchema>;

/**
 * A sortable, locally-generated id (timestamp prefix in base36 → lexicographic order
 * ≈ chronological, plus a random suffix). Used for thread + message ids.
 */
export function newCommentId(): string {
  const ts = Date.now().toString(36).padStart(9, "0");
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

/** Extract `@handle` GitHub logins from a message body (deduped, order-preserving). */
export function parseMentions(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/(?:^|[^\w/])@([A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?)/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
