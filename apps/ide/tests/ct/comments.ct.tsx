import { test, expect } from "@playwright/experimental-ct-react";
import { CommentsLayer } from "@vortspec/ui/CommentsLayer";
import type { CommentThread } from "@vortspec/core/comment";

const thread = (over: Partial<CommentThread> = {}): CommentThread => ({
  id: "t1abc-000",
  anchor: {
    fingerprint: "header:1>button:2",
    component: "Button",
    file: "src/Button.tsx",
    label: "Button in Header",
    rectHint: { x: 40, y: 20, w: 80, h: 30 },
    thumbnail: "",
    route: null,
  },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  resolved: false,
  messages: [
    { id: "m1", author: { name: "Ana", githubLogin: "ana" }, body: "this padding is too tight", mentions: [], createdAt: "2026-07-11T00:00:00.000Z" },
  ],
  ...over,
});

const noop = (): void => {};

test("comment mode: clicking a target opens a composer that posts a new thread", async ({ mount }) => {
  const posted: string[] = [];
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[]}
      anchorRects={{}}
      target={{ fingerprint: "fp", label: "Card title", component: "Card", rect: { x: 10, y: 10, width: 100, height: 40 } }}
      activeId={null}
      onSelectThread={noop}
      onCreate={(b) => posted.push(b)}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  await expect(c.getByText(/New comment on/)).toBeVisible();
  await c.getByRole("textbox").fill("make this the lg variant");
  await c.getByRole("button", { name: "Comment" }).click();
  expect(posted).toEqual(["make this the lg variant"]);
});

test("a thread renders a numbered pin at its anchored rect; a resolved thread shows a check", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[thread(), thread({ id: "t2def-000", resolved: true, anchor: { ...thread().anchor, fingerprint: "footer:1" } })]}
      anchorRects={{ "header:1>button:2": { x: 40, y: 20, width: 80, height: 30 }, "footer:1": { x: 10, y: 90, width: 60, height: 20 } }}
      target={null}
      activeId={null}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  await expect(c.getByRole("button", { name: "1" })).toBeVisible(); // open thread → number
  await expect(c.getByRole("button", { name: "✓" })).toBeVisible(); // resolved thread → check
});

test("clicking the pin (active thread) shows the message + a resolve toggle", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[thread()]}
      anchorRects={{ "header:1>button:2": { x: 40, y: 20, width: 80, height: 30 } }}
      target={null}
      activeId="t1abc-000"
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  await expect(c.getByText("this padding is too tight")).toBeVisible();
  await expect(c.getByText(/Ana/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Resolve" })).toBeVisible();
});

test("@mention autocomplete filters collaborators and inserts the handle", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[]}
      anchorRects={{}}
      target={{ fingerprint: "fp", label: "Card", component: "Card", rect: { x: 10, y: 10, width: 100, height: 40 } }}
      activeId={null}
      collaborators={[
        { login: "ana", name: "Ana Reyes", avatar: null },
        { login: "bob", name: "Bob Lin", avatar: null },
      ]}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  const box = c.getByRole("textbox");
  await box.fill("please @a");
  await expect(c.getByRole("button", { name: /@ana/ })).toBeVisible();
  await c.getByRole("button", { name: /@ana/ }).click();
  await expect(box).toHaveValue("please @ana ");
});

test("Share pushes the auto-committed comment commits", async ({ mount }) => {
  let shared = 0;
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[thread()]}
      anchorRects={{ "header:1>button:2": { x: 40, y: 20, width: 80, height: 30 } }}
      target={null}
      activeId={null}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
      onShare={() => (shared += 1)}
    />,
  );
  await c.getByRole("button", { name: /Share comments/ }).click();
  expect(shared).toBe(1);
});

test("the notify outcome is shown as a dismissible notice", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[]}
      anchorRects={{}}
      target={null}
      activeId={null}
      notice={{ ok: false, text: "Sign in to GitHub to notify @mentions." }}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  await expect(c.getByText(/Sign in to GitHub to notify/)).toBeVisible();
});

test("a notified message links out to its GitHub thread", async ({ mount }) => {
  const notified = thread({
    messages: [
      {
        id: "m1",
        author: { name: "Ana", githubLogin: "ana" },
        body: "@bob take a look",
        mentions: ["bob"],
        createdAt: "2026-07-11T00:00:00.000Z",
        notified: { github: { issue: 42, url: "https://github.com/o/r/issues/42" } },
      },
    ],
  });
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[notified]}
      anchorRects={{ "header:1>button:2": { x: 40, y: 20, width: 80, height: 30 } }}
      target={null}
      activeId="t1abc-000"
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  const link = c.getByRole("link", { name: /Notified on GitHub/ });
  await expect(link).toHaveAttribute("href", "https://github.com/o/r/issues/42");
});

test("a thread whose anchor is lost drops to the unanchored rail, not a pin", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[thread()]}
      anchorRects={{ "header:1>button:2": null }}
      target={null}
      activeId={null}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  await expect(c.getByText(/Not on this view/)).toBeVisible();
  await expect(c.getByText("Button in Header")).toBeVisible();
});

test("the pin re-anchors when the guest re-emits a moved rect (post re-render)", async ({ mount }) => {
  const c = await mount(
    <CommentsLayer
      zoom={1}
      threads={[thread()]}
      anchorRects={{ "header:1>button:2": { x: 40, y: 20, width: 80, height: 30 } }}
      target={null}
      activeId={null}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  const pin = c.getByRole("button", { name: "1" });
  const before = await pin.boundingBox();
  // A re-render moved the element — the guest re-emits anchorRects at the new rect.
  await c.update(
    <CommentsLayer
      zoom={1}
      threads={[thread()]}
      anchorRects={{ "header:1>button:2": { x: 200, y: 120, width: 80, height: 30 } }}
      target={null}
      activeId={null}
      onSelectThread={noop}
      onCreate={noop}
      onReply={noop}
      onResolve={noop}
      onCancelTarget={noop}
    />,
  );
  const after = await c.getByRole("button", { name: "1" }).boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 100);
});
