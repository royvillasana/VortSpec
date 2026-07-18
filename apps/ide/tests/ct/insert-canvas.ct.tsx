import { test, expect } from "@playwright/experimental-ct-react";
import { InsertCanvasHarness } from "./support/insert-canvas-harness";

test("insert mode draws a vertical line for a row flow", async ({ mount }) => {
  const c = await mount(<InsertCanvasHarness scenario="line-row" />);
  const line = c.getByTestId("insert-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-axis", "row");
  // A row flow → a vertical divider (taller than it is wide).
  const box = await line.boundingBox();
  expect(box!.height).toBeGreaterThan(box!.width);
});

test("insert mode draws a horizontal line for a column flow", async ({ mount }) => {
  const c = await mount(<InsertCanvasHarness scenario="line-column" />);
  const line = c.getByTestId("insert-line");
  await expect(line).toHaveAttribute("data-axis", "column");
  const box = await line.boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);
});

test("a placed placeholder shows the resizable box and hides the line", async ({ mount }) => {
  const c = await mount(<InsertCanvasHarness scenario="placeholder" />);
  await expect(c.getByTestId("placeholder-box")).toBeVisible();
  // The line gives way to the placeholder once it's placed.
  await expect(c.getByTestId("insert-line")).toHaveCount(0);
});

test("a lost placeholder surfaces a human sentence with a dismiss", async ({ mount }) => {
  const c = await mount(<InsertCanvasHarness scenario="lost" />);
  await expect(c.getByText(/changed after a reload — pick the spot again/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Dismiss" })).toBeVisible();
});

test("insert affordances draw only in insert mode", async ({ mount }) => {
  const c = await mount(<InsertCanvasHarness scenario="interact-hides" />);
  // A stale target exists on the bridge, but the mode is interact → no line.
  await expect(c.getByTestId("insert-line")).toHaveCount(0);
});
