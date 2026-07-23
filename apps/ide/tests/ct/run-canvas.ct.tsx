import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import { CanvasToolbar } from "@vortspec/ui/CanvasToolbar";
import { DEFAULT_VIEWPORTS } from "@vortspec/ui/viewports";
import { AssignDialog } from "@vortspec/ui/AssignDialog";
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

test("Storybook drives its story nav from the dock's Stories tab", async ({ mount }) => {
  const mock = {
    ...base,
    devStatus: { state: "running", url: "http://localhost:6006", script: "storybook", message: null },
    storybookStatus: { installed: true, hasConfig: true, hasScript: true, storyCount: 3, components: 2, missingStories: 0 },
    storybookIndex: [
      { id: "components-button--primary", title: "Components/Button", name: "Primary", type: "story" as const },
      { id: "components-button--secondary", title: "Components/Button", name: "Secondary", type: "story" as const },
      { id: "components-card--default", title: "Components/Card", name: "Default", type: "story" as const },
    ],
  };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await rail(c).getByRole("button", { name: "Storybook" }).click();
  const dock = c.getByRole("complementary");
  // Storybook's nav lives in the dock's Stories tab (not the in-iframe sidebar).
  await expect(dock.getByRole("button", { name: "Stories", exact: true })).toBeVisible();
  await expect(dock.getByText("Button", { exact: true })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Primary" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Default" })).toBeVisible();
  // Clicking a story drives the embedded Storybook to that story's preview.
  await dock.getByRole("button", { name: "Secondary" }).click();
  await expect(c.locator("iframe")).toHaveAttribute("src", /iframe\.html\?id=components-button--secondary/);
});

test("the Playground shows the unified left dock (Design + Chat tabs), never zero-width", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // Regression: the dock's width was gated on isSidebarView, so outside Explorer it computed
  // to 0 and the whole dock vanished. It must be present with both tabs in the Playground.
  const dock = c.getByRole("complementary");
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button", { name: "Design", exact: true })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Chat", exact: true })).toBeVisible();
});

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
  // Zoom was replaced by the viewport selector — Desktop is the default.
  await expect(bar.getByRole("button", { name: /Desktop/ })).toBeVisible();
  // The Design panel is still a resizable sidebar (like the Explorer rail).
  await expect(c.getByRole("separator", { name: "Resize sidebar" })).toBeVisible();
});

test("the mode and viewport controls exist exactly once on the canvas toolbar", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await openRun(c);
  // The Design panel (now in the left dock) and the Comments panel each used to re-implement
  // these; they live only on the canvas toolbar now — exactly one of each, independent of the
  // dock's Section/Chat tabs.
  const bar = c.getByTestId("canvas-toolbar");
  await expect(bar.getByRole("button", { name: "Inspect" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: /Desktop/ })).toHaveCount(1);
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
  viewport: DEFAULT_VIEWPORTS.desktop,
  frame: "none" as const,
  onViewportChange: () => {},
  onFrameChange: () => {},
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

test("assign dialog: lists the whole roster (recommended first) and assigns any component to all matches", async ({ mount }) => {
  const assigned: { name: string; allSimilar: boolean }[] = [];
  const c = await mount(
    <AssignDialog
      recognized={null}
      recommended="Button"
      components={ROSTER}
      onAssign={(comp, opts) => assigned.push({ name: comp.name, allSimilar: opts.allSimilar })}
      onClose={() => {}}
    />,
  );
  // The whole roster is listed, in the shared picker.
  const list = c.getByTestId("component-picker-list");
  await expect(list.getByRole("button", { name: /ButtonGroup/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Card/ })).toBeVisible();
  // The resembled component is flagged Recommended.
  await expect(c.getByText("Recommended")).toBeVisible();
  // "Apply to every matching element" defaults on.
  await expect(c.getByRole("checkbox")).toBeChecked();
  // Assign a DIFFERENT component than the recommendation — ButtonGroup — to all matches.
  await list.getByRole("button", { name: /ButtonGroup/ }).click();
  expect(assigned).toEqual([{ name: "ButtonGroup", allSimilar: true }]);
});

test("assign dialog: a recognized component shows its badge but still lets you reassign", async ({ mount }) => {
  const c = await mount(
    <AssignDialog recognized="Card" recommended={null} components={ROSTER} onAssign={() => {}} onClose={() => {}} />,
  );
  await expect(c.getByText(/This is your/)).toBeVisible();
  // The roster is available to reassign right away (no separate expand step).
  await expect(c.getByTestId("component-picker-list").getByRole("button", { name: /ButtonGroup/ })).toBeVisible();
});

test("the Design panel no longer carries the assign section", async ({ mount }) => {
  const c = await mount(
    <DesignPanel selection={GAP_SELECTION} tree={null} tokens={[]} onSelectNode={() => {}} onFieldChange={() => {}} />,
  );
  // Assigning moved to the canvas AssignDialog — the sidebar shows properties only.
  await expect(c.getByText(/This is your/)).toHaveCount(0);
  await expect(c.getByPlaceholder("Search components…")).toHaveCount(0);
});

test("the Design panel header can open the assign dialog on demand", async ({ mount }) => {
  let opened = 0;
  const c = await mount(
    <DesignPanel
      selection={GAP_SELECTION}
      tree={null}
      tokens={[]}
      onSelectNode={() => {}}
      onFieldChange={() => {}}
      onAssign={() => (opened += 1)}
    />,
  );
  // A recognized component offers "Replace"; an unrecognized one offers "Assign".
  await c.getByRole("button", { name: "Replace" }).click();
  expect(opened).toBe(1);
});

test("a dialog is draggable by its header", async ({ mount, page }) => {
  await mount(
    <AssignDialog recognized="Card" recommended={null} components={ROSTER} onAssign={() => {}} onClose={() => {}} />,
  );
  // The testid is on the component root, so target it page-level (not as a descendant).
  const panel = page.getByTestId("assign-dialog");
  await expect(panel).toHaveCSS("transform", "none"); // starts unmoved
  const handle = page.getByTestId("dialog-drag-handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 30 - 120, box.y + box.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  // The panel moved (a non-identity transform is now applied).
  await expect(panel).not.toHaveCSS("transform", "none");
});
