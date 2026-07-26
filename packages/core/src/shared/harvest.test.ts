import { describe, expect, it } from "vitest";
import { standInHtml, matchTokenUses, harvestStandIn, mergeHarvestedStandIns, type HarvestNode } from "./harvest";
import { findFrameworkPointers, type StandIn } from "./lite-manifest";

const BUTTON: HarvestNode = {
  tag: "button",
  styles: { "background-color": "#c53434", color: "#ffffff", padding: "0.5rem 1rem", "border-radius": "0.375rem" },
  children: [{ tag: "span", text: "Button", styles: { "font-weight": "600" } }],
};

describe("standInHtml", () => {
  it("renders framework-free, inline-styled HTML from the captured snapshot", () => {
    const html = standInHtml(BUTTON);
    expect(html).toBe(
      `<button style="background-color:#c53434;color:#ffffff;padding:0.5rem 1rem;border-radius:0.375rem"><span style="font-weight:600">Button</span></button>`,
    );
    expect(findFrameworkPointers(html)).toEqual([]);
  });

  it("self-closes void elements and never emits children for them", () => {
    expect(standInHtml({ tag: "img", styles: { width: "40px" } })).toBe(`<img style="width:40px">`);
  });

  it("escapes text and falls back to div for a malformed tag", () => {
    expect(standInHtml({ tag: "b@d", styles: {}, text: "a < b & c" })).toBe(`<div>a &lt; b &amp; c</div>`);
  });
});

describe("matchTokenUses", () => {
  it("records token→property for every styled value that matches a known token value", () => {
    const map = new Map([
      ["#c53434", "color/brand/primary"],
      ["0.375rem", "radius/md"],
    ]);
    const uses = matchTokenUses(BUTTON, map);
    expect(uses).toContainEqual({ token: "color/brand/primary", property: "background-color" });
    expect(uses).toContainEqual({ token: "radius/md", property: "border-radius" });
    // #ffffff / font-weight are not tokens → not recorded
    expect(uses).toHaveLength(2);
  });

  it("dedupes a token+property pair seen on multiple nodes", () => {
    const nested: HarvestNode = { tag: "div", styles: { color: "#c53434" }, children: [{ tag: "span", styles: { color: "#c53434" } }] };
    expect(matchTokenUses(nested, new Map([["#c53434", "color/brand/primary"]]))).toEqual([
      { token: "color/brand/primary", property: "color" },
    ]);
  });
});

describe("harvestStandIn", () => {
  it("freezes a variant to a harvested stand-in with the dual-key tokensUsed", () => {
    const s = harvestStandIn("primary", BUTTON, new Map([["#c53434", "color/brand/primary"]]));
    expect(s.source).toBe("harvested");
    expect(s.variant).toBe("primary");
    expect(s.tokensUsed).toContainEqual({ token: "color/brand/primary", property: "background-color" });
  });

  it("omits tokensUsed when no value map is given", () => {
    expect(harvestStandIn("primary", BUTTON).tokensUsed).toBeUndefined();
  });

  it("throws if a captured render would leak a framework pointer", () => {
    const dirty: HarvestNode = { tag: "div", styles: {}, text: "import Button from '@/components/Button'" };
    expect(() => harvestStandIn("x", dirty)).toThrow(/framework pointer/i);
  });
});

describe("mergeHarvestedStandIns — placeholder → harvested replacement (3.4)", () => {
  const placeholders: StandIn[] = [
    { variant: "primary", html: "<div></div>", source: "placeholder" },
    { variant: "secondary", html: "<div></div>", source: "placeholder" },
  ];

  it("replaces matching-variant placeholders with harvested renders, keeps the rest", () => {
    const harvested: StandIn[] = [{ variant: "primary", html: "<button>P</button>", source: "harvested" }];
    const merged = mergeHarvestedStandIns(placeholders, harvested);
    expect(merged.find((s) => s.variant === "primary")).toMatchObject({ source: "harvested" });
    expect(merged.find((s) => s.variant === "secondary")).toMatchObject({ source: "placeholder" });
  });

  it("appends harvested variants that had no prior placeholder", () => {
    const harvested: StandIn[] = [{ variant: "ghost", html: "<button>G</button>", source: "harvested" }];
    const merged = mergeHarvestedStandIns(placeholders, harvested);
    expect(merged.map((s) => s.variant)).toEqual(["primary", "secondary", "ghost"]);
  });
});
