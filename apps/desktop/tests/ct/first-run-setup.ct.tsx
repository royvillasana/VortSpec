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

const chk = (id: string, status: "pass" | "fail", detail = ""): import("@vortspec/core/ipc").EnvCheck =>
  ({ id, label: id, status, detail }) as import("@vortspec/core/ipc").EnvCheck;
// Base tools present (Node bundled + git + Claude CLI) → the prereq step is done.
const ENV_TOOLS_READY = { checks: [chk("node", "pass"), chk("git", "pass"), chk("claude-install", "pass")], ready: true };
const ENV_TOOLS_MISSING = { checks: [chk("node", "pass"), chk("git", "fail"), chk("claude-install", "fail")], ready: false };

test("renders the five guided steps (incl. base tools + Figma MCP) and re-detects state on mount", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED, env: ENV_TOOLS_MISSING } },
  });
  await expect(c.getByText("Set up VortSpec")).toBeVisible();
  await expect(c.getByText("Open a terminal")).toBeVisible();
  await expect(c.getByText("Install the base tools")).toBeVisible();
  await expect(c.getByText("Sign in to Claude Code")).toBeVisible();
  await expect(c.getByText("Set up the Figma MCP")).toBeVisible();
  await expect(c.getByText("Connect Figma (local editing)")).toBeVisible();
  // Base tools missing → the Install action is offered; Claude was logged in (default).
  await expect(c.getByRole("button", { name: "Install", exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toBeVisible();
});

test("re-detects a completed setup (tools + login + Figma MCP) and reveals Continue", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figma: FIGMA_CONNECTED,
        env: ENV_TOOLS_READY,
        figmaMcp: { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" },
      },
    },
  });
  await expect(c.getByRole("button", { name: "Install", exact: true })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
});

test("Install runs the base-tool installers (git + Claude CLI) and completes the step", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figma: FIGMA_CONNECTED,
        env: ENV_TOOLS_MISSING,
        installGit: { id: "git", label: "Git", status: "pass", detail: "v2.39.0" },
        installClaude: { id: "claude-install", label: "Claude Code", status: "pass", detail: "1.2.3" },
      },
    },
  });
  const installBtn = c.getByRole("button", { name: "Install", exact: true });
  await expect(installBtn).toBeEnabled();
  await installBtn.click();
  // Both installers return pass → the prereq step completes and the action disappears.
  await expect(c.getByRole("button", { name: "Install", exact: true })).toHaveCount(0);
});

test("Set up Figma MCP runs the add and, on success, completes the step", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figma: FIGMA_CONNECTED,
        env: ENV_TOOLS_READY,
        figmaMcp: { id: "figma-mcp", label: "Figma MCP", status: "unknown", detail: "Not configured — add it to work with Figma" },
        figmaMcpAdd: { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" },
      },
    },
  });
  const setupBtn = c.getByRole("button", { name: "Set up Figma MCP" });
  await expect(setupBtn).toBeEnabled();
  await setupBtn.click();
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
});

test("offers a skip when a skip handler is provided", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: { mock: { figma: FIGMA_DISCONNECTED } },
  });
  await expect(c.getByRole("button", { name: "Skip for now" })).toBeVisible();
});
