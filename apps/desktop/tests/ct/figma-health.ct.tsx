import { test, expect } from "@playwright/experimental-ct-react";
import { FigmaHealthCheck } from "@vortspec/ui/FigmaHealthCheck";
import { PROJECT } from "./support/fixtures";
import type { FigmaHealth } from "@vortspec/core/ipc";

const EXPIRED: FigmaHealth = {
  mode: "token-expired",
  tokenValid: false,
  bridgeConnected: false,
  canRead: false,
  variableCount: 0,
  styleCount: 0,
  message:
    "Your Figma API token has expired — the Figma REST API returned 401/403. Generate a fresh personal access token, update it in your Figma MCP config, then re-check.",
  detail: "403",
};

const BRIDGE_DOWN: FigmaHealth = {
  mode: "bridge-down",
  tokenValid: true,
  bridgeConnected: false,
  canRead: false,
  variableCount: 0,
  styleCount: 0,
  message:
    "VortSpec can't reach the Figma Desktop Bridge. Open Figma Desktop and start the Desktop Bridge plugin (figma-console-mcp), then re-check.",
  detail: "bridge not connected",
};

test("on an expired token, recommends the OAuth MCP + keeps a token fallback link", async ({ mount }) => {
  const c = await mount(<FigmaHealthCheck project={PROJECT} />, {
    hooksConfig: { mock: { figmaHealth: EXPIRED } },
  });
  await c.getByRole("button", { name: "Check Figma connection" }).click();
  await expect(c.getByText(/token has expired/i)).toBeVisible();
  // Leads with the recommended OAuth MCP command…
  await expect(c.getByText(/Recommended — the official Figma MCP/)).toBeVisible();
  await expect(c.getByText(/claude mcp add --transport http figma https:\/\/mcp\.figma\.com\/mcp/)).toBeVisible();
  // …with the figma-console token path demoted to a secondary link.
  await expect(c.getByRole("button", { name: /Prefer to keep figma-console/ })).toBeVisible();
});

test("on a down bridge, recommends switching to the OAuth MCP", async ({ mount }) => {
  const c = await mount(<FigmaHealthCheck project={PROJECT} />, {
    hooksConfig: { mock: { figmaHealth: BRIDGE_DOWN } },
  });
  await c.getByRole("button", { name: "Check Figma connection" }).click();
  await expect(c.getByText(/Recommended — the official Figma MCP/)).toBeVisible();
  await expect(c.getByText(/mcp\.figma\.com/)).toBeVisible();
});

test("reports a healthy connection with counts", async ({ mount }) => {
  // Default mock health = ok, 80 variables / 12 styles.
  const c = await mount(<FigmaHealthCheck project={PROJECT} />, { hooksConfig: { mock: {} } });
  await c.getByRole("button", { name: "Check Figma connection" }).click();
  await expect(c.getByText(/Figma connection healthy/)).toBeVisible();
});
