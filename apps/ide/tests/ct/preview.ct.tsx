import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { DevServerStatus, Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const RUNNING: DevServerStatus = { state: "running", url: "http://localhost:5199", script: "dev", message: null };

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

test("the preview bar renders collapsed with App/Storybook and Open Browser", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const bar = c.getByTestId("preview-bar");
  await expect(c.getByText("Preview", { exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "App", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Storybook" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Open Browser" })).toBeVisible();
  // Collapsed by default → the env details aren't shown.
  await expect(c.getByText(/^URL:/)).toHaveCount(0);
});

test("expanding the preview bar shows the localhost URL and state", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, appStatus: RUNNING } } });
  await open(c);
  await c.getByRole("button", { name: /preview details/i }).click();
  await expect(c.getByText(/localhost:5199/)).toBeVisible();
  await expect(c.getByText(/running/)).toBeVisible();
});

test("the App/Storybook selector switches the preview target", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const bar = c.getByTestId("preview-bar");
  const app = bar.getByRole("button", { name: "App", exact: true });
  const storybook = bar.getByRole("button", { name: "Storybook" });
  await expect(app).toHaveAttribute("aria-pressed", "true");
  await storybook.click();
  await expect(storybook).toHaveAttribute("aria-pressed", "true");
  await expect(app).toHaveAttribute("aria-pressed", "false");
});
