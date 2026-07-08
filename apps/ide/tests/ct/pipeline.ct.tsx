import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import { DEFAULT_FLOW } from "@vortspec/core/flow";
import type { Flow, Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
};

/** A flow with the design-system stage approved and Components as the current one. */
const FLOW: Flow = {
  definitions: DEFAULT_FLOW,
  state: {
    currentStageId: "components",
    stages: DEFAULT_FLOW.map((d) => ({
      id: d.id,
      status: d.id === "design-system" ? "approved" : "pending",
      updatedAt: "2026-07-08T00:00:00.000Z",
    })),
  },
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await c
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "SDD-DE pipeline" })
    .click();
}

test("the pipeline activity surfaces every core-defined SDD-DE stage (parity)", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, flow: FLOW } } });
  await open(c);
  await expect(c.getByRole("heading", { name: "SDD-DE pipeline" })).toBeVisible();
  // Every stage title comes from @vortspec/core's DEFAULT_FLOW — so a core edit
  // (rename/reorder/add a stage) shows up here with no IDE change. This is the
  // parity check: the panel renders whatever core defines.
  for (const def of DEFAULT_FLOW) {
    await expect(c.getByRole("heading", { name: def.title })).toBeVisible();
  }
});

test("overlays file-derived status from core flow state", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, flow: FLOW } } });
  await open(c);
  // design-system is approved; the approval count reflects required stages.
  await expect(c.getByText("Approved").first()).toBeVisible();
  const required = DEFAULT_FLOW.filter((d) => !d.optional).length;
  await expect(c.getByText(`1/${required} stages approved`)).toBeVisible();
  // Gated stages advertise the gate.
  await expect(c.getByText("gated").first()).toBeVisible();
});

test("falls back to the core stage definitions before a flow exists", async ({ mount }) => {
  // No flow fixture → getFlow returns null; the panel still renders the shape
  // from DEFAULT_FLOW with every stage pending.
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await expect(c.getByRole("heading", { name: DEFAULT_FLOW[0]!.title })).toBeVisible();
  await expect(c.getByText("Pending").first()).toBeVisible();
});
