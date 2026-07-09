import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
};

const rail = (c: import("@playwright/test").Locator) =>
  c.getByRole("navigation", { name: "Activity bar" });

async function openRun(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await rail(c).getByRole("button", { name: "Run app" }).click();
}

test("the Run activity shows the Figma-style Design panel beside the canvas", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // The Design panel replaces the file Explorer here: Layers + an empty-selection hint.
  await expect(c.getByRole("button", { name: /Layers/ })).toBeVisible();
  await expect(c.getByText(/Select an element on the canvas/)).toBeVisible();
  // With no guest preload in the CT browser, the canvas shows its preparing state
  // (no real <webview> is mounted).
  await expect(c.getByText(/Preparing canvas/)).toBeVisible();
});

test("the Layers tree shows an empty state until the app renders", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  await expect(c.getByText(/No elements yet/)).toBeVisible();
});

test("the Run view offers to create a missing .env", async ({ mount }) => {
  const mock = { ...base, envStatus: { hasEnv: false, examples: [".env.example"] } };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await openRun(c);
  await expect(c.getByText(/may fail at runtime without its environment variables/)).toBeVisible();
  await expect(c.getByRole("button", { name: /Create \.env from \.env\.example/ })).toBeVisible();
});

test("the Layers header carries the mode toggle and a zoom control at the bottom", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // Inspect / Interact live beside the Layers label (the canvas viewport stays clean).
  await expect(c.getByRole("button", { name: "Inspect" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Interact" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Pan" })).toHaveCount(0); // Pan removed
  // Zoom readout sits at the bottom of the Layers region.
  await expect(c.getByRole("button", { name: "100%" })).toBeVisible();
  // The Design panel is a resizable sidebar (like the Explorer rail).
  await expect(c.getByRole("separator", { name: "Resize Design panel" })).toBeVisible();
});
