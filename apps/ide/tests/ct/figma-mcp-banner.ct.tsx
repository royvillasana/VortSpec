import { test, expect } from "@playwright/experimental-ct-react";
import { FigmaMcpBanner } from "@vortspec/ui/FigmaMcpBanner";
import type { Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme",
  path: "/Users/dev/acme",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const figmaMcp = (status: "pass" | "fail" | "unknown", detail = "") =>
  ({ id: "figma-mcp", label: "Figma MCP", status, detail }) as const;

test("blocks a Figma-source project when the MCP isn't set up", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: { mock: { projectConfig: { designSource: "figma" }, figmaMcp: figmaMcp("unknown") } },
  });
  // Blocking banner with the one-click install action.
  await expect(c.getByRole("button", { name: "Set up Figma MCP" })).toBeVisible();
  await expect(c.getByText(/design source is/)).toContainText("Figma");
});

test("shows an authenticate affordance when the MCP is configured but unauthed", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: { mock: { projectConfig: { designSource: "figma" }, figmaMcp: figmaMcp("fail", "needs auth") } },
  });
  await expect(c.getByRole("button", { name: "Re-check" })).toBeVisible();
  await expect(c.getByText(/needs authentication/)).toBeVisible();
});

test("does not block a non-Figma design source", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: { mock: { projectConfig: { designSource: "github" }, figmaMcp: figmaMcp("fail") } },
  });
  await expect(c.getByTestId("figma-mcp-gate")).toHaveCount(0);
});

test("does not block once the Figma MCP is connected", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: { mock: { projectConfig: { designSource: "figma" }, figmaMcp: figmaMcp("pass", "Connected") } },
  });
  await expect(c.getByTestId("figma-mcp-gate")).toHaveCount(0);
});

test("Set up Figma MCP installs it and, on a connected result, dismisses the gate", async ({ mount }) => {
  const c = await mount(<FigmaMcpBanner project={PROJECT} />, {
    hooksConfig: {
      mock: {
        projectConfig: { designSource: "figma" },
        figmaMcp: figmaMcp("unknown"),
        figmaMcpAdd: figmaMcp("pass", "Connected"),
      },
    },
  });
  await c.getByRole("button", { name: "Set up Figma MCP" }).click();
  // addFigmaMcp → connected → no longer blocking → the gate unmounts.
  await expect(c.getByTestId("figma-mcp-gate")).toHaveCount(0);
});
