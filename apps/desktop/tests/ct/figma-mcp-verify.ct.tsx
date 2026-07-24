import { test, expect } from "@playwright/experimental-ct-react";
import { FirstRunSetup } from "@vortspec/ui/FirstRunSetup";
import { FigmaMcpBanner } from "@vortspec/ui/FigmaMcpBanner";
import type { Project } from "@vortspec/core/ipc";

// Verification driver for PR #42 (figma-mcp-prerequisite): drives the real
// renderer surfaces in Chromium and captures screenshots as evidence.

const noop = (): void => {};
const PROJECT = {
  id: "p1", name: "acme", path: "/Users/dev/acme",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;
const mcp = (status: "pass" | "fail" | "unknown", detail = "") =>
  ({ id: "figma-mcp", label: "Figma MCP", status, detail }) as const;

test("first-run shows the Figma MCP as a real step; setting it up completes it", async ({ mount }) => {
  const c = await mount(<FirstRunSetup onDone={noop} onSkip={noop} />, {
    hooksConfig: {
      mock: {
        figmaMcp: mcp("unknown", "Not configured — add it to work with Figma"),
        figmaMcpAdd: mcp("pass", "Connected"),
      },
    },
  });
  await expect(c.getByText("Set up the Figma MCP")).toBeVisible();
  const btn = c.getByRole("button", { name: "Set up Figma MCP" });
  await expect(btn).toBeEnabled();
  await c.screenshot({ path: "test-results/verify-firstrun-mcp-step.png" });
  await btn.click();
  // Auto-installs → connected → step done → Continue appears.
  await expect(c.getByRole("button", { name: "Continue to VortSpec" })).toBeVisible();
  await c.screenshot({ path: "test-results/verify-firstrun-mcp-done.png" });
});

test("project-scoped gate blocks a Figma project until the MCP is connected", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: { mock: { projectConfig: { designSource: "figma" }, figmaMcp: mcp("unknown") } },
  });
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toBeVisible();
  await c.screenshot({ path: "test-results/verify-project-gate.png" });
});
