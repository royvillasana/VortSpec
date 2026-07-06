import { test, expect } from "@playwright/experimental-ct-react";
import { GuidedFlow } from "../../src/renderer/src/views/GuidedFlow";
import { PROJECT } from "./support/fixtures";
import type { InspectorComponentsResult, InspectorTokensResult } from "../../src/shared/ipc";
import type { RunEvent } from "../../src/shared/run-events";

// A recorded build run: init → generate-artifacts + implement → done.
const BUILD_RUN: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-b", tools: ["Read", "Write", "Edit", "Bash"], mcpServers: [], mcpErrors: [] },
  { kind: "tool-use", id: "t1", name: "Write", path: "src/components/Modal.tsx" },
  { kind: "assistant-text", text: "Implemented the Modal component." },
  { kind: "result", isError: false, text: "done", sessionId: "sess-b" },
];

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
  // Re-scan the design source to reconcile against what's already built.
  await expect(c.getByRole("button", { name: /Re-scan/ })).toBeVisible();
});

test("opens the new-component form", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  await c.getByRole("button", { name: "+ New component" }).click();
  await expect(c.getByPlaceholder(/Component name/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Create component" })).toBeVisible();
});

test("build-one runs a transcript, then the roster reflects it from files", async ({ mount }) => {
  // Modal starts detected; after the recorded build run, the roster (re-read from
  // files) shows Modal built, so its row switches from Build to Verify/Open.
  const AFTER: InspectorComponentsResult = {
    componentDir: "src/components",
    previewUrl: null,
    components: ROSTER.components.map((c) =>
      c.name === "Modal"
        ? { ...c, file: "src/components/Modal.tsx", status: "built" as const }
        : c,
    ),
  };
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST, runScript: BUILD_RUN, componentsAfterRun: AFTER },
    },
  });
  // Modal is the only detected component → its row shows Build.
  await c.getByRole("button", { name: "Build", exact: true }).click();
  // After the run completes, the roster re-reads and no detected row remains.
  await expect(c.getByText("detected", { exact: true })).toHaveCount(0);
  await expect(c.getByText(/Foundation ready · 3\/3 built/)).toBeVisible();
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
