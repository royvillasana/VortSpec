import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project } from "@vortspec/core/ipc";

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [],
  createFolderResult: {
    id: "wt",
    name: "sdd-walkthrough",
    path: "/Users/dev/sdd-walkthrough",
    toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
  } as Project,
};

test("the welcome screen offers the walk-through project", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await expect(c.getByRole("button", { name: /Open the walk-through project/ })).toBeVisible();
});

test("opening the walk-through extracts and opens a project", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("button", { name: /Open the walk-through project/ }).click();
  // createFolder → openWalkthrough (ok) → refreshProject → onOpen → the workspace shell.
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
});
