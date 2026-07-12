import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSafe } from "../util/exec";
import { commitCommentFile, shareComments, postComment } from "./comment-sync";
import { threadRelPath } from "./comment-store";
import type { CommentThread } from "@vortspec/core/comment";

const run = (cwd: string, ...args: string[]) => execFileSafe("git", args, { cwd, timeoutMs: 30_000 });

const thread = (over: Partial<CommentThread> = {}): CommentThread => ({
  id: "t1abc-000",
  anchor: { fingerprint: "fp", component: null, file: null, label: "Card title", rectHint: { x: 0, y: 0, w: 1, h: 1 }, thumbnail: "", route: null },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  resolved: false,
  messages: [{ id: "m1", author: { name: "Dev", githubLogin: null }, body: "hi", mentions: [], createdAt: "2026-07-11T00:00:00.000Z" }],
  ...over,
});

describe("comment-sync (auto-commit + Share)", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vs-sync-"));
    await run(root, "init");
    await run(root, "config", "user.email", "t@example.com");
    await run(root, "config", "user.name", "Tester");
    await run(root, "commit", "--allow-empty", "-m", "root");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("commits ONLY the comment file — never the user's other staged work", async () => {
    // The user has an unrelated change staged.
    await writeFile(join(root, "other.txt"), "user work", "utf8");
    await run(root, "add", "other.txt");

    await postComment(root, thread());

    // HEAD contains the comment file, not other.txt…
    const show = await run(root, "show", "--name-only", "--format=", "HEAD");
    expect(show.stdout).toContain(".vortspec/comments/t1abc-000.json");
    expect(show.stdout).not.toContain("other.txt");
    // …and other.txt is still staged, uncommitted.
    const status = await run(root, "status", "--porcelain");
    expect(status.stdout).toMatch(/A\s+other\.txt/);
  });

  it("writes a scoped `vortspec(comment):` message", async () => {
    await postComment(root, thread());
    const log = await run(root, "log", "-1", "--format=%s");
    expect(log.stdout.trim()).toBe("vortspec(comment): Card title");
  });

  it("is a graceful no-op when the file didn't change", async () => {
    await postComment(root, thread());
    const again = await commitCommentFile(root, threadRelPath("t1abc-000"), "Card title");
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/No comment changes/);
  });

  it("degrades to a fix-it (never throws) outside a git repo", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "vs-nonrepo-"));
    try {
      expect((await commitCommentFile(nonRepo, "x.json", "s")).ok).toBe(false);
      const share = await shareComments(nonRepo);
      expect(share.ok).toBe(false);
      expect(share.message).toMatch(/Not a git repository/);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  it("Share surfaces a push error as a fix-it (no upstream configured)", async () => {
    await postComment(root, thread());
    const res = await shareComments(root); // no remote → push fails, but no throw
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe("string");
  });
});
