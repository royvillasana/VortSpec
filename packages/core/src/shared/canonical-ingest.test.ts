import { describe, expect, it } from "vitest";
import {
  canonicalFromCssCustomProperties,
  canonicalFromScssVariables,
  canonicalFromThemeObject,
  dtcgTypeForCodeToken,
  modeNameForContext,
} from "./canonical-ingest";
import { projectCanonicalToVariables, validateCanonicalTokens } from "./canonical-tokens";
import { emitTokens, flattenCanonicalTokens } from "./token-emitters";
import { readDocumentExtension, readTokenExtension, type DesignTokenLeaf } from "./design-tokens";

/** Reach a token by its dot path — the artifact is a tree, and the tests assert on the tree. */
function leafAt(doc: unknown, path: string): DesignTokenLeaf | undefined {
  let node: unknown = doc;
  for (const segment of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node as DesignTokenLeaf | undefined;
}

describe("dtcgTypeForCodeToken", () => {
  it("reads the type off the value wherever the value is unambiguous", () => {
    expect(dtcgTypeForCodeToken("color-primary", "#1d4ed8")).toBe("color");
    expect(dtcgTypeForCodeToken("brand", "oklch(0.6 0.2 250)")).toBe("color");
    expect(dtcgTypeForCodeToken("spacing-4", "1rem")).toBe("dimension");
    expect(dtcgTypeForCodeToken("motion-fast", "150ms")).toBe("duration");
    expect(dtcgTypeForCodeToken("ease-out", "cubic-bezier(0, 0, 0.2, 1)")).toBe("cubicBezier");
  });

  it("falls back to the name only for a bare number, which the value cannot type", () => {
    // Both are `700`/`1.5`; only the name says which is a weight and which is a ratio.
    expect(dtcgTypeForCodeToken("font-weight-bold", "700")).toBe("fontWeight");
    expect(dtcgTypeForCodeToken("leading-normal", "1.5")).toBe("number");
  });

  it("leaves the type undefined rather than guessing", () => {
    // An emitter passes an untyped literal through untouched, which is right for `1px solid …`.
    expect(dtcgTypeForCodeToken("border-default", "1px solid #e5e7eb")).toBeUndefined();
  });
});

describe("modeNameForContext", () => {
  it("names the default context for a person, not for a selector", () => {
    expect(modeNameForContext(":root")).toBe("Default");
  });
  it("recognises the dark conventions that actually occur", () => {
    expect(modeNameForContext("@media (prefers-color-scheme: dark)")).toBe("Dark");
    expect(modeNameForContext(".dark")).toBe("Dark");
    expect(modeNameForContext('[data-theme="dark"]')).toBe("Dark");
  });
  it("keeps an unrecognised selector rather than inventing a friendly name", () => {
    expect(modeNameForContext('[data-brand="acme"]')).toBe("data-brand-acme");
  });
});

describe("CSS custom properties → the canonical artifact (task 7.10)", () => {
  const CSS = `
    :root {
      --color-blue-500: #1d4ed8;
      --color-primary: var(--color-blue-500);
      --color-primary-hover: #1e40af;
      --spacing-4: 1rem;
      --motion-fast: 150ms;
    }
    .dark {
      --color-blue-500: #60a5fa;
      --color-primary: var(--color-blue-500);
    }
  `;

  it("produces a document that validates as DTCG, like every other source", () => {
    const { document } = canonicalFromCssCustomProperties(CSS, { source: "css" });
    const validation = validateCanonicalTokens(document);
    expect(validation.violations).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("stamps the same provenance block a design-tool read stamps", () => {
    const { document } = canonicalFromCssCustomProperties(CSS, {
      source: "css",
      generatedAt: "2026-08-07T10:00:00.000Z",
    });
    const ext = readDocumentExtension(document);
    expect(ext?.source).toBe("css");
    expect(ext?.generatedAt).toBe("2026-08-07T10:00:00.000Z");
  });

  it("keeps a property name whole instead of splitting it into a group tree", () => {
    // The point of the flat decision: under a hyphen split, `color-primary-hover` would be a child
    // of the token `color-primary`, which DTCG forbids — so it would be dropped entirely.
    const { document, dropped } = canonicalFromCssCustomProperties(CSS);
    expect(dropped).toEqual([]);
    expect(leafAt(document, "color-primary")).toBeDefined();
    expect(leafAt(document, "color-primary-hover")).toBeDefined();
    expect(leafAt(document, "color-primary-hover")?.$value).toBe("#1e40af");
  });

  it("reads selector scopes as modes, with the values each scope declares", () => {
    const { document } = canonicalFromCssCustomProperties(CSS);
    const ext = readTokenExtension(leafAt(document, "color-blue-500"));
    expect(ext?.defaultMode).toBe("Default");
    expect(ext?.modes?.Default?.value).toBe("#1d4ed8");
    expect(ext?.modes?.Dark?.value).toBe("#60a5fa");

    const collections = readDocumentExtension(document)?.collections;
    expect(collections?.[0]?.modes).toEqual(["Default", "Dark"]);
    expect(collections?.[0]?.defaultMode).toBe("Default");
  });

  it("turns a var() reference into a DTCG alias, in every mode", () => {
    const { document } = canonicalFromCssCustomProperties(CSS);
    const leaf = leafAt(document, "color-primary");
    expect(leaf?.$value).toBe("{color-blue-500}");
    const ext = readTokenExtension(leaf);
    expect(ext?.modes?.Default?.alias).toBe("{color-blue-500}");
    expect(ext?.modes?.Dark?.alias).toBe("{color-blue-500}");
  });

  it("leaves a reference to an undeclared property as a literal, not a dangling alias", () => {
    const { document } = canonicalFromCssCustomProperties(":root { --x: var(--not-here); }");
    expect(leafAt(document, "x")?.$value).toBe("var(--not-here)");
    // A dangling alias is a reported defect; a literal `var()` is a value that resolves at runtime.
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("infers the types the emitters switch on", () => {
    const { document } = canonicalFromCssCustomProperties(CSS);
    expect(leafAt(document, "color-blue-500")?.$type).toBe("color");
    expect(leafAt(document, "spacing-4")?.$type).toBe("dimension");
    expect(leafAt(document, "motion-fast")?.$type).toBe("duration");
  });

  it("omits the modes map for a single-context stylesheet rather than inventing one", () => {
    const { document } = canonicalFromCssCustomProperties(":root { --a: 1rem; }");
    expect(readTokenExtension(leafAt(document, "a"))).toBeUndefined();
    // And no collection registry either — the file has no collections to report.
    expect(readDocumentExtension(document)?.collections).toEqual([]);
  });

  it("round-trips through the emitters: the CSS it emits names the properties it read", () => {
    const { document } = canonicalFromCssCustomProperties(CSS);
    const css = emitTokens("css", document);
    expect(css).toContain("--color-blue-500: #1d4ed8;");
    expect(css).toContain("--color-primary: var(--color-blue-500);");
    expect(css).toContain("--motion-fast: 150ms;");
  });

  it("projects to the same flat rows the Inspector reads from a Figma artifact", () => {
    const { document } = canonicalFromCssCustomProperties(CSS);
    const rows = projectCanonicalToVariables(document);
    const primary = rows.find((row) => row.name === "color-primary");
    expect(primary?.type).toBe("color");
    expect(primary?.valuesByMode?.Dark?.aliasOf).toBe("color-blue-500");
  });

  it("disambiguates two selectors that derive the same mode name", () => {
    const { document } = canonicalFromCssCustomProperties(
      ':root { --a: 1; } .dark { --a: 2; } [data-theme="dark"] { --a: 3; }',
    );
    const modes = readDocumentExtension(document)?.collections?.[0]?.modes ?? [];
    // Both dark-ish selectors are kept; a shared name would have silently overwritten one.
    expect(new Set(modes).size).toBe(modes.length);
    expect(modes).toContain("Dark");
    expect(modes).toContain("Dark 2");
  });
});

describe("SCSS variables → the canonical artifact", () => {
  const SCSS = `
    // brand
    $color-primary: #1d4ed8 !default;
    $color-brand: $color-primary;
    $spacing-4: 1rem;
  `;

  it("reads declarations, aliases and types, and validates", () => {
    const { document, dropped } = canonicalFromScssVariables(SCSS, { source: "scss" });
    expect(dropped).toEqual([]);
    expect(leafAt(document, "color-primary")?.$value).toBe("#1d4ed8");
    expect(leafAt(document, "color-primary")?.$type).toBe("color");
    expect(leafAt(document, "color-brand")?.$value).toBe("{color-primary}");
    expect(leafAt(document, "spacing-4")?.$type).toBe("dimension");
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("has no modes at all — an SCSS variable is file-scoped, not selector-scoped", () => {
    const { document } = canonicalFromScssVariables(SCSS);
    expect(readTokenExtension(leafAt(document, "color-primary"))).toBeUndefined();
    expect(readDocumentExtension(document)?.collections).toEqual([]);
  });
});

describe("theme objects → the canonical artifact", () => {
  const THEME = {
    color: {
      blue: { 500: "#1d4ed8" },
      primary: { DEFAULT: "#1d4ed8", hover: "#1e40af" },
    },
    spacing: { 4: "1rem" },
    fontWeight: { bold: 700 },
  };

  it("preserves the object's nesting, because there the tree is real", () => {
    const { document, dropped } = canonicalFromThemeObject(THEME, { source: "theme-object" });
    expect(dropped).toEqual([]);
    expect(leafAt(document, "color.blue.500")?.$value).toBe("#1d4ed8");
    expect(leafAt(document, "spacing.4")?.$type).toBe("dimension");
    expect(leafAt(document, "fontWeight.bold")?.$type).toBe("fontWeight");
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("collapses a lone DEFAULT onto its group, as Tailwind means it", () => {
    const { document, dropped } = canonicalFromThemeObject({ colors: { primary: { DEFAULT: "#1d4ed8" } } });
    expect(dropped).toEqual([]);
    expect(leafAt(document, "colors.primary")?.$value).toBe("#1d4ed8");
    expect(leafAt(document, "colors.primary.DEFAULT")).toBeUndefined();
  });

  it("keeps DEFAULT as a child when the group has siblings, rather than dropping them", () => {
    // Collapsing here would make `color.primary` a token, and `color.primary.hover` a child of a
    // token — which DTCG forbids, so the sibling would vanish. A name is the cheaper thing to lose.
    const { document, dropped } = canonicalFromThemeObject(THEME);
    expect(dropped).toEqual([]);
    expect(leafAt(document, "color.primary.DEFAULT")?.$value).toBe("#1d4ed8");
    expect(leafAt(document, "color.primary.hover")?.$value).toBe("#1e40af");
    const flat = flattenCanonicalTokens(document).map((token) => token.name);
    expect(flat).toContain("color-primary-default");
    expect(flat).toContain("color-primary-hover");
  });

  it("unwraps the `{ value: … }` and `{ $value: … }` shapes token files really use", () => {
    const { document } = canonicalFromThemeObject({
      color: {
        a: { value: "#111", type: "color", description: "ink" },
        b: { $value: "#222", $type: "color" },
      },
    });
    expect(leafAt(document, "color.a")?.$value).toBe("#111");
    expect(leafAt(document, "color.a")?.$type).toBe("color");
    expect(leafAt(document, "color.a")?.$description).toBe("ink");
    expect(leafAt(document, "color.b")?.$value).toBe("#222");
  });

  it("keeps a var() reference verbatim — its target is in another file", () => {
    // The Tailwind v3 shape this repo's own emitter writes. An alias here would dangle.
    const { document } = canonicalFromThemeObject({ colors: { primary: "var(--color-primary)" } });
    expect(leafAt(document, "colors.primary")?.$value).toBe("var(--color-primary)");
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("keeps a {dotted} reference as a real DTCG alias", () => {
    const { document } = canonicalFromThemeObject({
      color: { blue: "#1d4ed8", primary: "{color.blue}" },
    });
    expect(leafAt(document, "color.primary")?.$value).toBe("{color.blue}");
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });
});
