import { test, expect } from "@playwright/experimental-ct-react";
import { Inspector } from "../../src/renderer/src/views/Inspector";
import { PROJECT, TOKENS } from "./support/fixtures";
import type { RunEvent } from "@vortspec/core/run-events";

// A run that starts but never finishes → the sync stays "running" so the Cancel
// affordance is visible (the transcript has no result/exit event).
const RUNNING_ONLY: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-fs", tools: [], mcpServers: [], mcpErrors: [] },
];

const CONNECTED = { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" };
const NOT_CONNECTED = {
  id: "figma-mcp",
  label: "Figma MCP",
  status: "unknown",
  detail: "Not configured",
  fix: {
    kind: "open-external",
    label: "Connect Figma",
    url: "https://claude.ai/customize/connectors",
  },
};

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onOpenPreview: noop,
  onOpenRun: noop,
  onOpenHistory: noop,
  onOpenManifest: noop,
};

test("renders tokens grouped by type with resolved values", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED } },
  });
  await expect(c.getByRole("heading", { name: "Tokens" })).toBeVisible();
  await expect(c.getByText("src/tokens.css")).toBeVisible();
  // The colour group header shows its own count (2), distinct from the 3 total.
  await expect(c.getByText("2 tokens")).toBeVisible();
  // Token rows render name + resolved value.
  await expect(c.getByText("color-primary")).toBeVisible();
  await expect(c.getByText("color-text")).toBeVisible();
  await expect(c.getByText("radius-md")).toBeVisible();
  await expect(c.getByText("#7C6FF0").first()).toBeVisible();
});

test("shows the Figma reconciliation banner and a drift pill", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED } },
  });
  await expect(c.getByText("Figma reconciliation")).toBeVisible();
  await expect(c.getByText("1 in sync")).toBeVisible();
  await expect(c.getByText("1 drifted")).toBeVisible();
  await expect(c.getByText("1 Figma-only")).toBeVisible();
  await expect(c.getByText("≠ Figma")).toBeVisible();
});

test("offers the sync action when the Figma bridge is connected", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED } },
  });
  await expect(c.getByRole("button", { name: /Sync from Figma|Re-sync from Figma/ })).toBeVisible();
});

test("shows a Cancel button while a Figma sync is running", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED, runScript: RUNNING_ONLY } },
  });
  await c.getByRole("button", { name: /Sync from Figma|Re-sync from Figma/ }).click();
  // The sync modal is up and offers a way out.
  await expect(c.getByText("Syncing Figma variables")).toBeVisible();
  await expect(c.getByRole("button", { name: "Cancel sync" })).toBeVisible();
});

test("gates the sync action when the Figma bridge is not connected", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: NOT_CONNECTED } },
  });
  await expect(c.getByRole("button", { name: "Connect Figma to reconcile" })).toBeVisible();
});

test("opens the token detail drawer with where-used on selection", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED } },
  });
  await c.getByText("color-primary").click();
  await expect(c.getByText("Token details")).toBeVisible();
  await expect(c.getByText("Where used")).toBeVisible();
  await expect(c.getByText("Button")).toBeVisible();
});

test("filters tokens by search query", async ({ mount }) => {
  const c = await mount(<Inspector {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, figmaMcp: CONNECTED } },
  });
  await c.getByPlaceholder("Search tokens…").fill("radius");
  await expect(c.getByText("radius-md")).toBeVisible();
  await expect(c.getByText("color-primary")).toHaveCount(0);
});
