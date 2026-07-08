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
  terminalGreeting: "acme$ ",
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

test("toggles the integrated terminal from the status bar", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Hidden by default.
  await expect(c.getByTestId("terminal")).toHaveCount(0);
  // Open via the status-bar toggle → the xterm surface mounts.
  await c.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(c.getByTestId("terminal")).toBeVisible();
  // Close it.
  await c.getByRole("button", { name: "Close terminal" }).click();
  await expect(c.getByTestId("terminal")).toHaveCount(0);
});
