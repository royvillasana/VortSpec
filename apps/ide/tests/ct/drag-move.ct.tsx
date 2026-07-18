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
const runPrompts = (c: import("@playwright/test").Locator): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);

test("a drop opens the gated move; the prompt carries the source + a single marker", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``) } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  // The relocated element previews → review with Accept/Discard.
  await expect(c.getByTestId("move-review")).toBeVisible();
  const sent = await runPrompts(c);
  expect(sent[0]).toContain("This is a MOVE");
  expect(sent[0]).toContain("Card"); // the origin anchor label
  expect(sent[0]).toContain("VORTSPEC:COMPOSE"); // a single option scaffold marker
  expect(sent[0]).toContain("option=0");
});

test("accepting a move records keepOption 0 and owes a screen update", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``) } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await c.getByRole("button", { name: "Accept" }).click();
  const ops = await composeOps(c);
  expect(ops.find((o) => o.op === "accept")).toMatchObject({ file: "src/Home.tsx", keepOption: 0 });
  // A relocation owes a Screen Creation update (§5.9).
  await expect(c.getByTestId("move-screen-update")).toContainText("src/Home.tsx");
});

test("discarding a two-file move restores every snapshotted file", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: {
      mock: {
        runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``),
        // The snapshot the host took over BOTH files the move touches.
        snapshot: [
          { path: "src/Home.tsx", content: "origin" },
          { path: "src/components/Card.tsx", content: "dest" },
        ],
      },
    },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await expect(c.getByTestId("move-review")).toBeVisible();
  await c.getByRole("button", { name: "Discard" }).click();
  const ops = await composeOps(c);
  const restore = ops.find((o) => o.op === "restore");
  expect(restore).toBeTruthy();
  expect(restore?.files).toEqual(["src/Home.tsx", "src/components/Card.tsx"]);
  expect(ops.some((o) => o.op === "accept")).toBe(false);
});

test("an ambiguous/no-container move stops with a sentence and only Discard", async ({ mount }) => {
  const stopped = JSON.stringify({
    options: [],
    stopped: { reason: "The element's JSX matched two <Card> siblings.", candidates: ["Home.tsx:20", "Home.tsx:41"] },
    writtenFile: null,
  });
  const c = await mount(<MoveHarness />, { hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${stopped}\n\`\`\``) } } });
  await c.getByRole("button", { name: "Start move" }).click();
  await expect(c.getByTestId("move-error")).toContainText("two <Card> siblings");
  await expect(c.getByTestId("move-error")).toContainText("Home.tsx:20");
  await expect(c.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Discard" })).toBeVisible();
});

test("a move into a generated/ignored destination is refused, offering only discard", async ({ mount }) => {
  const c = await mount(<MoveHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${MOVED_JSON}\n\`\`\``), composeTargetOk: false } },
  });
  await c.getByRole("button", { name: "Start move" }).click();
  await expect(c.getByTestId("move-error")).toContainText("git-ignored");
  await expect(c.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Discard" })).toBeVisible();
});
