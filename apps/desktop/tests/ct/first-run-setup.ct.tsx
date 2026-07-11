import { test, expect } from "@playwright/experimental-ct-react";
import { FirstRunSetup } from "@vortspec/ui/FirstRunSetup";
import type { FigmaConnection } from "@vortspec/core/ipc";

const noop = (): void => {};

const FIGMA_DISCONNECTED: FigmaConnection = {
  installed: true,
  cliDir: "/Users/dev/figma-cli",
  daemonRunning: false,
  connected: false,
  mode: null,
  openFiles: [],
  appName: "VortSpec",
  message: "figma-cli is installed but not connected.",
};

const FIGMA_CONNECTED: FigmaConnection = {
  installed: true,
  cliDir: "/Users/dev/figma-cli",
  daemonRunning: true,
  connected: true,
  mode: "yolo",
  openFiles: ["Acme Design System"],
  appName: "VortSpec",
  message: "Connected to Figma Desktop (yolo mode).",
};

test("renders the three guided steps and re-detects a Claude login on mount", async ({ mount }) => {
  // Mock defaults: verifyLogin → pass, figmaStatus → disconnected.
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED } },
  });
  await expect(c.getByText("Set up VortSpec")).toBeVisible();
  await expect(c.getByText("Open a terminal")).toBeVisible();
  await expect(c.getByText("Sign in to Claude Code")).toBeVisible();
  await expect(c.getByText(/Connect figma-cli/)).toBeVisible();
  // Claude was already logged in → its step reflects done (no "Sign in" action).
  await expect(c.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  // Figma is not connected → its action is offered.
  await expect(c.getByRole("button", { name: "Connect Figma" })).toBeVisible();
});

test("re-detects a completed setup and reveals Continue without re-running steps", async ({ mount }) => {
  // Both already done on mount: Claude logged in (mock default) + Figma connected.
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_CONNECTED } },
  });
  // No step actions are offered — everything is already satisfied.
  await expect(c.getByRole("button", { name: "Connect Figma" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  // Once the terminal is ready, setup is complete.
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
});

test("offers a skip when a skip handler is provided", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED } },
  });
  await expect(c.getByRole("button", { name: "Skip for now" })).toBeVisible();
});
