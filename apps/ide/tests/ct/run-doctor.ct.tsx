import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project, DevServerStatus } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const ERRORED: DevServerStatus = {
  state: "error",
  url: null,
  script: "dev",
  message: "sh: vite: command not found",
};

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
  appStatus: ERRORED,
  appStartStatus: ERRORED,
};

const rail = (c: import("@playwright/test").Locator) =>
  c.getByRole("navigation", { name: "Activity bar" });

test("the Run Doctor appears on a startup failure and hands the fix to the assistant", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await rail(c).getByRole("button", { name: "Playground" }).click();

  await expect(c.getByText(/Run Doctor/)).toBeVisible();
  await expect(c.getByText(/failed to start/)).toBeVisible();
  await expect(c.getByText(/vite: command not found/)).toBeVisible();
  // In the IDE (an assistant host is mounted) the fix routes to the sidebar chat.
  const fix = c.getByRole("button", { name: /Fix in the assistant/ });
  await expect(fix).toBeVisible();

  // Nothing runs until the user clicks (spec-first gate).
  const before = await c.evaluate(() => (window as unknown as { __runPrompts?: string[] }).__runPrompts ?? []);
  expect(before.length).toBe(0);

  // Clicking opens a dedicated conversation that auto-runs the doctor prompt.
  await fix.click();
  await expect(c.getByRole("tab", { name: /Fix: app won't start/ })).toBeVisible();
  await expect(c.getByText(/Handed to the assistant/)).toBeVisible();
  await expect
    .poll(async () =>
      c.evaluate(() => ((window as unknown as { __runPrompts?: string[] }).__runPrompts ?? []).join("\n")),
    )
    .toMatch(/failed to start/);
});
