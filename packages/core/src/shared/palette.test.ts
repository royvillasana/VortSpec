import { describe, expect, it } from "vitest";
import { buildPalette, renderPaletteHtml, paletteSelfContainmentIssues } from "./palette";
import { deriveLiteManifest, findFrameworkPointers, type DeriveInput, type StandIn } from "./lite-manifest";

const INPUT: DeriveInput = {
  projectName: "Acme",
  tokens: [
    { name: "color/brand/primary", value: "#c53434", group: "colors" },
    { name: "font/size/md", value: "1rem", group: "typography" },
    { name: "spacing/2", value: "0.5rem", group: "spacing" },
    { name: "spacing/4", value: "1rem", group: "spacing" },
    { name: "shadow/md", value: "0 1px 3px rgba(0,0,0,.2)", group: "shadows" },
    { name: "radius/md", value: "0.375rem", group: "radius" },
  ],
  components: [
    { name: "Button", tier: "atom", variants: ["primary", "secondary"] },
    { name: "Card", tier: "molecule", variants: ["default"] },
  ],
};
const HARVESTED: StandIn = {
  variant: "primary",
  html: `<button style="background:#c53434;padding:0.5rem 1rem;border-radius:0.375rem">Button</button>`,
  source: "harvested",
};

function paletteOf(extra?: Partial<DeriveInput>) {
  return buildPalette(deriveLiteManifest({ ...INPUT, ...extra }));
}

describe("buildPalette", () => {
  it("lists only non-empty token groups plus the spacing-derived margin/padding scales", () => {
    const p = paletteOf();
    expect(p.foundations.tokens.map((t) => t.group)).toEqual(["colors", "typography", "spacing", "shadows", "radius"]);
    expect(p.foundations.margins).toEqual(p.foundations.padding); // one scale drives both
  });

  it("carries every contract component with readiness + placeholder flags", () => {
    const p = paletteOf();
    expect(p.components.map((c) => c.name)).toEqual(["Button", "Card"]);
    expect(p.components.every((c) => c.readiness === "light-only")).toBe(true);
    expect(p.components.every((c) => c.isPlaceholder)).toBe(true); // no stand-ins provided → placeholders
  });

  it("flips a component to non-placeholder once its stand-ins are harvested", () => {
    const p = paletteOf({ standIns: { Button: [HARVESTED, { ...HARVESTED, variant: "secondary" }] } });
    expect(p.components.find((c) => c.name === "Button")!.isPlaceholder).toBe(false);
    expect(p.components.find((c) => c.name === "Card")!.isPlaceholder).toBe(true);
  });
});

describe("renderPaletteHtml", () => {
  it("renders every component before any framework component exists (placeholders included)", () => {
    const html = renderPaletteHtml(paletteOf());
    expect(html).toContain('data-component="Button"');
    expect(html).toContain('data-component="Card"');
    expect(html).toContain('class="lp-bento"'); // one merged bento wall
  });

  it("embeds resolved token values in the foundations swatches", () => {
    const html = renderPaletteHtml(paletteOf());
    expect(html).toContain("background:#c53434"); // color chip
    expect(html).toContain("box-shadow:0 1px 3px rgba(0,0,0,.2)"); // shadow card
  });

  it("is self-contained (no <script>, no external assets) and free of framework pointers", () => {
    const html = renderPaletteHtml(paletteOf({ standIns: { Button: [HARVESTED] } }));
    expect(paletteSelfContainmentIssues(html)).toEqual([]);
    expect(findFrameworkPointers(html)).toEqual([]);
  });

  it("throws if a stand-in would leak a framework pointer into the shelf", () => {
    const dirty: StandIn = { variant: "primary", source: "harvested", html: `<div>@/components/Button</div>` };
    expect(() => renderPaletteHtml(paletteOf({ standIns: { Button: [dirty] } }))).toThrow(/framework pointer/i);
  });
});

describe("paletteSelfContainmentIssues", () => {
  it("flags an EXTERNAL script and an external asset, but allows the inline masonry script", () => {
    expect(paletteSelfContainmentIssues(`<script src="x.js"></script>`).some((i) => i.includes("external script"))).toBe(true);
    expect(paletteSelfContainmentIssues(`<img src="https://x/y.png">`).some((i) => i.includes("external"))).toBe(true);
    expect(paletteSelfContainmentIssues(`<script>layout()</script>`)).toEqual([]); // inline is fine
  });
  it("allows data: URIs and in-page anchors", () => {
    expect(paletteSelfContainmentIssues(`<img src="data:image/png;base64,AAA"><a href="#top">t</a>`)).toEqual([]);
  });
});
