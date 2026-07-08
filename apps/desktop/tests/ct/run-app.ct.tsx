import { test, expect } from "@playwright/experimental-ct-react";
import { RunApp } from "../../src/renderer/src/views/RunApp";
import { PROJECT } from "./support/fixtures";
import type { DevServerStatus } from "../../src/shared/ipc";

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onFlow: noop,
  onRun: noop,
  onPlayground: noop,
  onTokens: noop,
  onManifest: noop,
  onHistory: noop,
  onSource: noop,
};

const RUNNING: DevServerStatus = { state: "running", url: "http://localhost:5173", script: "dev", message: null };
const NO_SCRIPT: DevServerStatus = { state: "no-script", url: null, script: null, message: "No app dev script found." };

test("runs the app and embeds its localhost URL", async ({ mount }) => {
  const c = await mount(<RunApp {...props} />, {
    hooksConfig: { mock: { appStatus: RUNNING, appStartStatus: RUNNING } },
  });
  await expect(c.getByText("localhost:5173")).toBeVisible();
  await expect(c.getByRole("button", { name: "Open in browser" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(c.locator('iframe[title="app"]')).toHaveCount(1);
});

test("explains when there's no app dev script", async ({ mount }) => {
  const c = await mount(<RunApp {...props} />, {
    hooksConfig: { mock: { appStatus: NO_SCRIPT, appStartStatus: NO_SCRIPT } },
  });
  await expect(c.getByText("No app dev script found", { exact: true })).toBeVisible();
});
