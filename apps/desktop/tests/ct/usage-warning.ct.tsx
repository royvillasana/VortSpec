import { test, expect } from "@playwright/experimental-ct-react";
import { UsageWarningHarness } from "./support/UsageWarningHarness";
import type { UsageResult } from "@vortspec/core/ipc";

const usage = (percent: number): UsageResult => ({
  available: true,
  headline: null,
  limits: [
    { label: "Current session", percent, resetsAt: "3:45pm" },
    { label: "Current week (all models)", percent: 20, resetsAt: "Mon 2am" },
  ],
  note: null,
  raw: "",
  capturedAt: "",
  error: null,
});

test("warns once session usage crosses a threshold, with how much is left", async ({ mount }) => {
  const c = await mount(<UsageWarningHarness />, { hooksConfig: { mock: { usage: usage(88) } } });
  await expect(c.getByText(/88%/)).toBeVisible();
  await expect(c.getByText(/12% left before runs pause/)).toBeVisible();
  await expect(c.getByText(/resets 3:45pm/)).toBeVisible();
});

test("stays quiet below 75%", async ({ mount }) => {
  const c = await mount(<UsageWarningHarness />, { hooksConfig: { mock: { usage: usage(60) } } });
  await expect(c.getByText("no warning yet")).toBeVisible();
});

test("escalates the tone near the limit and can be dismissed", async ({ mount }) => {
  const c = await mount(<UsageWarningHarness />, { hooksConfig: { mock: { usage: usage(96) } } });
  await expect(c.getByText(/almost out/)).toBeVisible();
  await c.getByRole("button", { name: "Dismiss usage warning" }).click();
  await expect(c.getByText("no warning yet")).toBeVisible();
});
