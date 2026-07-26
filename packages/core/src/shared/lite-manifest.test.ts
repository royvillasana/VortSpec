import { describe, expect, it } from "vitest";
import {
  deriveLiteManifest,
  serializeLiteManifest,
  findFrameworkPointers,
  type DeriveInput,
  type StandIn,
} from "./lite-manifest";

const BASE: DeriveInput = {
  projectName: "Acme",
  tokens: [
    { name: "color/brand/primary", value: "#c53434", group: "colors" },
    { name: "font/size/md", value: "1rem", group: "typography" },
    { name: "spacing/2", value: "0.5rem", group: "spacing" },
    { name: "spacing/4", value: "1rem", group: "spacing" },
    { name: "radius/md", value: "0.375rem", group: "radius" },
  ],
  components: [{ name: "Button", tier: "atom", variants: ["primary", "secondary"], props: [{ name: "variant", type: "string", default: "primary" }] }],
};

const HARVESTED: StandIn = {
  variant: "primary",
  html: `<button style="background:#c53434; padding:0.5rem 1rem; border-radius:0.375rem;">Button</button>`,
  source: "harvested",
  tokensUsed: [
    { token: "color/brand/primary", property: "background-color" },
    { token: "spacing/2", property: "padding-block" },
    { token: "radius/md", property: "border-radius" },
  ],
};

describe("deriveLiteManifest", () => {
  it("dual-keys tokens (name + value) grouped, and drives foundations from the spacing scale", () => {
    const m = deriveLiteManifest(BASE);
    expect(m.tokens.colors).toEqual([{ name: "color/brand/primary", value: "#c53434" }]);
    expect(m.tokens.spacing).toHaveLength(2);
    // spacing scale covers margins AND padding (one scale)
    expect(m.foundations.margins).toEqual(m.tokens.spacing);
    expect(m.foundations.padding).toEqual(m.tokens.spacing);
    // only non-empty groups are listed
    expect(m.foundations.groups).toEqual(["colors", "typography", "spacing", "radius"]);
  });

  it("defaults a component with no stand-ins to placeholders and light-only readiness", () => {
    const m = deriveLiteManifest(BASE);
    const btn = m.components[0];
    expect(btn.readiness).toBe("light-only");
    expect(btn.standIns.map((s) => s.variant)).toEqual(["primary", "secondary"]);
    expect(btn.standIns.every((s) => s.source === "placeholder")).toBe(true);
  });

  it("marks framework-ready ONLY when explicitly ready AND every stand-in is harvested", () => {
    const ready = deriveLiteManifest({
      ...BASE,
      components: [{ ...BASE.components[0], readiness: "framework-ready" }],
      standIns: { Button: [HARVESTED, { ...HARVESTED, variant: "secondary" }] },
    });
    expect(ready.components[0].readiness).toBe("framework-ready");
  });

  it("stays light-only if marked ready but a stand-in is still a placeholder (no false convergence)", () => {
    const mixed = deriveLiteManifest({
      ...BASE,
      components: [{ ...BASE.components[0], readiness: "framework-ready" }],
      standIns: { Button: [HARVESTED, { variant: "secondary", html: "<button></button>", source: "placeholder" }] },
    });
    expect(mixed.components[0].readiness).toBe("light-only");
  });
});

describe("serializeLiteManifest", () => {
  it("emits YAML frontmatter with dual-keyed tokens and a stand-in section per variant", () => {
    const m = deriveLiteManifest({ ...BASE, standIns: { Button: [HARVESTED, { ...HARVESTED, variant: "secondary" }] } });
    const text = serializeLiteManifest(m);
    expect(text).toContain('name: "Acme Lite Design System"');
    expect(text).toContain("derivedFrom: DESIGN.md");
    expect(text).toContain('- { name: "color/brand/primary", value: "#c53434" }');
    expect(text).toContain("## Button");
    expect(text).toContain("<!-- stand-in: primary (harvested) -->");
    expect(text).toContain("tokens-used: color/brand/primary→background-color");
  });

  it("produces a manifest with ZERO framework pointers", () => {
    const m = deriveLiteManifest({ ...BASE, standIns: { Button: [HARVESTED] } });
    expect(findFrameworkPointers(serializeLiteManifest(m))).toEqual([]);
  });

  it("throws if a harvested stand-in would leak a framework pointer (e.g. a real import)", () => {
    const dirty: StandIn = { variant: "primary", source: "harvested", html: `<div>import { Button } from '@/components/Button'</div>` };
    const m = deriveLiteManifest({ ...BASE, standIns: { Button: [dirty] } });
    expect(() => serializeLiteManifest(m)).toThrow(/framework pointer/i);
  });
});

describe("findFrameworkPointers — the verify gate", () => {
  it("flags imports, variants files, @/ aliases, storybook urls, framework files, and cva/cn", () => {
    expect(findFrameworkPointers("import x from 'y'")).toContain("import statement");
    expect(findFrameworkPointers("./Button.variants.ts")).toContain("variants file");
    expect(findFrameworkPointers("from '@/components/Button'")).toContain("module alias @/");
    expect(findFrameworkPointers("http://localhost:6006/?path=/docs")).toContain("storybook url");
    expect(findFrameworkPointers("Button.tsx")).toContain("framework source file");
    expect(findFrameworkPointers("cva('base', {})")).toContain("cva()/cn() call");
  });

  it("passes clean light HTML with resolved values", () => {
    expect(findFrameworkPointers(`<button style="background:#c53434; padding:0.5rem 1rem;">Go</button>`)).toEqual([]);
  });
});
