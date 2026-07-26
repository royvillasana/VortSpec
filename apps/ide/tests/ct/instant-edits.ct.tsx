import { test, expect } from "@playwright/experimental-ct-react";
import { InstantEditsHarness } from "./support/instant-edits-harness";

/**
 * Instant Playground edits (change: instant-playground-edits, Group 6). A manual edit on a stamped
 * element persists deterministically to source with NO AI run and no Apply/Keep gate; an un-writable
 * edit surfaces a fixable notice and still starts no AI; a language prompt routes to the AI path.
 * Drives the real routing/persistence primitives over the mock — see instant-edits-harness.
 */

type L = import("@playwright/test").Locator;
const canvasWrites = (c: L): Promise<Array<{ file: string; edit: Record<string, unknown> }>> =>
  c.page().evaluate(() => (window as unknown as { __canvasWrites: Array<{ file: string; edit: Record<string, unknown> }> }).__canvasWrites);
const runPrompts = (c: L): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts ?? []);

test("6.1 a style edit persists deterministically — no AI run, no Apply/Keep gate", async ({ mount }) => {
  const c = await mount(<InstantEditsHarness />);
  await c.getByRole("button", { name: "Change color" }).click();
  // A deterministic write landed…
  await expect.poll(() => canvasWrites(c).then((w) => w.length)).toBe(1);
  const [w] = await canvasWrites(c);
  expect(w.file).toBe("src/App.tsx");
  expect(w.edit).toMatchObject({ op: "style", css: { color: "#c53434" } });
  // …with NO AI run and NO Apply bar.
  expect(await runPrompts(c)).toEqual([]);
  await expect(c.getByTestId("apply-bar")).toHaveCount(0);
  await expect(c.getByTestId("write-error")).toHaveCount(0);
});

test("6.2 a delete writes a delete op deterministically — no AI", async ({ mount }) => {
  const c = await mount(<InstantEditsHarness />);
  await c.getByRole("button", { name: "Delete element" }).click();
  await expect.poll(() => canvasWrites(c).then((w) => w.length)).toBe(1);
  expect((await canvasWrites(c))[0].edit).toMatchObject({ op: "delete" });
  expect(await runPrompts(c)).toEqual([]);
  await expect(c.getByTestId("apply-bar")).toHaveCount(0);
});

test("6.3 an un-writable edit surfaces a fixable notice and starts NO AI", async ({ mount }) => {
  // writeCanvasEdit reports the anchor isn't statically resolvable (e.g. inside a .map()).
  const c = await mount(<InstantEditsHarness />, {
    hooksConfig: { mock: { canvasWriteResult: { ok: false, reason: "It's rendered inside a list (.map())." } } },
  });
  await c.getByRole("button", { name: "Change color" }).click();
  // The write was attempted (deterministic lane) and withheld → a notice, no silent AI.
  await expect(c.getByTestId("write-error")).toContainText("list (.map())");
  expect(await runPrompts(c)).toEqual([]);
});

test("6.4 the assistant button routes to the AI path (a run starts)", async ({ mount }) => {
  const c = await mount(<InstantEditsHarness />);
  await c.getByRole("button", { name: "Ask the assistant" }).click();
  await expect.poll(() => runPrompts(c).then((p) => p.length)).toBeGreaterThan(0);
  expect((await runPrompts(c))[0]).toContain("playful");
  // A language prompt is the AI path — it must NOT masquerade as a deterministic canvas write.
  expect(await canvasWrites(c)).toEqual([]);
});

test("6.3b an un-stamped element falls to the gated ledger (Apply), not a silent AI run", async ({ mount }) => {
  const c = await mount(<InstantEditsHarness stamped={false} />);
  await c.getByRole("button", { name: "Change color" }).click();
  await expect(c.getByTestId("apply-bar")).toBeVisible();
  expect(await canvasWrites(c)).toEqual([]); // nothing written deterministically
  expect(await runPrompts(c)).toEqual([]); // and no silent AI
});
