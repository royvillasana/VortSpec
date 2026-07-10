import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import type { Project, Selection, InspectorToken } from "@vortspec/core/ipc";

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

const rail = (c: import("@playwright/test").Locator) =>
  c.getByRole("navigation", { name: "Activity bar" });

async function openRun(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await rail(c).getByRole("button", { name: "Playground" }).click();
}

test("the Run activity shows the Figma-style Design panel beside the canvas", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // The Design panel replaces the file Explorer here: Layers + an empty-selection hint.
  await expect(c.getByRole("button", { name: /Layers/ })).toBeVisible();
  await expect(c.getByText(/Select an element on the canvas/)).toBeVisible();
  // With no guest preload in the CT browser, the canvas shows its preparing state
  // (no real <webview> is mounted).
  await expect(c.getByText(/Preparing canvas/)).toBeVisible();
});

test("the Layers tree shows an empty state until the app renders", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  await expect(c.getByText(/No elements yet/)).toBeVisible();
});

test("the Run view offers to create a missing .env", async ({ mount }) => {
  const mock = { ...base, envStatus: { hasEnv: false, examples: [".env.example"] } };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await openRun(c);
  await expect(c.getByText(/may fail at runtime without its environment variables/)).toBeVisible();
  await expect(c.getByRole("button", { name: /Create \.env from \.env\.example/ })).toBeVisible();
});

test("the Layers header carries the mode toggle and a zoom control at the bottom", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // Inspect / Interact live beside the Layers label (the canvas viewport stays clean).
  await expect(c.getByRole("button", { name: "Inspect" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Interact" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Pan" })).toHaveCount(0); // Pan removed
  // Zoom readout sits at the bottom of the Layers region.
  await expect(c.getByRole("button", { name: "100%" })).toBeVisible();
  // The Design panel is a resizable sidebar (like the Explorer rail).
  await expect(c.getByRole("separator", { name: "Resize Design panel" })).toBeVisible();
});

// A gap bound to space-20; the project has space-16 too.
const GAP_SELECTION: Selection = {
  nodeId: "n1",
  label: "Card",
  component: "Card",
  file: "src/Card.tsx",
  resembles: null,
  rect: { x: 0, y: 0, width: 100, height: 40 },
  variants: [],
  sections: [
    {
      id: "layout",
      title: "Auto layout",
      fields: [{ key: "gap", label: "Gap", kind: "length", value: "20px", token: "space-20", tokenType: "spacing", options: [] }],
    },
  ],
};
const SPACING_TOKENS: InspectorToken[] = [
  { name: "space-20", type: "spacing", rawValue: "20px", resolvedValue: "20px", source: "generated-code", uses: 2 },
  { name: "space-16", type: "spacing", rawValue: "16px", resolvedValue: "16px", source: "generated-code", uses: 1 },
];

test("re-binding a length token updates the field to the new token + value immediately", async ({ mount }) => {
  const changes: [string, string][] = [];
  const c = await mount(
    <DesignPanel
      selection={GAP_SELECTION}
      tree={null}
      tokens={SPACING_TOKENS}
      onSelectNode={() => {}}
      onFieldChange={(k, v) => changes.push([k, v])}
    />,
  );
  // Starts bound to space-20 / 20px.
  await expect(c.getByTitle(/Variable: space-20/)).toBeVisible();
  await expect(c.getByRole("textbox")).toHaveValue("20px");

  // Open the ◆ picker and choose space-16.
  await c.getByTitle(/Variable: space-20/).click();
  await c.getByRole("button", { name: /space-16/ }).click();

  // The field reflects the new binding right away — before any apply.
  await expect(c.getByTitle(/Variable: space-16/)).toBeVisible();
  await expect(c.getByRole("textbox")).toHaveValue("16px");
  // …and it emitted the var() binding for the ephemeral override / pending edit.
  expect(changes).toContainEqual(["gap", "var(--space-16)"]);
});

test("removing the edit (a fresh readout) snaps the field back to the node's real token", async ({ mount }) => {
  // The node is currently showing a picked space-16 binding…
  const boundTo16: Selection = {
    ...GAP_SELECTION,
    sections: [
      {
        id: "layout",
        title: "Auto layout",
        fields: [{ key: "gap", label: "Gap", kind: "length", value: "16px", token: "space-16", tokenType: "spacing", options: [] }],
      },
    ],
  };
  const c = await mount(
    <DesignPanel selection={boundTo16} tree={null} tokens={SPACING_TOKENS} onSelectNode={() => {}} onFieldChange={() => {}} />,
  );
  await expect(c.getByTitle(/Variable: space-16/)).toBeVisible();
  await expect(c.getByRole("textbox")).toHaveValue("16px");

  // Removing the pending edit reverts the canvas and re-reads the node (refreshReadout),
  // so the panel now receives the original space-20 / 20px readout.
  await c.update(
    <DesignPanel selection={GAP_SELECTION} tree={null} tokens={SPACING_TOKENS} onSelectNode={() => {}} onFieldChange={() => {}} />,
  );
  await expect(c.getByTitle(/Variable: space-20/)).toBeVisible();
  await expect(c.getByRole("textbox")).toHaveValue("20px");
});
