import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import { CanvasToolbar } from "@vortspec/ui/CanvasToolbar";
import type { Project, Selection, InspectorToken, InspectorComponent, FsEntry } from "@vortspec/core/ipc";

// `configured: true` matters: App.openProject routes an unconfigured folder to the
// intake walkthrough instead of the workspace, so the activity bar never mounts and
// every test here times out looking for it. The field is optional and treated as
// false, so omitting it silently routes away from the workbench.
const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const fsTree: Record<string, FsEntry[]> = {
  "": [{ name: "README.md", path: "README.md", type: "file" }],
};

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
  fsTree,
  fsFiles: { "README.md": "# Acme\n" },
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

test("the canvas toolbar carries the modes and zoom, bottom-center over the canvas", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  const bar = c.getByTestId("canvas-toolbar");
  await expect(bar).toBeVisible();
  // The modes moved out of the Layers header onto the toolbar the canvas owns.
  await expect(bar.getByRole("button", { name: "Interact" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Inspect" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Comment" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Insert" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Pan" })).toHaveCount(0); // never existed
  await expect(bar.getByRole("button", { name: "100%" })).toBeVisible();
  // The Design panel is still a resizable sidebar (like the Explorer rail).
  await expect(c.getByRole("separator", { name: "Resize Design panel" })).toBeVisible();
});

test("the mode and zoom controls exist exactly once, and survive collapsing Layers", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // The Comments panel used to re-implement this toggle; the Design panel used to
  // own it. Exactly one implementation now, wherever we are.
  await expect(c.getByRole("button", { name: "Inspect" })).toHaveCount(1);
  await expect(c.getByRole("button", { name: "100%" })).toHaveCount(1);
  // Zoom used to live in the Layers footer and vanish with it.
  await c.getByRole("button", { name: /Layers/ }).click();
  await expect(c.getByTestId("canvas-toolbar").getByRole("button", { name: "100%" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Inspect" })).toHaveCount(1);
});

test("interact is the resting default mode", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  const bar = c.getByTestId("canvas-toolbar");
  await expect(bar.getByRole("button", { name: "Interact" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar.getByRole("button", { name: "Inspect" })).toHaveAttribute("aria-pressed", "false");
});

test("a bridge that is still connecting does not disable anything", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // No guest preload mounts in the CT browser, so the bridge is attaching and has
  // NOT failed. This is the same state every live reload passes through
  // (`did-start-loading` → ready=false), so it must not disable a thing —
  // otherwise Inspect/Comment die on each agent-driven reload.
  const bar = c.getByTestId("canvas-toolbar");
  await expect(bar.getByTestId("canvas-bridge-status")).toHaveAttribute("data-state", "connecting");
  await expect(bar.getByRole("button", { name: "Inspect" })).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Comment" })).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Interact" })).toBeEnabled();
});

// The failed state can't be reached through <App /> in CT (no <webview> means the
// guest never sends the ok:false `ready` event that sets bridge.error), so the
// toolbar — a pure presentational component — is driven directly here.
const barProps = {
  mode: "interact" as const,
  onModeChange: () => {},
  zoom: 1,
  onZoomBy: () => {},
  onZoomReset: () => {},
};

test("a failed bridge disables the modes that need it, but never Interact", async ({ mount }) => {
  const c = await mount(
    <CanvasToolbar {...barProps} bridgeReady={false} bridgeError="the page blocked the inspector script" />,
  );
  await expect(c.getByTestId("canvas-bridge-status")).toHaveAttribute("data-state", "failed");
  await expect(c.getByRole("button", { name: "Inspect" })).toBeDisabled();
  await expect(c.getByRole("button", { name: "Comment" })).toBeDisabled();
  await expect(c.getByRole("button", { name: "Insert" })).toBeDisabled();
  // Interact never needs the bridge — the app has to stay usable.
  await expect(c.getByRole("button", { name: "Interact" })).toBeEnabled();
  // The reason reads as a human sentence naming the cause and the next step.
  await expect(c.getByTestId("canvas-bridge-status")).toHaveAttribute(
    "aria-label",
    /blocked the inspector script.*still use the app in Interact/,
  );
});

test("an attached bridge enables every mode", async ({ mount }) => {
  const c = await mount(<CanvasToolbar {...barProps} bridgeReady bridgeError={null} />);
  await expect(c.getByTestId("canvas-bridge-status")).toHaveAttribute("data-state", "live");
  await expect(c.getByRole("button", { name: "Inspect" })).toBeEnabled();
  await expect(c.getByRole("button", { name: "Comment" })).toBeEnabled();
  await expect(c.getByRole("button", { name: "Insert" })).toBeEnabled();
  await expect(c.getByRole("button", { name: "Interact" })).toBeEnabled();
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

// An unrecognized element that resembles Button — the assign picker case.
const UNRECOGNIZED: Selection = {
  nodeId: "n2",
  label: "div",
  component: null,
  file: null,
  resembles: { name: "Button", file: "src/components/ui/Button.tsx" },
  rect: { x: 0, y: 0, width: 80, height: 32 },
  variants: [],
  sections: [],
};
const comp = (name: string, level: "atom" | "molecule" | "organism", variants?: string[]): InspectorComponent => ({
  name,
  level,
  file: `src/components/ui/${name}.tsx`,
  props: [],
  tokens: [],
  status: "built",
  issues: [],
  specPath: null,
  reportPath: null,
  ...(variants ? { variants } : {}),
});
const ROSTER: InspectorComponent[] = [
  comp("Button", "atom", ["variant", "size"]),
  comp("ButtonGroup", "molecule"),
  comp("Card", "molecule"),
];

test("assign picker: lists the whole roster (recommended first) and assigns any component to all matches", async ({ mount }) => {
  const assigned: { name: string; allSimilar: boolean }[] = [];
  const c = await mount(
    <DesignPanel
      selection={UNRECOGNIZED}
      tree={null}
      tokens={[]}
      components={ROSTER}
      resembles={{ name: "Button", file: "src/components/ui/Button.tsx" }}
      onSelectNode={() => {}}
      onFieldChange={() => {}}
      onAssignComponent={(comp, opts) => assigned.push({ name: comp.name, allSimilar: opts.allSimilar })}
    />,
  );
  // The picker is open for an unrecognized element, with the whole roster listed.
  await expect(c.getByPlaceholder("Search components…")).toBeVisible();
  await expect(c.getByRole("button", { name: /ButtonGroup/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /^Card/ })).toBeVisible();
  // The resembled component is flagged Recommended.
  await expect(c.getByText("Recommended")).toBeVisible();
  // "Apply to every matching element" defaults on.
  const allBox = c.getByRole("checkbox");
  await expect(allBox).toBeChecked();
  // Assign a DIFFERENT component than the recommendation — ButtonGroup — to all matches.
  await c.getByRole("button", { name: /ButtonGroup/ }).click();
  expect(assigned).toEqual([{ name: "ButtonGroup", allSimilar: true }]);
});

test("assign picker: a recognized component shows its badge and only assigns via Reassign", async ({ mount }) => {
  const c = await mount(
    <DesignPanel
      selection={GAP_SELECTION}
      tree={null}
      tokens={[]}
      components={ROSTER}
      onSelectNode={() => {}}
      onFieldChange={() => {}}
      onAssignComponent={() => {}}
    />,
  );
  await expect(c.getByText(/This is your/)).toBeVisible();
  // Collapsed by default — the picker only opens on Reassign.
  await expect(c.getByPlaceholder("Search components…")).toHaveCount(0);
  await c.getByRole("button", { name: "Reassign" }).click();
  await expect(c.getByPlaceholder("Search components…")).toBeVisible();
});
