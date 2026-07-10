import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderAuth } from "@vortspec/core/git";
import type { CommentThread } from "@vortspec/core/comment";

// The GitHub provider is stubbed so notify()'s degradation paths are deterministic
// (no real `gh`, no network) — the store round-trip is real (temp dir).
vi.mock("../git/github", () => ({
  getGithubAuth: vi.fn(),
  parseGithubUrl: () => null,
}));
import { getGithubAuth } from "../git/github";
import { chooseSurface, buildNotifyBody, notify } from "./comment-mentions";
import { upsertThread } from "./comment-store";

const auth = (over: Partial<ProviderAuth>): ProviderAuth => ({
  provider: "github",
  cliInstalled: true,
  authenticated: true,
  accounts: ["me"],
  activeAccount: "me",
  hint: null,
  ...over,
});

const thread = (over: Partial<CommentThread> = {}): CommentThread => ({
  id: "t1abc-000",
  anchor: {
    fingerprint: "fp",
    component: "Button",
    file: "src/Button.tsx",
    label: "Button in Header",
    rectHint: { x: 0, y: 0, w: 1, h: 1 },
    thumbnail: "",
    route: "/pricing",
  },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  resolved: false,
  messages: [
    { id: "m1", author: { name: "Ana", githubLogin: "ana" }, body: "@bob make this lg", mentions: ["bob"], createdAt: "2026-07-11T00:00:00.000Z" },
  ],
  ...over,
});

describe("chooseSurface — prefer an open PR, else the rolling issue", () => {
  it("posts to an open PR over any issue", () => {
    expect(chooseSurface({ number: 7, state: "OPEN" }, [{ number: 3 }])).toEqual({ kind: "pr", number: 7 });
  });
  it("falls back to the issue when the PR is not open", () => {
    expect(chooseSurface({ number: 7, state: "MERGED" }, [{ number: 3 }])).toEqual({ kind: "issue", number: 3 });
    expect(chooseSurface(null, [{ number: 3 }])).toEqual({ kind: "issue", number: 3 });
  });
  it("creates the rolling issue when there's neither", () => {
    expect(chooseSurface(null, [])).toEqual({ kind: "create" });
  });
});

describe("buildNotifyBody", () => {
  it("carries the message (its @handles notify), the section label, route and file", () => {
    const body = buildNotifyBody(thread(), thread().messages[0]);
    expect(body).toContain("@bob make this lg");
    expect(body).toContain("Button in Header");
    expect(body).toContain("/pricing");
    expect(body).toContain("src/Button.tsx");
  });
});

describe("notify — graceful degradation (never throws)", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vs-notify-"));
    vi.mocked(getGithubAuth).mockReset();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("does nothing (no error) when the message has no @mentions", async () => {
    await upsertThread(root, thread({ messages: [{ id: "m1", author: { name: "Ana", githubLogin: null }, body: "no ping", mentions: [], createdAt: "2026-07-11T00:00:00.000Z" }] }));
    const res = await notify(root, "t1abc-000", "m1");
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/No @mentions/);
  });

  it("returns a sign-in fix-it (not a throw) when gh is signed out", async () => {
    vi.mocked(getGithubAuth).mockResolvedValue(auth({ authenticated: false }));
    await upsertThread(root, thread());
    const res = await notify(root, "t1abc-000", "m1");
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/Sign in to GitHub/);
  });

  it("returns a no-remote fix-it when the repo isn't on GitHub", async () => {
    // Authed, but the temp dir has no GitHub remote → `gh repo view` fails → fix-it.
    vi.mocked(getGithubAuth).mockResolvedValue(auth({}));
    await upsertThread(root, thread());
    const res = await notify(root, "t1abc-000", "m1");
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/no GitHub remote/);
  });

  it("returns a not-found fix-it for a missing comment", async () => {
    const res = await notify(root, "nope", "nope");
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/could not be found/i);
  });
});
