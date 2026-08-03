import { test, expect } from "@playwright/experimental-ct-react";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import type { BridgeTree, Selection } from "@vortspec/core/ipc";

/**
 * The Playground sidebar's shell (change: design-system-style-panel, Phase 1): a searchable layer tree
 * over a resizable boundary over a tabbed detail region. The tabs only exist when there is a Library to
 * show — a tab that leads nowhere would be worse than no tab.
 */

const node = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag,
  classes: [],
  childCount: 0,
  ...extra,
});

// div > card > (header, footer)
const TREE = {
  roots: ["div"],
  nodes: {
    div: node("div"),
    card: node("div", { component: "card" }),
    header: node("header", { component: "header" }),
    footer: node("footer", { component: "footer" }),
  },
  children: { div: ["card"], card: ["header", "footer"] },
} as unknown as BridgeTree;

const SELECTION = {
  nodeId: "card",
  label: "card",
  component: "Card",
  rect: { x: 0, y: 0, width: 1280, height: 720 },
  variants: [],
  sections: [],
} as unknown as Selection;

// The panel persists its tree height + active tab per project, so each test gets its own key — otherwise
// one test's tab click would decide the next test's starting tab.
test("no Library panel means no tab bar at all", async ({ mount }) => {
  const c = await mount(<DesignPanel storageKey="ct-no-library" selection={null} tree={TREE} onSelectNode={() => {}} />);
  await expect(c.getByRole("button", { name: "Design Attributes" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Library" })).toHaveCount(0);
  // The attributes body is still what shows, exactly as before the restructure.
  await expect(c.getByText("Select an element on the canvas to edit its properties.")).toBeVisible();
});

test("the detail region is tabbed, and the tree survives switching tabs", async ({ mount }) => {
  const c = await mount(
    <DesignPanel
      storageKey="ct-tabs"
      selection={SELECTION}
      tree={TREE}
      onSelectNode={() => {}}
      libraryPanel={<div data-testid="library">library body</div>}
    />,
  );

  // Design Attributes is the default, headed by the selection's size. (Its NAME is not asserted here —
  // "card" is also a tree row, so the name alone is ambiguous by construction.)
  await expect(c.getByText("1280 × 720")).toBeVisible();
  await expect(c.getByTestId("library")).toHaveCount(0);

  await c.getByRole("button", { name: "Library" }).click();
  await expect(c.getByTestId("library")).toBeVisible();
  // The selection's own header is gone with the tab, but the TREE is not — it lives above the tabs.
  await expect(c.getByText("1280 × 720")).toHaveCount(0);
  await expect(c.getByRole("button", { name: /card/ })).toBeVisible();

  await c.getByRole("button", { name: "Design Attributes" }).click();
  await expect(c.getByText("1280 × 720")).toBeVisible();
});

test("layer search reaches a collapsed layer, and clearing restores the tree", async ({ mount }) => {
  const c = await mount(<DesignPanel storageKey="ct-search" selection={null} tree={TREE} onSelectNode={() => {}} />);

  // The tree starts collapsed at the root, so `footer` is nested out of sight — reaching it would
  // normally mean expanding every level. This is exactly what the search exists to skip.
  await expect(c.getByRole("button", { name: /footer/ })).toHaveCount(0);

  await c.getByRole("button", { name: "Search layers" }).click();
  await c.getByLabel("Find a layer by name").fill("footer");

  // The match is now reachable in one step; its sibling is not, or the search did nothing.
  await expect(c.getByRole("button", { name: /footer/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /header/ })).toHaveCount(0);
  // Its ancestor stays, so the match's place in the hierarchy is still readable.
  await expect(c.getByRole("button", { name: /card/ })).toBeVisible();

  // Closing the search clears it — the tree is never left silently filtered.
  await c.getByRole("button", { name: "Close layer search" }).click();
  await expect(c.getByRole("button", { name: /footer/ })).toHaveCount(0);
});

test("the tree/detail boundary is a resize handle", async ({ mount }) => {
  const c = await mount(<DesignPanel storageKey="ct-resize" selection={null} tree={TREE} onSelectNode={() => {}} />);
  await expect(c.getByRole("separator", { name: "Resize the layer tree" })).toBeVisible();
});

test("the layer tree multi-selects with a modifier, and marks which member is focused", async ({
  mount,
}) => {
  // The tree and the canvas share ONE selection, so the tree needs the same gesture the canvas has —
  // otherwise the two surfaces disagree about what "the selection" is and every panel reading it is
  // guessing. The tree only reports the gesture; the host owns what it means, so both converge on one rule.
  const calls: [string, boolean | undefined][] = [];
  const c = await mount(
    <DesignPanel
      storageKey="ct-multiselect"
      selection={SELECTION}
      // `card` is the focused member (SELECTION.nodeId); `div` is its ancestor, which the tree expands to
      // reveal the focus — so both rows are on screen without driving a disclosure.
      selectedIds={["div", "card"]}
      tree={TREE}
      onSelectNode={(id, additive) => calls.push([id, additive])}
    />,
  );

  // A member that is NOT the panel's subject still reads as selected. Matched loosely because a row's
  // accessible name carries its disclosure glyph ("▾ div"); the glyph's own button is named just "▾", so
  // this cannot match it by accident.
  const other = c.getByRole("button", { name: /div/ });
  await expect(other).toHaveClass(/bg-vs-accent-subtle/);

  await other.click();
  expect(calls.at(-1)).toEqual(["div", false]);

  await other.click({ modifiers: ["Shift"] });
  expect(calls.at(-1)).toEqual(["div", true]);
});

test("select-all-matching names its criterion instead of guessing at one", async ({ mount }) => {
  // "Select things like this" means several different things. Naming the criterion is what lets the user
  // know which set they are about to edit — and the result is SELECTED, not edited, so it can be pruned
  // first. A bulk edit you can review beats one you have to undo.
  const calls: string[] = [];
  const c = await mount(
    <DesignPanel
      storageKey="ct-selectmatching"
      selection={SELECTION}
      tree={TREE}
      onSelectNode={() => {}}
      onSelectMatching={(by) => calls.push(by)}
    />,
  );

  // The component criterion is named after the actual component, not a generic "similar".
  await c.getByRole("button", { name: "All Cards" }).click();
  expect(calls.at(-1)).toBe("component");

  await c.getByRole("button", { name: "Same tag" }).click();
  expect(calls.at(-1)).toBe("tag");
});

test("no component means no component criterion to offer", async ({ mount }) => {
  const plain = { ...SELECTION, component: null } as typeof SELECTION;
  const c = await mount(
    <DesignPanel
      storageKey="ct-selectmatching-plain"
      selection={plain}
      tree={TREE}
      onSelectNode={() => {}}
      onSelectMatching={() => {}}
    />,
  );

  await expect(c.getByRole("button", { name: /^All / })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Same tag" })).toBeVisible();
});
