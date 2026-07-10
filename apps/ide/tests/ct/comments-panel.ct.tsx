import { test, expect } from "@playwright/experimental-ct-react";
import { CommentsPanel } from "@vortspec/ui/CommentsPanel";
import type { CommentThread } from "@vortspec/core/comment";

const noop = (): void => {};

const mk = (
  id: string,
  over: { resolved?: boolean; label?: string; author?: { name: string; githubLogin: string | null }; mentions?: string[]; fingerprint?: string } = {},
): CommentThread => ({
  id,
  anchor: { fingerprint: over.fingerprint ?? id, component: null, file: null, label: over.label ?? id, rectHint: { x: 0, y: 0, w: 1, h: 1 }, thumbnail: "", route: null },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  resolved: over.resolved ?? false,
  messages: [{ id: `${id}-m1`, author: over.author ?? { name: "Bob", githubLogin: "bob" }, body: "note", mentions: over.mentions ?? [], createdAt: "2026-07-11T00:00:00.000Z" }],
});

const THREADS = [
  mk("t1-open", { label: "Open one", resolved: false }),
  mk("t2-done", { label: "Done one", resolved: true }),
  mk("t3-me", { label: "Mentions me", mentions: ["ana"] }),
];
const RECTS = { "t1-open": { x: 0, y: 0, width: 10, height: 10 }, "t2-done": { x: 0, y: 0, width: 10, height: 10 }, "t3-me": { x: 0, y: 0, width: 10, height: 10 } };
const me = { login: "ana", name: "Ana" };

test("filters narrow the list", async ({ mount }) => {
  const c = await mount(
    <CommentsPanel threads={THREADS} anchorRects={RECTS} activeId={null} me={me} mode="comment" onModeChange={noop} onSelect={noop} onResolve={noop} />,
  );
  // Default filter is Open → the resolved thread is hidden.
  await expect(c.getByText("Open one")).toBeVisible();
  await expect(c.getByText("Done one")).toHaveCount(0);

  await c.getByRole("button", { name: "Resolved" }).click();
  await expect(c.getByText("Done one")).toBeVisible();
  await expect(c.getByText("Open one")).toHaveCount(0);

  await c.getByRole("button", { name: "@me" }).click();
  await expect(c.getByText("Mentions me")).toBeVisible();
  await expect(c.getByText("Open one")).toHaveCount(0);
});

test("clicking a thread jumps to its pin (selects it)", async ({ mount }) => {
  const selected: string[] = [];
  const c = await mount(
    <CommentsPanel threads={THREADS} anchorRects={RECTS} activeId={null} me={me} mode="comment" onModeChange={noop} onSelect={(t) => selected.push(t.id)} onResolve={noop} />,
  );
  await c.getByText("Open one").click();
  expect(selected).toEqual(["t1-open"]);
});

test("an unanchored thread is grouped under 'Not on this view'", async ({ mount }) => {
  const c = await mount(
    <CommentsPanel
      threads={THREADS}
      anchorRects={{ ...RECTS, "t1-open": null }}
      activeId={null}
      me={me}
      mode="comment"
      onModeChange={noop}
      onSelect={noop}
      onResolve={noop}
    />,
  );
  await expect(c.getByText(/Not on this view/)).toBeVisible();
});

test("the mode toggle can switch back out of comment mode", async ({ mount }) => {
  const modes: string[] = [];
  const c = await mount(
    <CommentsPanel threads={THREADS} anchorRects={RECTS} activeId={null} me={me} mode="comment" onModeChange={(m) => modes.push(m)} onSelect={noop} onResolve={noop} />,
  );
  await c.getByRole("button", { name: "inspect" }).click();
  expect(modes).toEqual(["inspect"]);
});
