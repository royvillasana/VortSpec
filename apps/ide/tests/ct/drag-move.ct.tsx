import { test, expect } from "@playwright/experimental-ct-react";
import { MoveHarness } from "./support/move-harness";
import type { RunEvent } from "@vortspec/core/run-events";

// A move run that relocates the element and reports the destination file (N=1).
const MOVED_JSON = JSON.stringify({
  options: [{ index: 0, title: "Moved Card", axis: "relocation", componentsUsed: ["Card"] }],
  fewerReason: null,
  noMatch: null,
  stopped: null,
  writtenFile: "src/Home.tsx",
});
const runWith = (text: string): RunEvent[] => [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read", "Edit", "Write"], mcpServers: [], mcpErrors: [] },
  { kind: "result", isError: false, text, sessionId: "s" },
];

const composeOps = (c: import("@playwright/test").Locator): Promise<Array<Record<string, unknown>>> =>
  c.page().evaluate(() => (window as unknown as { __composeOps: Array<Record<string, unknown>> }).__composeOps);
const bridgeOps = (c: import("@playwright/test").Locator): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __bridgeOps?: string[] }).__bridgeOps ?? []);
const runPrompts = (c: import("@playwright/test").Locator): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);

test("a drop registers the move instantly — Keep/Revert, no run yet", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``) } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  // The element is already moved (the guest did it) — the panel gates it.
  await expect(c.getByTestId("move-review")).toContainText("Moved here");
  await expect(c.getByRole("button", { name: "Keep" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Revert" })).toBeVisible();
  // No agent run started just from dropping.
  expect(await runPrompts(c)).toEqual([]);
});

test("Keep is the one action: reconciles, auto-accepts keepOption 0, reloads (no 2nd prompt)", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``) } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Keep" }).click();
  // The whole keep chain (snapshot → run → auto-accept → reload) is async; the recorded
  // reload marks it settled. Keep forgets the ephemeral move + reloads real source.
  await expect.poll(() => bridgeOps(c)).toEqual(expect.arrayContaining(["clear", "reload"]));
  const sent = await runPrompts(c);
  expect(sent[0]).toContain("This is a MOVE");
  expect(sent[0]).toContain("option=0"); // a single option scaffold
  const ops = await composeOps(c);
  expect(ops.find((o) => o.op === "accept")).toMatchObject({ file: "src/Home.tsx", keepOption: 0 });
  // The move panel is gone — no second "save the screen spec" prompt.
  await expect(c.getByTestId("move-panel")).toHaveCount(0);
});

test("Revert undoes the move — nothing written, no run", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``) } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Revert" }).click();
  // The guest was told to put the element back; no run, no accept.
  expect(await bridgeOps(c)).toContain("revert");
  expect(await runPrompts(c)).toEqual([]);
  expect((await composeOps(c)).some((o) => o.op === "accept")).toBe(false);
});

test("an ambiguous Keep stops with a sentence; the element stays moved (Revert only)", async ({ mount }) => {
  const stopped = JSON.stringify({
    options: [],
    stopped: { reason: "The element's JSX matched two <Card> siblings.", candidates: ["Home.tsx:20", "Home.tsx:41"] },
    writtenFile: null,
  });
  const c = await mount(<MoveHarness />, { hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${stopped}\n\`\`\``) } } });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Keep" }).click();
  await expect(c.getByTestId("move-error")).toContainText("two <Card> siblings");
  await expect(c.getByTestId("move-error")).toContainText("Home.tsx:20");
  await expect(c.getByRole("button", { name: "Keep" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Revert" })).toBeVisible();
  // Nothing accepted — the move was never written to source.
  expect((await composeOps(c)).some((o) => o.op === "accept")).toBe(false);
});

test("a generated/ignored destination is refused on Keep, Revert only", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``), composeTargetOk: false } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Keep" }).click();
  await expect(c.getByTestId("move-error")).toContainText("git-ignored");
  await expect(c.getByRole("button", { name: "Keep" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Revert" })).toBeVisible();
});

test("Stopping an in-flight Keep restores the snapshot and reverts the DOM", async ({ mount }) => {
  // A run that never finishes → the reconcile stays in flight so Stop is stable.
  const stuck: RunEvent[] = [
    { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read"], mcpServers: [], mcpErrors: [] },
  ];
  const c = await mount(<MoveHarness />, {
    hooksConfig: {
      mock: {
        runScript: stuck,
        snapshot: [
          { path: "src/Home.tsx", content: "origin" },
          { path: "src/App.tsx", content: "dest" },
        ],
      },
    },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Keep" }).click();
  await expect(c.getByTestId("move-progress")).toBeVisible();
  await c.getByRole("button", { name: "Stop" }).click();
  const ops = await composeOps(c);
  const restore = ops.find((o) => o.op === "restore");
  expect(restore?.files).toEqual(["src/Home.tsx", "src/App.tsx"]);
  expect(await bridgeOps(c)).toContain("revert");
});
