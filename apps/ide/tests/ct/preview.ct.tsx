import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { DevServerStatus, Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
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

test("attaches to an already-running app server (no double-start)", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, appStatus: RUNNING } } });
  await open(c);
  // The preview reflects the running server without the user pressing Start.
  await expect(c.getByText(/localhost:5199/)).toBeVisible();
  await expect(c.getByTitle("preview", { exact: true })).toBeVisible();
});

test("offers start-on-demand when nothing is running", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await expect(c.getByRole("button", { name: "Start app" })).toBeVisible();
});

test("renders a fix-it card when there is no dev script", async ({ mount }) => {
  const c = await mount(<App />, {
    hooksConfig: {
      mock: {
        ...base,
        appStatus: { state: "no-script", url: null, script: null, message: "Add a dev script." } as DevServerStatus,
      },
    },
  });
  await open(c);
  await expect(c.getByText("No app dev script found")).toBeVisible();
  await expect(c.getByText("Add a dev script.")).toBeVisible();
});

test("toggles editor/preview layout and can hide the preview", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, appStatus: RUNNING } } });
  await open(c);
  // Layout toggle flips its label.
  const layout = c.getByRole("button", { name: "Side-by-side" });
  await expect(layout).toBeVisible();
  await layout.click();
  await expect(c.getByRole("button", { name: "Stacked" })).toBeVisible();
  // Hiding the preview removes the App/Storybook kind toggle.
  await c.getByTitle("Toggle live preview").click();
  await expect(c.getByRole("button", { name: "Storybook" })).toHaveCount(0);
});
