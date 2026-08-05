import { test, expect } from "@playwright/experimental-ct-react";
import { GuidedFlow } from "@vortspec/ui/GuidedFlow";
import type { Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-shadcn",
  path: "/Users/dev/acme-shadcn",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const noop = () => {};

const flowProps = {
  project: PROJECT,
  hideRail: true,
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

const TOKENS = { tokenFile: "src/styles/tokens.css", figmaSynced: false, figmaOnly: [], usage: {}, tokens: [{ name: "--color-primary", rawValue: "#000", resolvedValue: "#000", type: "color", source: "generated-code", uses: [] }] };

// A library project whose components have NOT been provisioned (no detected components).
const unprovisioned = {
  projectConfig: { designSource: "library", componentLibrary: "shadcn" },
  components: { componentDir: "src/components", previewUrl: null, components: [] },
  tokens: TOKENS,
};

test("a library project with no components nudges to provision, not to rebuild", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...flowProps} />, { hooksConfig: { mock: unprovisioned } });
  // The un-provisioned empty state names the library and offers provisioning (the CTA
  // appears both in the action bar and the empty-state card).
  await expect(c.getByText(/hasn.t been provisioned yet/i)).toBeVisible();
  await expect(c.getByRole("button", { name: /Provision shadcn/i }).first()).toBeVisible();
  await expect(c.getByRole("button", { name: /Provision shadcn/i })).toHaveCount(2);
  // It must NOT present the from-scratch build affordances as the primary path.
  await expect(c.getByRole("button", { name: /Build only|Build & verify the rest/ })).toHaveCount(0);
});

// QUARANTINED [ASSERT] — see QUARANTINE.md
test.fixme("clicking Provision runs the /provision-library flow, not a component build", async ({ mount }) => {
  const c = await mount(<GuidedFlow {...flowProps} />, { hooksConfig: { mock: unprovisioned } });
  await c.getByRole("button", { name: /Provision shadcn/i }).first().click();
  const prompts = await c
    .page()
    .evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts ?? []);
  const provisionRun = prompts.find((p) => p.includes("/provision-library"));
  expect(provisionRun).toBeTruthy();
  // It provisions the real library, never rebuilds from scratch.
  expect(provisionRun).toContain("do NOT hand-build components the library already ships");
});

test("a provisioned library shows the roster + a Re-provision affordance", async ({ mount }) => {
  const provisioned = {
    projectConfig: { designSource: "library", componentLibrary: "shadcn" },
    components: {
      componentDir: "src/components",
      previewUrl: null,
      components: [
        { name: "Button", level: "atom", description: "shadcn button", file: "src/components/ui/button.tsx", props: [], tokens: [], status: "detected", issues: [], specPath: null, reportPath: null },
      ],
    },
    tokens: TOKENS,
  };
  const c = await mount(<GuidedFlow {...flowProps} />, { hooksConfig: { mock: provisioned } });
  await expect(c.getByText(/hasn.t been provisioned yet/i)).toHaveCount(0);
  await expect(c.getByRole("button", { name: /Re-provision library/i })).toBeVisible();
});
