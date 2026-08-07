import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapTokenGroup, mapTier, buildDeriveInput, liteGenerationStatus, markPageGenerated } from "./lite-source";
import { deriveLiteManifest } from "../../shared/lite-manifest";

describe("mapTokenGroup", () => {
  it("maps inspector token types (singular) to manifest groups (plural)", () => {
    expect(mapTokenGroup("color")).toBe("colors");
    expect(mapTokenGroup("shadow")).toBe("shadows");
    expect(mapTokenGroup("spacing")).toBe("spacing");
    expect(mapTokenGroup("typography")).toBe("typography");
    expect(mapTokenGroup("radius")).toBe("radius");
  });
  it("files an unclassifiable type under `other` rather than dropping it (task 7.11)", () => {
    // It used to return null and the token vanished from designer.md entirely. "I could not
    // classify this" is not a reason to make a token the design system defines unreferenceable.
    expect(mapTokenGroup("other")).toBe("other");
  });
});

describe("mapTier", () => {
  it("normalizes level to a tier, defaulting unknown to atom", () => {
    expect(mapTier("molecule")).toBe("molecule");
    expect(mapTier("organism")).toBe("organism");
    expect(mapTier("template")).toBe("template");
    expect(mapTier(undefined)).toBe("atom");
    expect(mapTier("weird")).toBe("atom");
  });
});

describe("buildDeriveInput — inspector shapes → derive input", () => {
  const tokens = [
    { name: "color-primary", type: "color", resolvedValue: "#c53434" },
    { name: "space-2", type: "spacing", resolvedValue: "0.5rem" },
    { name: "misc-thing", type: "other", resolvedValue: "whatever" }, // kept, under `other`
    { name: "empty", type: "color", resolvedValue: "" }, // dropped (no value to render)
  ];
  const components = [
    {
      name: "Button",
      level: "atom",
      props: [
        { key: "variant", kind: "enum" as const, options: ["primary", "secondary"], defaultValue: "primary" },
        { key: "disabled", kind: "boolean" as const, options: [] },
      ],
    },
    { name: "Header", level: "organism", props: [] },
  ];

  it("keeps every token with a value, dual-keyed by name + resolved value", () => {
    const input = buildDeriveInput("Acme", tokens, components);
    expect(input.tokens).toEqual([
      { name: "color-primary", value: "#c53434", group: "colors" },
      { name: "space-2", value: "0.5rem", group: "spacing" },
      // Listed, not dropped — a light page can reference it even with no swatch to draw.
      { name: "misc-thing", value: "whatever", group: "other" },
    ]);
  });

  it("maps components with tier, variants (from the `variant` enum prop), and props", () => {
    const input = buildDeriveInput("Acme", tokens, components);
    expect(input.components[0]).toMatchObject({ name: "Button", tier: "atom", variants: ["primary", "secondary"] });
    expect(input.components[0].props).toEqual([
      { name: "variant", type: "enum", default: "primary" },
      { name: "disabled", type: "boolean", default: undefined },
    ]);
    expect(input.components[1]).toMatchObject({ name: "Header", tier: "organism", variants: [] });
  });

  it("carries the project name through", () => {
    expect(buildDeriveInput("Acme", [], []).projectName).toBe("Acme");
  });

  it("passes each component's readiness through (so the palette badge can be meaningful, not always light-only)", () => {
    const input = buildDeriveInput("Acme", [], [
      { name: "Button", level: "atom", props: [], readiness: "framework-ready" },
      { name: "Hero", level: "organism", props: [], readiness: "light-only" },
    ]);
    expect(input.components.map((c) => [c.name, c.readiness])).toEqual([
      ["Button", "framework-ready"],
      ["Hero", "light-only"],
    ]);
  });

  it("end-to-end: a coded (framework-ready) component with HARVESTED stand-ins surfaces framework-ready in the manifest", () => {
    const input = buildDeriveInput("Acme", [], [{ name: "Button", level: "atom", props: [], readiness: "framework-ready" }]);
    input.standIns = { Button: [{ variant: "default", html: "<button>Go</button>", source: "harvested" }] };
    expect(deriveLiteManifest(input).components[0].readiness).toBe("framework-ready");
  });

  it("end-to-end: a coded component with only a PLACEHOLDER preview stays light-only (no false convergence)", () => {
    const input = buildDeriveInput("Acme", [], [{ name: "Button", level: "atom", props: [], readiness: "framework-ready" }]);
    // no stand-ins provided → deriveLiteManifest fills placeholders → not harvested → light-only
    expect(deriveLiteManifest(input).components[0].readiness).toBe("light-only");
  });
});

describe("per-page framework-generation status", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });
  async function project(pages: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "vs-genstatus-"));
    dirs.push(root);
    const pagesDir = join(root, ".vortspec", "light-pages");
    await mkdir(pagesDir, { recursive: true });
    for (const [name, html] of Object.entries(pages)) await writeFile(join(pagesDir, `${name}.html`), html, "utf8");
    return root;
  }

  it("an unconverted page is neither generated nor stale", async () => {
    const root = await project({ Home: "<h1>Home</h1>" });
    expect(await liteGenerationStatus(root)).toEqual([{ name: "Home", generated: false, stale: false }]);
  });

  it("after markPageGenerated it's generated + up to date; editing the page makes it stale", async () => {
    const root = await project({ Home: "<h1>Home</h1>" });
    expect(await markPageGenerated(root, "Home")).toBe(true);
    expect(await liteGenerationStatus(root)).toEqual([{ name: "Home", generated: true, stale: false }]);

    // Edit the light page → its hash changes → status reads stale (needs re-generation).
    await writeFile(join(root, ".vortspec", "light-pages", "Home.html"), "<h1>Home v2</h1>", "utf8");
    expect(await liteGenerationStatus(root)).toEqual([{ name: "Home", generated: true, stale: true }]);

    // Re-generating (mark again) records the new hash → back to up to date.
    await markPageGenerated(root, "Home");
    expect(await liteGenerationStatus(root)).toEqual([{ name: "Home", generated: true, stale: false }]);
  });

  it("tracks pages independently and marking a missing page is a no-op", async () => {
    const root = await project({ Home: "<h1>Home</h1>", About: "<h1>About</h1>" });
    await markPageGenerated(root, "Home");
    expect(await markPageGenerated(root, "Ghost")).toBe(false);
    expect(await liteGenerationStatus(root)).toEqual([
      { name: "About", generated: false, stale: false },
      { name: "Home", generated: true, stale: false },
    ]);
  });
});
