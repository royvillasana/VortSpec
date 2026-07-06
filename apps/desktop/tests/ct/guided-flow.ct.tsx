import { test, expect } from "@playwright/experimental-ct-react";
import { GuidedFlow } from "../../src/renderer/src/views/GuidedFlow";
import { PROJECT } from "./support/fixtures";
import type { InspectorComponentsResult, InspectorTokensResult } from "../../src/shared/ipc";

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onOpenInspector: noop,
  onOpenPreview: noop,
  onOpenRun: noop,
  onOpenVerify: noop,
  onOpenHistory: noop,
  onOpenManifest: noop,
};

const TOKENS: InspectorTokensResult = {
  tokenFile: "src/tokens.css",
  figmaSynced: false,
  figmaOnly: [],
  usage: {},
  tokens: [
    { name: "color-primary", type: "color", rawValue: "#7C6FF0", resolvedValue: "#7C6FF0", source: "generated-code", uses: 1 },
  ],
};

// A roster: one verified, one built, one detected (not yet built).
const ROSTER: InspectorComponentsResult = {
  componentDir: "src/components",
  previewUrl: null,
  components: [
    { name: "Button", level: "atom", description: "Primary action", file: "src/components/Button.tsx", props: [], tokens: [], status: "verified", issues: [], specPath: null, reportPath: null },
    { name: "Card", level: "molecule", description: "Container", file: "src/components/Card.tsx", props: [], tokens: [], status: "built", issues: [], specPath: null, reportPath: null },
    { name: "Modal", level: "organism", description: "Dialog", file: null, props: [], tokens: [], status: "unknown", issues: [], specPath: null, reportPath: null },
  ],
};

const EMPTY_TOKENS: InspectorTokensResult = { tokenFile: null, figmaSynced: false, figmaOnly: [], usage: {}, tokens: [] };
const EMPTY_COMPONENTS: InspectorComponentsResult = { componentDir: null, previewUrl: null, components: [] };
const MANIFEST = { path: "DESIGN.md", content: "# manifest", exists: true };

test("shows the foundation setup when nothing is extracted yet", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: EMPTY_TOKENS, components: EMPTY_COMPONENTS } },
  });
  await expect(c.getByRole("heading", { name: "Set up the foundation" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Extract tokens/ })).toBeVisible();
});

test("shows living status and the component roster once established", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  // Living status, not "complete".
  await expect(c.getByText(/Foundation ready · 2\/3 built · 1 verified/)).toBeVisible();
  await expect(c.getByText(/complete/i)).toHaveCount(0);
  // Roster rows with their statuses (exact to avoid the summary line).
  await expect(c.getByText("Button", { exact: true })).toBeVisible();
  await expect(c.getByText("verified", { exact: true })).toBeVisible();
  await expect(c.getByText("detected", { exact: true })).toBeVisible();
});

test("offers build for detected, verify/open for built components", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  // Detected Modal → Build; built components → Verify + Open.
  await expect(c.getByRole("button", { name: "Build", exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: "Verify", exact: true }).first()).toBeVisible();
  await expect(c.getByRole("button", { name: "Open", exact: true }).first()).toBeVisible();
  // Always-available add actions.
  await expect(c.getByRole("button", { name: /Build all detected/ })).toBeVisible();
  await expect(c.getByRole("button", { name: "+ New component" })).toBeVisible();
});

test("opens the new-component form", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  await c.getByRole("button", { name: "+ New component" }).click();
  await expect(c.getByPlaceholder(/Component name/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Create component" })).toBeVisible();
});

test("surfaces outputs: manifest + optional publish, no completion gate", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  await expect(c.getByText("Design manifest")).toBeVisible();
  await expect(c.getByRole("button", { name: "Open manifest" })).toBeVisible();
  await expect(c.getByText("Publish to GitHub")).toBeVisible();
  await expect(c.getByText("optional", { exact: true })).toBeVisible();
});
