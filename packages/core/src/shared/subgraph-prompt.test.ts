import { describe, it, expect } from "vitest";
import { renderSubgraphForPrompt, type SubgraphHydration } from "./subgraph-prompt";
import type { SubgraphSlice } from "./draw-graph";

/** A representative create-new slice: references Card+Badge, composes Button, prior ProductCard@2. */
function createNewSlice(overrides?: Partial<SubgraphSlice>): SubgraphSlice {
  return {
    sketch: { id: "sketch:product-card", label: "Product card", note: "reuse Card, add rating" },
    intent: "create-new",
    referenceComponents: [
      { name: "Card", tier: "molecule", role: "reuse" },
      { name: "Badge", tier: "atom", role: "trace" },
    ],
    composedFrom: [{ parent: "Card", children: ["Button"] }],
    priorVersions: [{ component: "ProductCard", version: 2, outputRef: ".vortspec/out/product-card@2.html" }],
    siblings: ["Avatar", "Chip"],
    tokens: [
      { name: "--color-surface", value: "#ffffff" },
      { name: "--space-4", value: "16px" },
    ],
    budgets: { components: 4, tokens: 2, truncated: false },
    ...overrides,
  };
}

/** A customize-existing slice targeting an existing Card. */
function customizeSlice(overrides?: Partial<SubgraphSlice>): SubgraphSlice {
  return {
    sketch: { id: "sketch:card", label: "Card refresh" },
    intent: "customize-existing",
    customizeTarget: { component: "Card", latestVersion: 3, outputRef: ".vortspec/out/card@3.html" },
    referenceComponents: [{ name: "Card", tier: "molecule", role: "reuse" }],
    composedFrom: [],
    priorVersions: [],
    siblings: [],
    tokens: [{ name: "--radius-md", value: "8px" }],
    budgets: { components: 1, tokens: 1, truncated: false },
    ...overrides,
  };
}

describe("renderSubgraphForPrompt", () => {
  it("states the sketch label and note", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).toContain("Product card");
    expect(out).toContain("reuse Card, add rating");
  });

  it("lists reference component names", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).toContain("Card");
    expect(out).toContain("Badge");
  });

  it("lists composedFrom parts", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).toContain("Card → Button");
  });

  it("emits token entries as 'name: value'", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).toContain("--color-surface: #ffffff");
    expect(out).toContain("--space-4: 16px");
  });

  it("forbids raw hex/px", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out.toLowerCase()).toContain("do not introduce a raw hex or px");
  });

  it("notes the sketch image is attached separately", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out.toLowerCase()).toContain("attached");
    expect(out).toMatch(/Read it/i);
  });

  it("gives the customize EDIT instruction when intent is customize-existing", () => {
    const out = renderSubgraphForPrompt(customizeSlice());
    expect(out).toContain("CUSTOMIZE-EXISTING");
    expect(out.toUpperCase()).toContain("EDIT");
    expect(out.toLowerCase()).toContain("do not regenerate");
  });

  it("does NOT give the customize EDIT instruction when intent is create-new", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).toContain("CREATE-NEW");
    expect(out).not.toContain("CUSTOMIZE-EXISTING");
    expect(out.toLowerCase()).not.toContain("do not regenerate");
  });

  it("includes the customize target's current HTML to edit when hydrated", () => {
    const hydrated: SubgraphHydration = { customizeHtml: "<div class='card'>hello customize</div>" };
    const out = renderSubgraphForPrompt(customizeSlice(), hydrated);
    expect(out).toContain("hello customize");
  });

  it("includes reference stand-in HTML when hydrated", () => {
    const hydrated: SubgraphHydration = { referenceStandIns: { Card: "<article class='standin-card'>CARD STANDIN</article>" } };
    const out = renderSubgraphForPrompt(createNewSlice(), hydrated);
    expect(out).toContain("CARD STANDIN");
  });

  it("includes prior-version HTML when hydrated", () => {
    const hydrated: SubgraphHydration = { priorHtml: { ProductCard: "<section>PRIOR PRODUCTCARD OUTPUT</section>" } };
    const out = renderSubgraphForPrompt(createNewSlice(), hydrated);
    expect(out).toContain("PRIOR PRODUCTCARD OUTPUT");
  });

  it("adds the truncation note when budgets.truncated is true", () => {
    const out = renderSubgraphForPrompt(createNewSlice({ budgets: { components: 8, tokens: 40, truncated: true } }));
    expect(out.toUpperCase()).toContain("TRUNCATED");
  });

  it("omits the truncation note when budgets.truncated is false", () => {
    const out = renderSubgraphForPrompt(createNewSlice());
    expect(out).not.toMatch(/this slice was TRUNCATED/);
  });
});
