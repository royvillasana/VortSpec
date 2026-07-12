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

test("the Run Doctor appears on a startup failure and offers a gated Fix with Claude", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await rail(c).getByRole("button", { name: "Playground" }).click();

  await expect(c.getByText(/Run Doctor/)).toBeVisible();
  await expect(c.getByText(/failed to start/)).toBeVisible();
  await expect(c.getByText(/vite: command not found/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Fix with Claude" })).toBeVisible();

  // Nothing runs until the user clicks (spec-first gate).
  const prompts = await c.evaluate(() => (window as unknown as { __runPrompts?: string[] }).__runPrompts ?? []);
  expect(prompts.length).toBe(0);
});
