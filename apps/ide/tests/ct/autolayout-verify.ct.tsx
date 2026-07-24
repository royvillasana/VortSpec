import { test, expect } from "@playwright/experimental-ct-react";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import type { Selection, InspectorToken } from "@vortspec/core/ipc";

// Verification artifact for the Figma-style Auto Layout panel (per-side padding/margin
// BoxField + Flow icons). Mounts the REAL DesignPanel in Chromium and drives it.

const TOKENS: InspectorToken[] = [
  { name: "space-4", type: "spacing", rawValue: "16px", resolvedValue: "16px", source: "generated-code", uses: 3 },
  { name: "space-8", type: "spacing", rawValue: "32px", resolvedValue: "32px", source: "generated-code", uses: 1 },
];

// padding: 12/20/14/18 — all RAW (no token match) so every side is an editable input →
// Individual mode. margin: all 8px (raw) → All mode (single input). flow: row (icon).
const SELECTION: Selection = {
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
      fields: [
        { key: "flow", label: "Flow", kind: "segment", value: "row", token: null, options: ["block", "row", "column"] },
        { key: "padding", label: "Padding", kind: "box", value: "12px|20px|14px|18px", token: null, tokenType: "spacing", options: [] },
        { key: "margin", label: "Margin", kind: "box", value: "8px|8px|8px|8px", token: null, tokenType: "spacing", options: [] },
      ],
    },
  ],
};

const row = (c: import("@playwright/test").Locator, label: string) =>
  c.getByText(label, { exact: true }).locator(".."); // the Row div (label span + control)

test("Auto Layout panel: per-side padding, All-mode margin, Flow icons — driven live", async ({ mount }) => {
  const changes: [string, string][] = [];
  const c = await mount(
    <DesignPanel
      selection={SELECTION}
      tree={null}
      tokens={TOKENS}
      onSelectNode={() => {}}
      onFieldChange={(k, v) => changes.push([k, v])}
    />,
  );

  const padding = row(c, "Padding");
  const margin = row(c, "Margin");

  // 1) Padding starts in Individual mode (4 independent side inputs) — the whole point:
  //    top/right/bottom/left are separately editable, not a symmetric X/Y pair.
  const padInputs = padding.getByRole("textbox");
  await expect(padInputs).toHaveCount(4);
  await expect(padInputs.nth(0)).toHaveValue("12"); // top
  await expect(padInputs.nth(1)).toHaveValue("20"); // right
  await expect(padInputs.nth(2)).toHaveValue("14"); // bottom
  await expect(padInputs.nth(3)).toHaveValue("18"); // left
  // Individual = "unlinked": the link toggle reads pressed.
  await expect(padding.getByRole("button", { name: "Link sides" })).toHaveAttribute("aria-pressed", "true");

  // 2) Margin (all sides equal) collapses to a single All-mode input, link toggle NOT pressed.
  const marInputs = margin.getByRole("textbox");
  await expect(marInputs).toHaveCount(1);
  await expect(marInputs.nth(0)).toHaveValue("8");
  await expect(margin.getByRole("button", { name: "Link sides" })).toHaveAttribute("aria-pressed", "false");

  // 3) Flow renders as icon buttons (aria-labelled), with the current value pressed.
  const flow = row(c, "Flow");
  await expect(flow.getByRole("button", { name: "block" })).toBeVisible();
  await expect(flow.getByRole("button", { name: "row" })).toHaveAttribute("aria-pressed", "true");
  await expect(flow.getByRole("button", { name: "column" })).toHaveAttribute("aria-pressed", "false");

  // 4) Edit ONE padding side (top) → emits only that side, never clobbering the others.
  await padInputs.nth(0).fill("24");
  await padInputs.nth(0).blur();
  expect(changes).toContainEqual(["padding", "top:24px"]);

  // 5) Cycle the margin link toggle: All → H·V (two inputs appear).
  await margin.getByRole("button", { name: "Link sides" }).click();
  await expect(margin.getByRole("textbox")).toHaveCount(2);

  // 6) Switch Flow to column → the segmented control emits the new value.
  await flow.getByRole("button", { name: "column" }).click();
  expect(changes).toContainEqual(["flow", "column"]);

  await c.screenshot({ path: "test-results/autolayout-panel.png" });
});

// margin = 16px on every side → matches space-4 → All-mode input should show the token pill.
const TOKENED: Selection = {
  ...SELECTION,
  sections: [
    {
      id: "layout",
      title: "Auto layout",
      fields: [
        { key: "margin", label: "Margin", kind: "box", value: "16px|16px|16px|16px", token: null, tokenType: "spacing", options: [] },
      ],
    },
  ],
};

test("Auto Layout panel: box sides are token-aware, and a linked token replicates to every side", async ({ mount }) => {
  const changes: [string, string][] = [];
  const c = await mount(
    <DesignPanel
      selection={TOKENED}
      tree={null}
      tokens={TOKENS}
      onSelectNode={() => {}}
      onFieldChange={(k, v) => changes.push([k, v])}
    />,
  );
  const margin = row(c, "Margin");
  // A BOUND side is a clickable chip BUTTON (not an editable input): the whole square
  // opens the picker. The bound token is the button's accessible name.
  const chip = (n = 0) => margin.getByRole("button", { name: /^Variable:/ }).nth(n);

  // 1) All-mode value equals space-4 → it's a bound chip button (no editable input).
  await expect(margin.getByRole("textbox")).toHaveCount(0);
  await expect(margin.getByRole("button", { name: "Variable: space-4" })).toContainText("16"); // value + ◆

  // 2) Click the chip (anywhere) → picker → bind space-8 → emits var() to ALL four sides.
  await chip().click();
  await c.getByRole("button", { name: /space-8/ }).click();
  expect(changes).toContainEqual(["margin", "top:var(--space-8);right:var(--space-8);bottom:var(--space-8);left:var(--space-8)"]);
  // The linked chip now reflects space-8 (32px) immediately, before any readout refresh.
  await expect(margin.getByRole("button", { name: "Variable: space-8" })).toContainText("32");

  // 3) Unlink to edit sides individually (All → H·V → Individual) — the just-picked
  //    space-8 is replicated on every side (four bound chips), surviving the switches.
  await margin.getByRole("button", { name: "Link sides" }).click(); // All → H·V
  await margin.getByRole("button", { name: "Link sides" }).click(); // H·V → Individual
  const chips = margin.getByRole("button", { name: "Variable: space-8" });
  await expect(chips).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toContainText("32");

  // 4) Click ONE side's chip → "Raw value" → it becomes an EDITABLE INPUT (a textbox
  //    appears) and emits the literal; the other three stay bound chips.
  await chip(0).click();
  await c.getByRole("button", { name: /Raw value/ }).click();
  expect(changes.some(([k, v]) => k === "margin" && /^top:32px$/.test(v))).toBe(true);
  await expect(margin.getByRole("textbox")).toHaveCount(1); // exactly the detached side
  await expect(margin.getByRole("button", { name: "Variable: space-8" })).toHaveCount(3);
  // The freshly-editable input is focused so the user can type right away.
  await expect(margin.getByRole("textbox")).toBeFocused();

  await c.screenshot({ path: "test-results/autolayout-tokens.png" });
});

// A fill color whose computed rgb equals a color token → the field should read as the
// token (name + swatch), not the raw rgb, and clicking opens the token list.
const COLOR_SEL: Selection = {
  ...SELECTION,
  sections: [
    {
      id: "fill",
      title: "Fill",
      fields: [{ key: "fill", label: "Fill", kind: "color", value: "rgb(37, 99, 235)", token: null, options: [] }],
    },
  ],
};

test("color fields show the matched token (name + swatch), not the rgb, and open the token list", async ({ mount, page }) => {
  const c = await mount(
    <DesignPanel
      selection={COLOR_SEL}
      tree={null}
      tokens={[]}
      colorTokens={[{ name: "color-primary", value: "#2563eb" }]}
      onSelectNode={() => {}}
      onFieldChange={() => {}}
    />,
  );
  // The field reads as the token name, not the computed rgb.
  await expect(c.getByText("color-primary")).toBeVisible();
  await expect(c.getByText("rgb(37, 99, 235)")).toHaveCount(0);
  // Clicking the color opens the picker with the Libraries token list (portaled to body).
  await c.getByRole("button", { name: /color-primary/ }).click();
  await expect(page.getByPlaceholder("Search styles")).toBeVisible();
  await expect(page.getByText("primary", { exact: true })).toBeVisible(); // the grouped token in the list
  await c.screenshot({ path: "test-results/autolayout-color.png" });
});

// A Gap field bound to space-4 → the LengthTokenField value must sit in the same
// hugging rounded border box as the box sides (the border-box extended to length fields).
const GAP_TOKENED: Selection = {
  ...SELECTION,
  sections: [
    {
      id: "layout",
      title: "Auto layout",
      fields: [{ key: "gap", label: "Gap", kind: "length", value: "16px", token: "space-4", tokenType: "spacing", options: [] }],
    },
  ],
};

test("Auto Layout panel: the border-box extends to length (Gap) fields, hugging the value", async ({ mount }) => {
  const changes: [string, string][] = [];
  const c = await mount(
    <DesignPanel
      selection={GAP_TOKENED}
      tree={null}
      tokens={TOKENS}
      onSelectNode={() => {}}
      onFieldChange={(k, v) => changes.push([k, v])}
    />,
  );
  // Length fields carry the border-box treatment too: bound → the value is a chip
  // BUTTON (not an editable input), with the token name in the left pill.
  await expect(c.getByText("space-4")).toBeVisible(); // left name pill
  const chip = c.getByRole("button", { name: "Variable: space-4", exact: true });
  await expect(chip).toContainText("16px");
  await expect(c.getByRole("textbox")).toHaveCount(0); // bound → not directly editable
  await c.screenshot({ path: "test-results/autolayout-gap.png" });

  // Selecting "Raw value" turns it into an editable, focused input.
  await chip.click();
  await c.getByRole("button", { name: /Raw value/ }).click();
  await expect(c.getByRole("textbox")).toHaveValue("16px");
  await expect(c.getByRole("textbox")).toBeFocused();
  expect(changes).toContainEqual(["gap", "16px"]);
});

test("Auto Layout panel: the token picker on an unlinked side is content-width (name + value visible)", async ({ mount }) => {
  // Padding starts Individual (unlinked) — its side inputs are narrow (2-col grid).
  const c = await mount(
    <DesignPanel selection={SELECTION} tree={null} tokens={TOKENS} onSelectNode={() => {}} onFieldChange={() => {}} />,
  );
  const padding = row(c, "Padding");
  await expect(padding.getByRole("textbox")).toHaveCount(4); // individual mode
  // Open the picker on the first (narrow) side.
  await padding.getByRole("button", { name: /^(Variable:|Bind a variable)/ }).first().click();
  // The picker option must show the full token NAME and its resolved VALUE, not a
  // truncated sliver — same list you'd see from a single wide input. (Scope by the
  // resolved value so it can't collide with a side's dot-pill that also matches space-8.)
  const opt = padding.getByRole("button", { name: /space-8/ }).filter({ hasText: "32px" });
  await expect(opt).toBeVisible();
  await expect(opt).toContainText("space-8");
  await expect(opt).toContainText("32px");
  // The menu is far wider than the narrow input it hangs off.
  const menuBox = (await opt.boundingBox())!;
  const inputBox = (await padding.getByRole("textbox").first().boundingBox())!;
  expect(menuBox.width).toBeGreaterThan(inputBox.width * 1.5);
  await c.screenshot({ path: "test-results/autolayout-picker.png" });
});

test("Auto Layout panel: probe — editing one side never rewrites the others (H·V axis emit)", async ({ mount }) => {
  const changes: [string, string][] = [];
  const c = await mount(
    <DesignPanel
      selection={SELECTION}
      tree={null}
      tokens={TOKENS}
      onSelectNode={() => {}}
      onFieldChange={(k, v) => changes.push([k, v])}
    />,
  );
  const padding = row(c, "Padding");
  // Collapse padding to H·V by cycling from Individual → All → axis (H·V).
  const link = padding.getByRole("button", { name: "Link sides" });
  await link.click(); // individual → all
  await link.click(); // all → axis (H·V) : left/right + top/bottom inputs
  const inputs = padding.getByRole("textbox");
  await expect(inputs).toHaveCount(2);
  // First H·V input is the horizontal (left/right) pair; editing it must emit BOTH left+right.
  await inputs.nth(0).fill("40");
  await inputs.nth(0).blur();
  expect(changes.some(([k, v]) => k === "padding" && v.includes("left:40px") && v.includes("right:40px"))).toBe(true);
});
