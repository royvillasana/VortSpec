import { describe, expect, it } from "vitest";
import {
  deriveLiteManifest,
  serializeLiteManifest,
  findFrameworkPointers,
  type DeriveInput,
  type StandIn,
  type LiteHints,
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

describe("component hints in designer.md (task 3.4)", () => {
  const withHints = (hints: LiteHints | undefined) =>
    deriveLiteManifest({
      projectName: "Acme",
      tokens: [{ name: "color-primary", value: "#1d4ed8", group: "colors" }],
      components: [{ name: "Button", tier: "atom", variants: ["primary", "ghost"], hints }],
    });

  it("serializes selection criteria, variant purpose and what to avoid", () => {
    const text = serializeLiteManifest(
      withHints({
        selectionCriteria: ["the main action a user should take on a section"],
        variantPurpose: [{ variant: "ghost", purpose: "tertiary actions with minimal weight" }],
        avoid: [{ scenario: "using it to navigate", instead: "use the link stand-in" }],
      }),
    );
    expect(text).toContain("hints:");
    expect(text).toContain("the main action a user should take on a section");
    expect(text).toContain("tertiary actions with minimal weight");
    expect(text).toContain("use the link stand-in");
  });

  it("stays framework-free with hints present", () => {
    const text = serializeLiteManifest(
      withHints({ selectionCriteria: ["primary call to action"], avoid: [{ scenario: "x", instead: "y" }] }),
    );
    expect(findFrameworkPointers(text)).toEqual([]);
  });

  it("THROWS rather than emitting a hint that carries framework code", () => {
    // This is the reason `commonPatterns[].code` and `importPath` are not part of `LiteHints`: a
    // record's most useful-looking field is real JSX, and one of those in designer.md is the exact
    // coupling the light manifest exists to prevent. The guard must catch it if it ever leaks in.
    expect(() =>
      serializeLiteManifest(
        withHints({ avoid: [{ scenario: "raw markup", instead: 'import { Button } from "@/components/Button"' }] }),
      ),
    ).toThrow(/framework pointers/);
  });

  it("omits the block entirely when a component has no metadata record", () => {
    // Task 3.6: an empty `hints: {}` reads as "no constraints" rather than "nothing recorded".
    expect(serializeLiteManifest(withHints(undefined))).not.toContain("hints:");
  });

  it("omits the block when every hint is blank", () => {
    const text = serializeLiteManifest(
      withHints({ selectionCriteria: ["  "], variantPurpose: [{ variant: "", purpose: "" }], avoid: [] }),
    );
    expect(text).not.toContain("hints:");
  });

  it("still lists the component itself when it has no hints", () => {
    const text = serializeLiteManifest(withHints(undefined));
    expect(text).toContain('name: "Button"');
    expect(text).toContain("## Button");
  });
});

describe("every permitted component's reasoning is reachable (tasks 3.5, 3.6)", () => {
  /**
   * `designer.md` IS the light-page prompt's component context — the prompt names it as the library
   * and the selection method points at its `hints`. So the coverage assertion belongs here, on the
   * artifact, rather than on the prompt string: duplicating every component's criteria into the
   * prompt as well would pay for the same text twice and let the two disagree.
   */
  const manifest = (components: DeriveInput["components"]) =>
    serializeLiteManifest(
      deriveLiteManifest({
        projectName: "Acme",
        tokens: [{ name: "color-primary", value: "#1d4ed8", group: "colors" }],
        components,
      }),
    );

  it("carries criteria for every data-component name the page may place", () => {
    const text = manifest([
      {
        name: "Button",
        tier: "atom",
        variants: ["primary"],
        hints: { selectionCriteria: ["the main action in a section"] },
      },
      {
        name: "Card",
        tier: "molecule",
        variants: [],
        hints: { selectionCriteria: ["grouping related content with its own surface"] },
      },
    ]);
    // The names the prompt permits are exactly the frontmatter component names.
    for (const [name, criterion] of [
      ["Button", "the main action in a section"],
      ["Card", "grouping related content with its own surface"],
    ]) {
      expect(text).toContain(`name: "${name}"`);
      expect(text).toContain(criterion);
    }
  });

  it("still permits a component whose metadata was never written (task 3.6)", () => {
    // The soft gate: a missing record must not remove a component from the light library. It composes
    // on its stand-in and its description, and the selection method says to declare that it did.
    const text = manifest([
      { name: "Button", tier: "atom", variants: ["primary"], hints: { selectionCriteria: ["main action"] } },
      { name: "Badge", tier: "atom", variants: [] },
    ]);
    expect(text).toContain('name: "Badge"');
    expect(text).toContain("## Badge");
    expect(findFrameworkPointers(text)).toEqual([]);
    // And it is visibly the one without reasoning, rather than silently equal to the documented one.
    const badgeBlock = text.slice(text.indexOf('name: "Badge"'), text.indexOf("---", text.indexOf('name: "Badge"')));
    expect(badgeBlock).not.toContain("hints:");
  });
});
