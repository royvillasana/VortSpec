import { test, expect } from "@playwright/experimental-ct-react";
import { FigmaConnection } from "@vortspec/ui/FigmaConnection";
import type { FigmaConnection as FigmaStatus } from "@vortspec/core/ipc";

const DISCONNECTED: FigmaStatus = {
  installed: true,
  cliDir: "/Users/dev/figma-cli",
  daemonRunning: false,
  connected: false,
  mode: null,
  openFiles: [],
  appName: "VortSpec",
  message: "figma-cli is installed but not connected.",
};

const CONNECTED: FigmaStatus = {
  installed: true,
  cliDir: "/Users/dev/figma-cli",
  daemonRunning: true,
  connected: true,
  mode: "yolo",
  openFiles: ["Acme Design System"],
  appName: "VortSpec",
  message: "Connected to Figma Desktop (yolo mode).",
};

test("shows yolo instructions + the automated Open App Management action when disconnected", async ({ mount }) => {
  const c = await mount(<FigmaConnection />, { hooksConfig: { mock: { figma: DISCONNECTED } } });
  await expect(c.getByText("Not connected")).toBeVisible();
  await expect(c.getByText("Yolo mode")).toBeVisible();
  // The automated workflow: open System Settings → App Management, and the connect actions.
  await expect(c.getByRole("button", { name: "Open App Management settings" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Connect \(Yolo\)/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /Connect \(Safe\)/ })).toBeVisible();
  // Instructions name the app that needs the macOS permission.
  await expect(c.getByText(/enable VortSpec/i).first()).toBeVisible();
});

test("clicking Open App Management triggers the settings action", async ({ mount }) => {
  const c = await mount(<FigmaConnection />, { hooksConfig: { mock: { figma: DISCONNECTED } } });
  // No throw; the button stays usable (the main process opens System Settings).
  await c.getByRole("button", { name: "Open App Management settings" }).click();
  await expect(c.getByRole("button", { name: "Open App Management settings" })).toBeVisible();
});

test("shows the live connection + open files when connected", async ({ mount }) => {
  const c = await mount(<FigmaConnection />, { hooksConfig: { mock: { figma: CONNECTED } } });
  await expect(c.getByText(/Connected · yolo mode/)).toBeVisible();
  await expect(c.getByText(/Acme Design System/)).toBeVisible();
  // No setup instructions when already connected.
  await expect(c.getByRole("button", { name: "Open App Management settings" })).toHaveCount(0);
});
