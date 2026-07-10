import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listThreads, upsertThread, resolveThread, threadRelPath } from "./comment-store";
import type { CommentThread, CommentMessage } from "@vortspec/core/comment";

function msg(id: string, body = "hi"): CommentMessage {
  return { id, author: { name: "Dev", githubLogin: "dev" }, body, mentions: [], createdAt: "2026-07-11T00:00:00.000Z" };
}

function thread(over: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "t1abc-000",
    anchor: {
      fingerprint: "header:1>button:2",
      component: "Button",
      file: "src/Button.tsx",
      label: "Button in Header",
      rectHint: { x: 10, y: 20, w: 80, h: 30 },
      thumbnail: "",
      route: "/",
    },
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    resolved: false,
    messages: [msg("m1")],
    ...over,
  };
}

describe("comment-store", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vs-comments-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips a thread through the repo file and lands under .vortspec/comments/", async () => {
    const { path } = await upsertThread(root, thread());
    expect(path).toBe(".vortspec/comments/t1abc-000.json");
    // The file physically lives under .vortspec/comments/.
    expect(await readdir(join(root, ".vortspec/comments"))).toEqual(["t1abc-000.json"]);
    const [got] = await listThreads(root);
    expect(got.anchor.component).toBe("Button");
    expect(got.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("lists nothing when there is no comments dir yet", async () => {
    expect(await listThreads(root)).toEqual([]);
  });

  it("appends a new message without clobbering the on-disk one (concurrent replies)", async () => {
    await upsertThread(root, thread({ messages: [msg("m1")] }));
    // Someone else already appended m3 to the file…
    await upsertThread(root, thread({ messages: [msg("m1"), msg("m3")] }));
    // …and we post m2 against the original [m1] base.
    const { thread: merged } = await upsertThread(root, thread({ messages: [msg("m1"), msg("m2")] }));
    expect(merged.messages.map((m) => m.id).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps the stored copy of a message already on disk (append-only, immutable)", async () => {
    await upsertThread(root, thread({ messages: [msg("m1", "original")] }));
    await upsertThread(root, thread({ messages: [msg("m1", "TAMPERED")] }));
    const [got] = await listThreads(root);
    expect(got.messages[0].body).toBe("original");
  });

  it("resolves + reopens a thread and stamps updatedAt", async () => {
    await upsertThread(root, thread());
    const res = await resolveThread(root, "t1abc-000", true);
    expect(res?.thread.resolved).toBe(true);
    expect(res?.thread.updatedAt).not.toBe("2026-07-11T00:00:00.000Z");
    expect((await listThreads(root))[0].resolved).toBe(true);
    await resolveThread(root, "t1abc-000", false);
    expect((await listThreads(root))[0].resolved).toBe(false);
  });

  it("returns null resolving a thread that doesn't exist", async () => {
    expect(await resolveThread(root, "nope-000", true)).toBeNull();
  });

  it("refuses a thread id that is a path (traversal guard)", async () => {
    await expect(upsertThread(root, thread({ id: "../evil" }))).rejects.toThrow(/Invalid comment id/);
    expect(() => threadRelPath("a/b")).toThrow(/Invalid comment id/);
  });

  it("skips a corrupt thread file instead of failing the list", async () => {
    await upsertThread(root, thread());
    await (await import("node:fs/promises")).writeFile(join(root, ".vortspec/comments/bad.json"), "{ not json", "utf8");
    const list = await listThreads(root);
    expect(list.map((t) => t.id)).toEqual(["t1abc-000"]);
  });
});
