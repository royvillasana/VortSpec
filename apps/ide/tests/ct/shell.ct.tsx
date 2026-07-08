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

/** Open the workspace by clicking the seeded recent project. */
async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

test("opens on the workspace picker and lists recent projects", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await expect(c.getByRole("heading", { name: "VortSpec IDE" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Open a folder/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /acme-design-system/ })).toBeVisible();
});

test("opening a workspace reveals the four-region shell", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Activity bar (left rail) with the five activities.
  const rail = c.getByRole("navigation", { name: "Activity bar" });
  await expect(rail.getByRole("button", { name: "Explorer" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Source Control" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Design tokens" })).toBeVisible();
  // The code activity's Explorer + editor + preview regions.
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
  await expect(c.getByText("No file open", { exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: "Side-by-side" })).toBeVisible();
  // The assistant chat (right rail) toggle.
  await expect(rail.getByRole("button", { name: "Toggle assistant" })).toBeVisible();
});

test("the activity bar switches to a reused @vortspec/ui panel", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Switch to Source Control → the code placeholders give way to the reused panel.
  const sc = c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Source Control" });
  await sc.click();
  await expect(sc).toHaveAttribute("aria-pressed", "true");
  // The code activity (Explorer's "No file open") gives way to the reused panel.
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
});

test("can collapse the assistant chat", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const toggle = c.getByRole("button", { name: "Toggle assistant" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
