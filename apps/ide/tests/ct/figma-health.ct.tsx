import { test, expect } from "@playwright/experimental-ct-react";
import { FigmaHealthCheck } from "@vortspec/ui/FigmaHealthCheck";
import { AssistantTaskProvider, type AssistantTask } from "@vortspec/ui/assistant-task";
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
  // No assistant host + healthy → no "Fix in the assistant" handoff button.
  await expect(c.getByRole("button", { name: /Fix in the assistant/ })).toHaveCount(0);
});

test("with an assistant host, a broken connection hands the fix to the sidebar chat", async ({ mount }) => {
  let task: AssistantTask | null = null;
  const c = await mount(
    <AssistantTaskProvider value={(t) => { task = t; }}>
      <FigmaHealthCheck project={PROJECT} />
    </AssistantTaskProvider>,
    { hooksConfig: { mock: { figmaHealth: BRIDGE_DOWN } } },
  );
  await c.getByRole("button", { name: "Check Figma connection" }).click();
  await c.getByRole("button", { name: /Fix in the assistant/ }).click();
  await expect(c.getByText(/Working in the assistant/)).toBeVisible();
  // The dispatched task steers to the OAuth MCP and NEVER asks for a token.
  await expect.poll(() => task?.title ?? "").toContain("Figma");
  const dispatched = task as AssistantTask | null;
  expect(dispatched?.prompt).toContain("remote Figma MCP");
  expect(dispatched?.prompt).toMatch(/[Nn]ever ask me for[^.]*token/);
});
