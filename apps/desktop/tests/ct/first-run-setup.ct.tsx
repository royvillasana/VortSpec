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

test("renders the four guided steps, incl. the Figma MCP, and re-detects a Claude login on mount", async ({ mount }) => {
  // Mock defaults: verifyLogin → pass, verifyFigmaMcp → unknown, figmaStatus → disconnected.
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED } },
  });
  await expect(c.getByText("Set up VortSpec")).toBeVisible();
  await expect(c.getByText("Open a terminal")).toBeVisible();
  await expect(c.getByText("Sign in to Claude Code")).toBeVisible();
  await expect(c.getByText("Set up the Figma MCP")).toBeVisible();
  await expect(c.getByText("Connect Figma (local editing)")).toBeVisible();
  // Claude was already logged in → its step reflects done (no "Sign in" action).
  await expect(c.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  // Figma MCP not authorized → its action is offered.
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Connect figma-cli" })).toBeVisible();
});

test("re-detects a completed setup (login + Figma MCP) and reveals Continue", async ({ mount }) => {
  // Already done on mount: Claude logged in (mock default) + Figma MCP connected.
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figma: FIGMA_CONNECTED,
        figmaMcp: { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" },
      },
    },
  });
  // No step actions are offered — the required steps are already satisfied.
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  // Once the terminal is ready, setup is complete (gated on login + Figma MCP).
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
});

test("Set up Figma MCP runs the add and, on success, completes the step", async ({ mount }) => {
  // MCP not yet configured on mount; the add resolves to a connected server.
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figma: FIGMA_CONNECTED,
        figmaMcp: { id: "figma-mcp", label: "Figma MCP", status: "unknown", detail: "Not configured — add it to work with Figma" },
        figmaMcpAdd: { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" },
      },
    },
  });
  const setupBtn = c.getByRole("button", { name: "Set up Figma MCP" });
  await expect(setupBtn).toBeEnabled(); // enabled once the terminal is ready
  await setupBtn.click();
  // The add returns connected → step done → the action is gone and Continue appears.
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
});

test("offers a skip when a skip handler is provided", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED } },
  });
  await expect(c.getByRole("button", { name: "Skip for now" })).toBeVisible();
});
