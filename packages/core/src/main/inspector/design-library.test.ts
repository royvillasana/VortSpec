import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildLibrarySections, previewWithDrafts, resolvePreview, STYLE_SECTIONS } from "@vortspec/core/design-library";
import type { InspectorToken } from "@vortspec/core/inspector";
import { getDesignSystemLibrary, getScreenTokenDrift } from "./design-library";
import { setThemeTokenOverride } from "./theme-override-store";

/**
 * The design system grouped by style property (change: design-system-style-panel, Phase 2).
 *
 * The point of these tests is the thing the lever model got wrong: a token must be reachable because the
 * PROJECT has it, not because VortSpec has a name for it. The Astryx radius scale — `container`, `card`,
 * `pill`, `element` — is the exact case where the old model moved five elements and none of the cards.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function w(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content, "utf8");
}

const tok = (name: string, type: InspectorToken["type"], resolvedValue: string, uses = 0): InspectorToken =>
  ({ name, type, rawValue: resolvedValue, resolvedValue, source: "generated-code", uses }) as InspectorToken;

describe("buildLibrarySections", () => {
  it("returns the five sections in order, always — even when empty", () => {
    const sections = buildLibrarySections([]);
    expect(sections.map((s) => s.section)).toEqual(["color", "typography", "spacing", "radius", "shadow"]);
    // An empty section is PRESENT and empty, so the panel can say so plainly rather than hiding it.
    expect(sections.every((s) => s.rows.length === 0)).toBe(true);
    expect(STYLE_SECTIONS).toHaveLength(5);
  });

  it("puts every one of a project's radius tokens in the borders section", () => {
    const sections = buildLibrarySections([
      tok("radius-element", "radius", "10px"),
      tok("radius-container", "radius", "12px"),
      tok("radius-card", "radius", "20px"),
      tok("radius-pill", "radius", "999px"),
    ]);
    const radius = sections.find((s) => s.section === "radius")!;
    // All four — this is precisely what the lever model could not do.
    expect(radius.rows.map((r) => r.token)).toEqual([
      "radius-element",
      "radius-container",
      "radius-card",
      "radius-pill",
    ]);
    expect(radius.rows.every((r) => r.control === "length")).toBe(true);
  });

  it("keeps the token file's own order, so a scale still reads as a scale", () => {
    const sections = buildLibrarySections([
      tok("space-xs", "spacing", "4px"),
      tok("space-sm", "spacing", "8px"),
      tok("space-md", "spacing", "16px"),
    ]);
    expect(sections.find((s) => s.section === "spacing")!.rows.map((r) => r.token)).toEqual([
      "space-xs",
      "space-sm",
      "space-md",
    ]);
  });

  it("takes the control from the LIVE value, not the section", () => {
    const sections = buildLibrarySections([
      // A border COLOR lives in the borders section but must not get a px stepper.
      tok("color-border", "color", "light-dark(#00000014, #FFFFFF1A)"),
      tok("radius-card", "radius", "20px"),
      tok("shadow-med", "shadow", "0 2px 4px rgba(0,0,0,.1)"),
    ]);
    const byToken = Object.fromEntries(sections.flatMap((s) => s.rows).map((r) => [r.token, r.control]));
    expect(byToken["color-border"]).toBe("color");
    expect(byToken["radius-card"]).toBe("length");
    expect(byToken["shadow-med"]).toBe("text");
  });

  it("leaves `other`-typed tokens out — they belong to the raw Tokens tab", () => {
    const sections = buildLibrarySections([tok("z-index-modal", "other", "1000"), tok("primary", "color", "#5433eb")]);
    expect(sections.flatMap((s) => s.rows).map((r) => r.token)).toEqual(["primary"]);
  });
});

/** The real consumed-library shape: the token file only `@import`s the vendor theme. */
async function astryxProject(): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "vs-library-"));
    await w(
      ".sdd-de/project.yaml",
      ["design_source: library", "component_library: astryx", "token_file: src/styles/tokens.css", "theme_apply: css-vars"].join("\n"),
    );
    await w(
      "node_modules/@astryxdesign/theme-neutral/package.json",
      JSON.stringify({ name: "@astryxdesign/theme-neutral", exports: { "./theme.css": "./dist/theme.css" } }),
    );
    await w(
      "node_modules/@astryxdesign/theme-neutral/dist/theme.css",
      [
        ":root {",
        "  --color-accent: light-dark(#262626, #ebebeb);",
        "  --radius-container: 0.75rem;",
        "  --radius-element: 10px;",
        "  --font-size-md: 16px;",
        "  --shadow-med: 0 2px 4px oklch(0 0 0 / 5%);",
        "}",
        "",
      ].join("\n"),
    );
    await w("src/styles/tokens.css", "@import '@astryxdesign/theme-neutral/theme.css';\n");
    return dir;
}

describe("getDesignSystemLibrary", () => {
  it("reads the vendor's real tokens through the @import chain and groups them", async () => {
    const p = await astryxProject();
    const lib = await getDesignSystemLibrary(p);

    expect(lib.componentLibrary).toBe("astryx");
    expect(lib.needsThemeAgent).toBe(false);

    const at = (s: string) => lib.sections.find((x) => x.section === s)!.rows.map((r) => r.token);
    expect(at("color")).toContain("color-accent");
    expect(at("radius")).toEqual(expect.arrayContaining(["radius-container", "radius-element"]));
    expect(at("typography")).toContain("font-size-md");
    expect(at("shadow")).toContain("shadow-med");

    // Values are the vendor's real ones, and each is attributed to the file that declares it.
    const accent = lib.sections.flatMap((s) => s.rows).find((r) => r.token === "color-accent")!;
    expect(accent.value).toBe("light-dark(#262626, #ebebeb)");
    expect(accent.fromImport).toContain("node_modules");
  });

  it("reports the LIVE value after an edit, and never writes the vendor's files", async () => {
    const p = await astryxProject();
    const vendor = "node_modules/@astryxdesign/theme-neutral/dist/theme.css";
    const before = await readFile(join(p, vendor), "utf8");

    await setThemeTokenOverride(p, "radius-container", "28px");

    const lib = await getDesignSystemLibrary(p);
    const row = lib.sections.flatMap((s) => s.rows).find((r) => r.token === "radius-container")!;
    expect(row.value).toBe("28px");
    expect(await readFile(join(p, vendor), "utf8")).toBe(before);
  });

  it("returns five empty sections for a project with no token file rather than failing", async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-library-"));
    await w(".sdd-de/project.yaml", "design_source: figma\n");
    const lib = await getDesignSystemLibrary(dir);
    expect(lib.sections).toHaveLength(5);
    expect(lib.sections.every((s) => s.rows.length === 0)).toBe(true);
  });
});

describe("getScreenTokenDrift", () => {
  it("offers the screens' value per token, and never for one the user has already decided", async () => {
    const p = await astryxProject();
    await w(
      ".vortspec/light-pages/shopdev.html",
      "<html><head><style>\n:root {\n  --color-accent: #5433eb;\n  --radius-element: 10px;\n  --radius-pill: 999px;\n}\n</style></head><body></body></html>",
    );

    const before = await getScreenTokenDrift(p);
    expect(before.screens).toEqual(["shopdev"]);
    // `radius-element` already matches (10px both sides) and `radius-pill` is the page's own vocabulary,
    // which the design system has no token for — neither is a difference worth raising.
    expect(before.drifts.map((d) => d.token)).toEqual(["color-accent"]);
    expect(before.drifts[0]).toMatchObject({
      designValue: "light-dark(#262626, #ebebeb)",
      screenValue: "#5433eb",
      // Adopting a light page's value keeps the library's dark half.
      adoptValue: "light-dark(#5433eb, #ebebeb)",
    });

    // Once the user sets it themselves, the design system drives the screens — re-proposing the screens'
    // value would pressure them to undo the edit they just made.
    await setThemeTokenOverride(p, "color-accent", "light-dark(#0074e2, #ebebeb)");
    expect((await getScreenTokenDrift(p)).drifts).toEqual([]);
  });

  it("is empty when there are no screens", async () => {
    const p = await astryxProject();
    expect((await getScreenTokenDrift(p)).drifts).toEqual([]);
  });
});

describe("resolvePreview", () => {
  it("binds each role to a token of the RIGHT TYPE, not merely the right-sounding name", () => {
    // `--border-width` is a LENGTH whose name contains "border". Before the type check it stood in for the
    // border COLOUR — and, being first in the colour section, became the preview's accent. The preview
    // then drew with a `1px` "colour" and could never look like the design system.
    const preview = resolvePreview([
      tok("border-width", "spacing", "1px"),
      tok("color-border", "color", "#E4E7EC"),
      tok("color-accent", "color", "#5433eb"),
      tok("radius-none", "radius", "0"),
      tok("radius-container", "radius", "12px"),
      tok("color-shadow", "color", "#000000"),
      tok("shadow-med", "shadow", "0 2px 4px rgba(0,0,0,.1)"),
      tok("font-family-body", "typography", "Figtree, sans-serif"),
    ]);

    expect(preview.border).toBe("#E4E7EC");
    expect(preview.primary).toBe("#5433eb");
    // `--radius-none: 0` is first in the section but is not the base radius.
    expect(preview.radius).toBe("12px");
    // `--color-shadow` is a colour, not a shadow.
    expect(preview.shadow).toBe("0 2px 4px rgba(0,0,0,.1)");
    expect(preview.fontFamily).toBe("Figtree, sans-serif");
  });

  it("draws with the same roles a preset writes, so applying one always moves the preview", () => {
    const preview = resolvePreview([
      tok("color-accent", "color", "#5433eb"),
      tok("color-background-body", "color", "#f1f1f1"),
      tok("color-background-surface", "color", "#ffffff"),
      tok("radius-container", "radius", "12px"),
      tok("shadow-med", "shadow", "0 2px 4px #0001"),
      tok("font-family-body", "typography", "Figtree, sans-serif"),
    ]);
    // Every one of these is a token the built-in presets resolve to and write.
    expect(Object.values(preview.tokens)).toEqual(
      expect.arrayContaining([
        "color-accent",
        "color-background-body",
        "color-background-surface",
        "radius-container",
        "shadow-med",
        "font-family-body",
      ]),
    );
  });

  it("reports what it could not resolve rather than substituting something wrong", () => {
    const preview = resolvePreview([tok("mystery", "other", "42")]);
    expect(preview.tokens).toEqual({});
    expect(preview.primary).toBeUndefined();
  });
});

describe("previewWithDrafts", () => {
  it("lets an in-progress edit move the preview before it is written", () => {
    const preview = resolvePreview([
      tok("color-accent", "color", "#5433eb"),
      tok("radius-container", "radius", "12px"),
    ]);
    expect(preview.primary).toBe("#5433eb");

    // What the user is typing, not what is on disk.
    const live = previewWithDrafts(preview, { "color-accent": "#00AA55" });
    expect(live.primary).toBe("#00AA55");
    // Everything they are NOT editing is untouched.
    expect(live.radius).toBe("12px");
  });

  it("ignores a draft for a token the preview does not draw with, and an empty one", () => {
    const preview = resolvePreview([tok("color-accent", "color", "#5433eb")]);
    expect(previewWithDrafts(preview, { "some-other-token": "#fff" })).toEqual(preview);
    // A cleared field means "remove the override", not "render nothing".
    expect(previewWithDrafts(preview, { "color-accent": "  " }).primary).toBe("#5433eb");
  });
});

describe("a colour-sounding name with a length value", () => {
  it("lands in Borders, not the palette", async () => {
    // `--border-width: 1px` was typed `color` by name and rendered as an empty swatch in the colour grid,
    // because `1px` is not a colour. The value settles it.
    dir = await mkdtemp(join(tmpdir(), "vs-library-"));
    await w(".sdd-de/project.yaml", ["design_source: figma", "token_file: src/tokens.css"].join("\n"));
    await w("src/tokens.css", ":root {\n  --border-width: 1px;\n  --color-border: #E4E7EC;\n}\n");

    const lib = await getDesignSystemLibrary(dir);
    const at = (s: string) => lib.sections.find((x) => x.section === s)!.rows.map((r) => r.token);
    expect(at("radius")).toContain("border-width");
    expect(at("color")).toContain("color-border");
    expect(at("color")).not.toContain("border-width");
  });

  it("puts a shadow-named COLOUR in the palette, not among the box-shadows", async () => {
    // `--color-shadow` is the colour a shadow is drawn in. It was filed under Shadows, where it rendered
    // a colour swatch in a list of `0 2px 4px …` values.
    dir = await mkdtemp(join(tmpdir(), "vs-library-"));
    await w(".sdd-de/project.yaml", ["design_source: figma", "token_file: src/tokens.css"].join("\n"));
    await w(
      "src/tokens.css",
      ":root {\n  --color-shadow: light-dark(#0000001A, #0000004D);\n  --shadow-med: 0 2px 4px #0001;\n}\n",
    );

    const lib = await getDesignSystemLibrary(dir);
    const at = (s: string) => lib.sections.find((x) => x.section === s)!.rows.map((r) => r.token);
    expect(at("color")).toContain("color-shadow");
    expect(at("shadow")).toEqual(["shadow-med"]);
  });
});
