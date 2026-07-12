import { describe, it, expect } from "vitest";
import { filterThreads, type Me } from "./comment-filters";
import type { CommentThread } from "@vortspec/core/comment";

const me: Me = { login: "ana", name: "Ana" };

const mk = (id: string, over: Partial<CommentThread> & { author?: { name: string; githubLogin: string | null }; mentions?: string[] } = {}): CommentThread => ({
  id,
  anchor: { fingerprint: "fp", component: null, file: null, label: "X", rectHint: { x: 0, y: 0, w: 1, h: 1 }, thumbnail: "", route: null },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  resolved: over.resolved ?? false,
  messages: [
    {
      id: `${id}-m1`,
      author: over.author ?? { name: "Bob", githubLogin: "bob" },
      body: "hi",
      mentions: over.mentions ?? [],
      createdAt: "2026-07-11T00:00:00.000Z",
    },
  ],
});

describe("filterThreads", () => {
  const threads = [
    mk("open", { resolved: false }),
    mk("done", { resolved: true }),
    mk("mentionsAna", { mentions: ["ana"] }),
    mk("byAna", { author: { name: "Ana", githubLogin: "ana" } }),
  ];

  it("Open shows unresolved only", () => {
    expect(filterThreads(threads, "open", me).map((t) => t.id)).toEqual(["open", "mentionsAna", "byAna"]);
  });
  it("Resolved shows resolved only", () => {
    expect(filterThreads(threads, "resolved", me).map((t) => t.id)).toEqual(["done"]);
  });
  it("@me shows threads mentioning my login", () => {
    expect(filterThreads(threads, "mentions-me", me).map((t) => t.id)).toEqual(["mentionsAna"]);
  });
  it("Mine shows threads I authored (by login or name)", () => {
    expect(filterThreads(threads, "mine", me).map((t) => t.id)).toEqual(["byAna"]);
    expect(filterThreads(threads, "mine", { login: null, name: "Ana" }).map((t) => t.id)).toEqual(["byAna"]);
  });
});
