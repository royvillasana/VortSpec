import { test, expect } from "@playwright/experimental-ct-react";
import { SelectionHarness } from "./support/selection-harness";
import type { RunEvent } from "@vortspec/core/run-events";

// A run that completes immediately, so a Send finishes and the next one can fire.
const REPLY: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-a1", tools: ["Read"], mcpServers: [], mcpErrors: [] },
  { kind: "assistant-text", text: "Looking at it." },
  { kind: "result", isError: false, text: "done", sessionId: "sess-a1" },
];

const cfg = { hooksConfig: { mock: { runScript: REPLY } } };

const prompts = (c: import("@playwright/test").Locator): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);

test("selecting grounds the composer without any attach gesture", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await expect(c.getByTestId("canvas-selection-chip")).toHaveCount(0);
  // "Selecting" (publish) alone surfaces the chip — no attach button was pressed.
  await c.getByRole("button", { name: "pub card" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toContainText("Card");
});

test("selecting starts no run and writes no file", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toBeVisible();
  // Attaching is not acting: no run was started by the selection alone.
  expect(await prompts(c)).toEqual([]);
});

test("the chip is inspectable — it shows exactly what will be sent", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await expect(c.getByTestId("canvas-selection-detail")).toHaveCount(0);
  await c.getByRole("button", { name: /Selection: Card/ }).click();
  await expect(c.getByTestId("canvas-selection-detail")).toContainText("AMBIENT_CARD");
});

test("the selection grounds the prompt and survives a submitted turn", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await c.getByPlaceholder(/@ a file/).fill("make it bigger");
  await c.getByRole("button", { name: "Send" }).click();
  await expect(c.getByText("Looking at it.")).toBeVisible();
  // The chip is still there for the follow-up (not consumed by submitting).
  await expect(c.getByTestId("canvas-selection-chip")).toBeVisible();
  await c.getByPlaceholder(/@ a file/).fill("and blue");
  await c.getByRole("button", { name: "Send" }).click();
  const sent = await prompts(c);
  expect(sent).toHaveLength(2);
  // Grounded on the first turn AND still grounded on the follow-up.
  expect(sent[0]).toContain("AMBIENT_CARD");
  expect(sent[1]).toContain("AMBIENT_CARD");
});

test("re-selecting replaces the chip rather than accumulating a second", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toContainText("Card");
  await c.getByRole("button", { name: "pub button" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toHaveCount(1);
  await expect(c.getByTestId("canvas-selection-chip")).toContainText("PrimaryButton");
  await expect(c.getByTestId("canvas-selection-chip")).not.toContainText("Card");
});

test("deselecting withdraws the chip", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toBeVisible();
  await c.getByRole("button", { name: "pub none" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toHaveCount(0);
});

test("detaching sends the prompt without the selection, and the system stays live", async ({ mount }) => {
  const c = await mount(<SelectionHarness />, cfg);
  await c.getByRole("button", { name: "pub card" }).click();
  await c.getByRole("button", { name: "Detach selection context" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toHaveCount(0);
  await c.getByPlaceholder(/@ a file/).fill("ignore the selection");
  await c.getByRole("button", { name: "Send" }).click();
  await expect(c.getByText("Looking at it.")).toBeVisible();
  const sent = await prompts(c);
  expect(sent[0]).not.toContain("AMBIENT_CARD");
  // Detach was for that selection only — a new selection still grounds.
  await c.getByRole("button", { name: "pub button" }).click();
  await expect(c.getByTestId("canvas-selection-chip")).toContainText("PrimaryButton");
});
