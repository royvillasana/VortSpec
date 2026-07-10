import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveInside } from "./fs-workspace";
import {
  commentThreadSchema,
  type CommentThread,
  type CommentMessage,
  type NotifyReceipt,
} from "@vortspec/core/comment";

/**
 * Repo-backed comment store (change: run-canvas-comments).
 *
 * Comment threads live as one plain JSON file per thread under the project's own
 * repo (`.vortspec/comments/<id>.json`) — git-friendliest shape: different sections
 * touch different files, replies are additive. Every path resolves strictly inside
 * `.vortspec/comments/` (reusing `resolveInside` + a bare-id guard); this module
 * never reads or writes anything else in the project.
 */

const COMMENTS_DIR = ".vortspec/comments";

/** A thread id must be a bare filename segment — never a path fragment. */
function safeId(id: string): string {
  if (id === "." || id === ".." || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Invalid comment id.");
  return id;
}

/** Absolute path of a thread file, guarded to stay inside the comments dir. */
function fileFor(root: string, id: string): string {
  return resolveInside(root, join(COMMENTS_DIR, `${safeId(id)}.json`));
}

/** Project-relative path of a thread file (for the git layer / receipts). */
export function threadRelPath(id: string): string {
  return `${COMMENTS_DIR}/${safeId(id)}.json`;
}

/** Every valid thread in the project, oldest first (sortable ids ≈ chronological). */
export async function listThreads(root: string): Promise<CommentThread[]> {
  let names: string[];
  try {
    names = await readdir(resolveInside(root, COMMENTS_DIR));
  } catch {
    return []; // no comments dir yet → no threads
  }
  const threads: CommentThread[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(resolveInside(root, join(COMMENTS_DIR, name)), "utf8");
      const parsed = commentThreadSchema.safeParse(JSON.parse(raw));
      if (parsed.success) threads.push(parsed.data);
    } catch {
      /* skip an unreadable/corrupt thread file rather than fail the whole list */
    }
  }
  return threads.sort((a, b) => a.id.localeCompare(b.id));
}

async function readThread(root: string, id: string): Promise<CommentThread | null> {
  try {
    const raw = await readFile(fileFor(root, id), "utf8");
    const parsed = commentThreadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeThread(root: string, thread: CommentThread): Promise<string> {
  await mkdir(resolveInside(root, COMMENTS_DIR), { recursive: true });
  await writeFile(fileFor(root, thread.id), JSON.stringify(thread, null, 2) + "\n", "utf8");
  return threadRelPath(thread.id);
}

/** Union messages by id, keeping the on-disk (immutable) copy of any that already exist. */
function mergeMessages(onDisk: CommentMessage[], incoming: CommentMessage[]): CommentMessage[] {
  const seen = new Set(onDisk.map((m) => m.id));
  return [...onDisk, ...incoming.filter((m) => !seen.has(m.id))];
}

/**
 * Create or update a thread. Messages are append-only: any message already on disk
 * keeps its stored copy and only genuinely-new messages are appended — so two
 * replies posted against the same base don't clobber each other. Returns the merged
 * thread + its project-relative path (for the git layer to stage just this file).
 */
export async function upsertThread(
  root: string,
  thread: CommentThread,
): Promise<{ thread: CommentThread; path: string }> {
  const existing = await readThread(root, thread.id);
  // Append messages, but keep the DISK's resolved/anchor/createdAt — a stale client
  // posting a reply must not revert a concurrent Resolve (that has its own path).
  const merged: CommentThread = existing
    ? { ...existing, updatedAt: thread.updatedAt, messages: mergeMessages(existing.messages, thread.messages) }
    : thread;
  const path = await writeThread(root, merged);
  return { thread: merged, path };
}

/**
 * Stamp a notification receipt onto an existing message (a metadata update that
 * bypasses the append-only merge). Null if the thread/message doesn't exist.
 */
export async function setMessageNotified(
  root: string,
  threadId: string,
  messageId: string,
  notified: NotifyReceipt,
): Promise<CommentThread | null> {
  const existing = await readThread(root, threadId);
  if (!existing || !existing.messages.some((m) => m.id === messageId)) return null;
  const next: CommentThread = {
    ...existing,
    messages: existing.messages.map((m) => (m.id === messageId ? { ...m, notified } : m)),
  };
  await writeThread(root, next);
  return next;
}

/** Flip a thread's resolved state (stamping `updatedAt`); null if it doesn't exist. */
export async function resolveThread(
  root: string,
  id: string,
  resolved: boolean,
): Promise<{ thread: CommentThread; path: string } | null> {
  const existing = await readThread(root, id);
  if (!existing) return null;
  const next: CommentThread = { ...existing, resolved, updatedAt: new Date().toISOString() };
  const path = await writeThread(root, next);
  return { thread: next, path };
}
