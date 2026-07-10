import { execFileSafe } from "../util/exec";
import { isRepo, push } from "../git/git-adapter";
import { upsertThread, resolveThread } from "./comment-store";
import type { GitResult } from "@vortspec/core/git";
import type { CommentThread } from "@vortspec/core/comment";

/**
 * Comment sync (change: run-canvas-comments, Phase 4).
 *
 * Comments are files in the project repo, so sync = commit + push; a teammate sees
 * them on `git pull`. Per decision #4: posting/resolving **auto-commits the single
 * comment file** (never the user's other staged work) but does **not** push — the
 * user pushes explicitly via **Share**, so there are no surprise network writes.
 * Every path degrades to a fix-it; nothing here throws.
 */

async function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const r = await execFileSafe("git", args, { cwd, timeoutMs: 30_000 });
  return { ok: !r.spawnError && r.code === 0, stdout: r.stdout, stderr: r.stderr };
}

/**
 * Auto-commit ONLY the single comment file — `git commit -- <path>` commits just
 * that pathspec, leaving any other staged changes the user has untouched. A
 * graceful no-op when the project isn't a git repo or the file didn't change.
 */
export async function commitCommentFile(projectPath: string, relPath: string, summary: string): Promise<GitResult> {
  if (!(await isRepo(projectPath))) return { ok: false, message: "Not a git repository — the comment is saved as a file." };
  const add = await git(projectPath, ["add", "--", relPath]); // track a new file
  if (!add.ok) return { ok: false, message: add.stderr.trim() || "Could not stage the comment." };
  const co = await git(projectPath, ["commit", "-m", `vortspec(comment): ${summary}`, "--", relPath]);
  if (co.ok) return { ok: true, message: "Committed the comment." };
  if (/nothing to commit|no changes added|nothing added/i.test(`${co.stdout}\n${co.stderr}`)) {
    return { ok: true, message: "No comment changes to commit." };
  }
  return { ok: false, message: co.stderr.trim() || "Could not commit the comment." };
}

/** Push the committed comments (manual Share). Surfaces push errors as fix-its. */
export async function shareComments(projectPath: string): Promise<GitResult> {
  if (!(await isRepo(projectPath))) return { ok: false, message: "Not a git repository — nothing to share." };
  return push(projectPath);
}

/** Upsert a thread, then auto-commit just its file. Returns the stored thread + path. */
export async function postComment(
  projectPath: string,
  thread: CommentThread,
): Promise<{ thread: CommentThread; path: string }> {
  const res = await upsertThread(projectPath, thread);
  await commitCommentFile(projectPath, res.path, res.thread.anchor.label);
  return res;
}

/** Resolve/reopen a thread, then auto-commit just its file. Null if it doesn't exist. */
export async function resolveComment(
  projectPath: string,
  id: string,
  resolved: boolean,
): Promise<{ thread: CommentThread; path: string } | null> {
  const res = await resolveThread(projectPath, id, resolved);
  if (res) await commitCommentFile(projectPath, res.path, `${resolved ? "resolve" : "reopen"} ${res.thread.anchor.label}`);
  return res;
}
