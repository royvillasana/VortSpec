import { test, expect } from "@playwright/experimental-ct-react";
import { GuidedFlow } from "@vortspec/ui/GuidedFlow";
import { PROJECT } from "./support/fixtures";
import type { InspectorComponentsResult, InspectorTokensResult } from "@vortspec/core/ipc";
import type { RunEvent } from "@vortspec/core/run-events";

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
  onOpenSource: noop,
  onOpenRunApp: noop,
  onOpenTasks: noop,
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

// figma-cli connected — the primary component reader (Wave 3).
const CLI_CONNECTED = {
  installed: true,
  cliDir: "/Users/dev/figma-cli",
  daemonRunning: true,
  connected: true,
  mode: "yolo" as const,
  openFiles: ["Design Engineering System"],
  appName: "VortSpec",
  message: "Connected to Figma Desktop (yolo mode).",
};

// A reconciled roster: Button is Figma-backed with variant axes; Tooltip is
// designed in Figma but not yet built.
const ROSTER_FIGMA: InspectorComponentsResult = {
  ...ROSTER,
  components: ROSTER.components.map((c) =>
    c.name === "Button" ? { ...c, figmaBacked: true, figmaVariants: ["Type", "Size"] } : c,
  ),
  figmaOnly: [{ name: "Tooltip", isSet: true, variants: ["Placement"] }],
  figmaSynced: true,
};

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
  // Living status pills, not "complete".
  await expect(c.getByText("foundation ready")).toBeVisible();
  await expect(c.getByText("2/3 built")).toBeVisible();
  await expect(c.getByText("1 verified")).toBeVisible();
  await expect(c.getByText(/complete/i)).toHaveCount(0);
  // The dashboard rail's category nav jumps to each level + the outputs.
  const nav = c.getByRole("navigation");
  await expect(nav.getByRole("button", { name: /Atoms/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /Organisms/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /Outputs/ })).toBeVisible();
  await nav.getByRole("button", { name: /Organisms/ }).click();
  // Roster rows with their statuses (exact to avoid the summary line).
  await expect(c.getByText("Button", { exact: true })).toBeVisible();
  await expect(c.getByText("verified", { exact: true })).toBeVisible();
  await expect(c.getByText("detected", { exact: true })).toBeVisible();
});

test("re-source: a founded project offers a source input + Merge / Clean-sweep (Steps 4/5)", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  // The re-source panel lives in the collapsible Foundation header — expand it.
  await c.getByRole("button", { name: /Foundation.*ready/ }).click();
  await expect(c.getByText("Add a design source")).toBeVisible();
  await expect(c.getByPlaceholder("Figma file URL")).toBeVisible();
  await expect(c.getByRole("button", { name: "Merge" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Clean sweep" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Pick a folder/ })).toBeVisible(); // local source (Step 5)
});

test("re-source: an un-founded project shows setup, not the Merge / Clean-sweep choice", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: EMPTY_TOKENS, components: EMPTY_COMPONENTS } },
  });
  await expect(c.getByRole("heading", { name: "Set up the foundation" })).toBeVisible();
  await expect(c.getByText("Add a design source")).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Merge" })).toHaveCount(0);
});

test("offers build for detected, verify/open for built components", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  // Detected Modal → Build; built components → Verify + Open.
  await expect(c.getByRole("button", { name: "Build", exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: "Verify", exact: true }).first()).toBeVisible();
  await expect(c.getByRole("button", { name: "Open", exact: true }).first()).toBeVisible();
  // Incremental add/build actions: build-only, the build+verify pipeline, and new.
  await expect(c.getByRole("button", { name: /Build only/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /Build & verify the rest/ })).toBeVisible();
  await expect(c.getByRole("button", { name: "+ New component" })).toBeVisible();
  // Re-scan the design source to reconcile against what's already built.
  await expect(c.getByRole("button", { name: /Re-scan/ })).toBeVisible();
});

test("reconciles the roster against Figma components read via figma-cli (Wave 3)", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: { tokens: TOKENS, components: ROSTER_FIGMA, manifest: MANIFEST, figma: CLI_CONNECTED },
    },
  });
  // Figma-backed component wears a badge with its variant-axis count (2).
  await expect(c.getByText("Figma ·2", { exact: true })).toBeVisible();
  // Header summary reflects the reconciliation.
  await expect(c.getByText(/1 in Figma · 1 not built/)).toBeVisible();
  // "Designed in Figma, not yet built" surfaces Tooltip.
  await expect(c.getByText("In Figma, not yet built")).toBeVisible();
  await expect(c.getByText("Tooltip", { exact: false })).toBeVisible();
  // The CLI-primary read button is offered (not the MCP re-scan) and reads on click.
  const readBtn = c.getByRole("button", { name: /Figma components/ });
  await expect(readBtn).toBeVisible();
  await readBtn.click();
  await expect(c.getByText(/Read 8 Figma components via figma-cli/)).toBeVisible();
});

test("hides the Figma read button when figma-cli isn't connected", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  // No CLI connection → only the MCP re-scan path is offered.
  await expect(c.getByRole("button", { name: /Figma components/ })).toHaveCount(0);
  await expect(c.getByRole("button", { name: /Build Figma selection/ })).toHaveCount(0);
  await expect(c.getByRole("button", { name: /Re-scan/ })).toBeVisible();
});

test("builds the selected Figma node through the gated build (Wave 3 convenience)", async ({ mount }) => {
  const BUILD_SEL: RunEvent[] = [
    { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-s", tools: ["Read", "Write"], mcpServers: [], mcpErrors: [] },
    { kind: "result", isError: false, text: "done", sessionId: "sess-s" },
  ];
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: {
        tokens: TOKENS,
        components: ROSTER,
        manifest: MANIFEST,
        figma: CLI_CONNECTED,
        runScript: BUILD_SEL,
        figmaSelection: { nodes: [{ id: "42:7", name: "Toolbar", type: "COMPONENT_SET" }], message: "1 node selected." },
      },
    },
  });
  const btn = c.getByRole("button", { name: "Build Figma selection" });
  await expect(btn).toBeVisible();
  await btn.click();
  // The gated build run starts, labelled with the selected node.
  await expect(c.getByText(/Building "Toolbar" from the Figma selection/)).toBeVisible();
});

test("guides the user when nothing is selected in Figma", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: {
        tokens: TOKENS,
        components: ROSTER,
        manifest: MANIFEST,
        figma: CLI_CONNECTED,
        figmaSelection: { nodes: [], message: "Nothing selected in Figma — select a component or frame, then try again." },
      },
    },
  });
  await c.getByRole("button", { name: "Build Figma selection" }).click();
  await expect(c.getByText(/Nothing selected in Figma/)).toBeVisible();
});

test("verify shows the outcome, not the raw checklist, and reports issues", async ({ mount }) => {
  const VERIFY_RUN: RunEvent[] = [
    { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-v", tools: ["Read", "Bash"], mcpServers: [], mcpErrors: [] },
    { kind: "assistant-text", text: "Button: ISSUES (1)" },
    { kind: "result", isError: false, text: "done", sessionId: "sess-v" },
  ];
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: {
        tokens: TOKENS,
        components: ROSTER,
        manifest: MANIFEST,
        runScript: VERIFY_RUN,
        verification: {
          findings: [
            { id: "button:D1", rawId: "D1", component: "Button", group: "adversarial", severity: "major", title: "hardcoded #F4A500", detail: "in .btn--primary", status: "open", reportPath: "specs/button/reports/x.md" },
          ],
        },
      },
    },
  });
  // "Verify all" runs the autonomous verify and, on completion, shows a summary card.
  await c.getByRole("button", { name: "Verify all" }).click();
  await expect(c.getByText(/1 open finding/)).toBeVisible();
  await expect(c.getByText(/hardcoded #F4A500/)).toBeVisible();
  // The raw transcript is hidden behind "View details", not shown by default.
  await expect(c.getByRole("button", { name: "View details" })).toBeVisible();
});

test("reflects an in-flight run started elsewhere", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST, hasActiveRun: true } },
  });
  await expect(c.getByText(/A run is in progress for this project/)).toBeVisible();
  await expect(c.getByRole("button", { name: /Watch it/ })).toBeVisible();
});

test("offers to resume an interrupted run and resumes on click", async ({ mount }) => {
  const RESUME_RUN: RunEvent[] = [
    { kind: "system-init", model: "claude-opus-4-8", sessionId: "sess-r", tools: [], mcpServers: [], mcpErrors: [] },
    { kind: "result", isError: false, text: "done", sessionId: "sess-r" },
  ];
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: {
        tokens: TOKENS,
        components: ROSTER,
        manifest: MANIFEST,
        runScript: RESUME_RUN,
        lastRun: {
          sessionId: "sess-r",
          title: "Building & verifying 3 components",
          kind: "pipeline",
          total: 3,
          status: "cancelled",
          updatedAt: "2026-07-07T00:00:00.000Z",
        },
      },
    },
  });
  // The resume prompt surfaces the interrupted run.
  await expect(c.getByText(/was interrupted/)).toBeVisible();
  const resumeBtn = c.getByRole("button", { name: "Resume" });
  await expect(resumeBtn).toBeVisible();
  // Clicking Resume starts a run — the resume card gives way to the run card.
  await resumeBtn.click();
  await expect(c.getByText(/was interrupted/)).toHaveCount(0);
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
  // The holistic progress card renders for a build (same structure as verify —
  // "View details" is its stable affordance; stage-derivation is unit-tested).
  await expect(c.getByRole("button", { name: /View details|Hide details/ })).toBeVisible();
  // After the run completes, the roster re-reads and no detected row remains.
  await expect(c.getByText("detected", { exact: true })).toHaveCount(0);
  await expect(c.getByText("3/3 built")).toBeVisible();
});

test("surfaces outputs: manifest + optional publish, no completion gate", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER, manifest: MANIFEST } },
  });
  await expect(c.getByText("Design manifest")).toBeVisible();
  await expect(c.getByRole("button", { name: "Open manifest" })).toBeVisible();
  await expect(c.getByText("GitHub & source control")).toBeVisible();
  await expect(c.getByRole("button", { name: "Open Source Control" })).toBeVisible();
  await expect(c.getByText("optional", { exact: true }).first()).toBeVisible();
  // Non-destructive refactor (M4) — enabled once the manifest exists.
  await expect(c.getByText("Refactor existing screens")).toBeVisible();
  await expect(c.getByRole("button", { name: /Refactor screens/ })).toBeEnabled();
});

test("gates the refactor action until the manifest exists (M4)", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: {
      mock: { tokens: TOKENS, components: ROSTER, manifest: { path: "DESIGN.md", content: "", exists: false } },
    },
  });
  await expect(c.getByRole("button", { name: /Refactor screens/ })).toBeDisabled();
});

// A roster of six detected components (five atoms + one organism) with no source
// files — the chunked build should split them into a chunk of five (Haiku) and a
// chunk of one organism (Sonnet).
const SIX_DETECTED: InspectorComponentsResult = {
  componentDir: "src/components",
  previewUrl: null,
  components: [
    ...["Button", "Input", "Label", "Badge", "Icon"].map((name) => ({
      name, level: "atom", description: `${name} atom`, file: null, props: [], tokens: [],
      status: "unknown" as const, issues: [], specPath: null, reportPath: null,
    })),
    { name: "Dialog", level: "organism", description: "Dialog organism", file: null, props: [], tokens: [], status: "unknown" as const, issues: [], specPath: null, reportPath: null },
  ],
};

test("builds remaining components in chunks of five, routed by complexity", async ({ mount, page }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: SIX_DETECTED, manifest: MANIFEST, runScript: BUILD_RUN } },
  });
  await c.getByRole("button", { name: /Build only \(6\)/ }).click();
  // The queue drains into two sequential runs (5 + 1).
  await expect
    .poll(async () => (await page.evaluate(() => (window as unknown as { __runOpts: unknown[] }).__runOpts.length)))
    .toBe(2);
  const opts = await page.evaluate(
    () => (window as unknown as { __runOpts: { prompt: string; model?: string }[] }).__runOpts,
  );
  // First chunk: the five atoms, on Haiku, scoped so no other component is built.
  expect(opts[0].model).toBe("haiku");
  expect(opts[0].prompt).toContain('"Button", "Input", "Label", "Badge", "Icon"');
  expect(opts[0].prompt).toMatch(/Do NOT build any other component/);
  expect(opts[0].prompt).not.toContain("Dialog");
  // Second chunk: the lone organism, scoped to just it.
  expect(opts[1].prompt).toContain('"Dialog"');
  expect(opts[1].prompt).not.toContain("Button");
});

// A collapsed variant set: ONE component carrying its variant axes (not 40 rows).
const ROSTER_VARIANTS: InspectorComponentsResult = {
  componentDir: "src/components",
  previewUrl: null,
  components: [
    {
      name: "form-item", level: "molecule", description: "Labeled form field", file: null,
      props: [], tokens: [], status: "unknown", issues: [], specPath: null, reportPath: null,
      variants: ["orientation", "control"],
    },
  ],
};

test("shows a collapsed variant set's axes in the roster (not one row per variant)", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...props} />, {
    hooksConfig: { mock: { tokens: TOKENS, components: ROSTER_VARIANTS, manifest: MANIFEST } },
  });
  await expect(c.getByText("form-item", { exact: true })).toBeVisible();
  // The variant axes badge, not 40 separate form-item rows.
  await expect(c.getByText(/orientation · control/)).toBeVisible();
});
