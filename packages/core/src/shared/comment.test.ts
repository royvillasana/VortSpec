import { describe, it, expect } from "vitest";
import { parseMentions, commentThreadSchema } from "./comment";

describe("parseMentions", () => {
  it("extracts @handles from a body, deduped + order-preserving", () => {
    expect(parseMentions("hey @ana and @bob, also @ana again")).toEqual(["ana", "bob"]);
  });
  it("ignores an @ mid-word (an email) but reads one after punctuation", () => {
    expect(parseMentions("ping user@example.com")).toEqual([]);
    expect(parseMentions("(@carol) look")).toEqual(["carol"]);
  });
  it("accepts GitHub-style handles with hyphens, not leading/trailing ones", () => {
    expect(parseMentions("@a-b-c done")).toEqual(["a-b-c"]);
  });
  it("returns nothing when there are no mentions", () => {
    expect(parseMentions("just a plain comment")).toEqual([]);
  });
});

describe("commentThreadSchema", () => {
  it("applies defaults for optional anchor/message fields", () => {
    const parsed = commentThreadSchema.parse({
      id: "t1",
      anchor: { fingerprint: "fp", label: "X", rectHint: { x: 0, y: 0, w: 1, h: 1 } },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      messages: [{ id: "m1", author: { name: "Dev" }, body: "hi", createdAt: "2026-07-11T00:00:00.000Z" }],
    });
    expect(parsed.resolved).toBe(false);
    expect(parsed.anchor.component).toBeNull();
    expect(parsed.anchor.thumbnail).toBe("");
    expect(parsed.messages[0].mentions).toEqual([]);
    expect(parsed.messages[0].author.githubLogin).toBeNull();
  });
});
