import { describe, expect, it } from "vitest";
import { DTCG_EXTENSION_NS, type DesignTokenDocument } from "./design-tokens";
import {
  curateTailwindTheme,
  emitTokens,
  emitTokensForStyling,
  flattenCanonicalTokens,
  resolveEmitFormat,
  SUPPORTED_STYLING_APPROACHES,
} from "./token-emitters";

/**
 * A small but REPRESENTATIVE canonical artifact: primitives a semantic layer aliases, a spacing
 * scale on the 4px grid, two radii, two composite shadows, a duration and a two-mode token. Between
 * them they exercise every branch the emitters have — alias vs literal, unit inference, ladder
 * naming, mode selection.
 */
function doc(): DesignTokenDocument {
  return {
    primitive: {
      color: {
        blue: {
          $type: "color",
          "100": { $value: "#DBEAFE" },
          "500": { $value: "#1D4ED8" },
        },
      },
      spacing: {
        $type: "dimension",
        "4": { $value: 4 },
        "8": { $value: 8 },
        "16": { $value: 16 },
      },
      radius: {
        $type: "dimension",
        "4": { $value: 4 },
        "8": { $value: 8 },
      },
    },
    theme: {
      color: {
        primary: { $type: "color", $value: "{primitive.color.blue.500}" },
      },
    },
    shadow: {
      $type: "shadow",
      sm: { $value: { offsetX: 0, offsetY: 1, blur: 2, color: "#0000001a" } },
      md: { $value: { offsetX: 0, offsetY: 4, blur: 8, color: "#00000026" } },
    },
    motion: {
      duration: { fast: { $type: "duration", $value: 150 } },
    },
    typography: {
      "font-family": { base: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } },
      "font-size": { body: { $type: "dimension", $value: 14 } },
    },
  } as unknown as DesignTokenDocument;
}

/** A token carrying a Light and a Dark mode, in the `$extensions` shape ingest writes. */
function twoModeDoc(): DesignTokenDocument {
  return {
    surface: {
      background: {
        $type: "color",
        $value: "#FFFFFF",
        $extensions: {
          [DTCG_EXTENSION_NS]: {
            defaultMode: "Light",
            modes: { Light: { value: "#FFFFFF" }, Dark: { value: "#0B0B0F" } },
          },
        },
      },
    },
  } as unknown as DesignTokenDocument;
}

/**
 * The spacing convention most Figma systems ship: steps named for their PIXEL value, not for
 * Tailwind's 4px step. Every raw name here (`--spacing-4`, `--spacing-8`) is also a name Tailwind's
 * own spacing namespace wants — for a different token.
 */
function pxNamedSpacingDoc(): DesignTokenDocument {
  return {
    spacing: {
      $type: "dimension",
      "4": { $value: 4 },
      "8": { $value: 8 },
      "16": { $value: 16 },
    },
    semantic: {
      gap: { tight: { $type: "dimension", $value: "{spacing.4}" } },
    },
  } as unknown as DesignTokenDocument;
}

/**
 * The other convention most Figma/shadcn systems ship: colors nested by ROLE, where the leaf
 * segment is the role's variant and the segment above it is the role. Every one of these ends in
 * `primary` or `secondary`, so keying a family on the last segment alone collapses them.
 */
function roleNestedColorDoc(): DesignTokenDocument {
  return {
    color: {
      $type: "color",
      text: { primary: { $value: "#111111" }, secondary: { $value: "#555555" } },
      background: { primary: { $value: "#FFFFFF" }, secondary: { $value: "#F4F4F5" } },
      border: { primary: { $value: "#E4E4E7" }, secondary: { $value: "#D4D4D8" } },
      brand: { "500": { $value: "#1D4ED8" } },
    },
  } as unknown as DesignTokenDocument;
}

/** A stroke-width scale named the way the design-system extraction skill prescribes. */
function strokeWidthDoc(): DesignTokenDocument {
  return {
    stroke: {
      width: {
        $type: "dimension",
        "1": { $value: 1 },
        "2": { $value: 2 },
        "4": { $value: 4 },
      },
    },
  } as unknown as DesignTokenDocument;
}

/** Every `var(--x)` in a stylesheet must have an `--x:` declaration somewhere in the same file. */
function expectEveryReferenceDeclared(css: string): void {
  const declared = new Set([...css.matchAll(/--([A-Za-z0-9_-]+):/g)].map((m) => m[1]));
  const referenced = [...css.matchAll(/var\(--([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]);
  expect(referenced.length).toBeGreaterThan(0);
  expect(referenced.filter((name) => !declared.has(name))).toEqual([]);
}

describe("flattenCanonicalTokens", () => {
  it("derives file-safe names from the group path without flattening the artifact", () => {
    const document = doc();
    const flat = flattenCanonicalTokens(document);
    expect(flat.map((t) => t.name)).toContain("primitive-color-blue-500");
    // The document handed in is untouched — flattening is a read concern.
    expect(document).toEqual(doc());
  });

  it("keeps the alias AND the literal behind it", () => {
    const primary = flattenCanonicalTokens(doc()).find((t) => t.name === "theme-color-primary");
    expect(primary?.aliasOf).toEqual(["primitive", "color", "blue", "500"]);
    expect(primary?.resolved).toBe("#1D4ED8");
  });

  it("inherits $type from the nearest ancestor group", () => {
    const flat = flattenCanonicalTokens(doc());
    expect(flat.find((t) => t.name === "primitive-spacing-16")?.type).toBe("dimension");
  });

  it("reads the requested mode", () => {
    const flat = flattenCanonicalTokens(twoModeDoc(), { mode: "Dark" });
    expect(flat[0].value).toBe("#0B0B0F");
  });
});

describe("emitTokens — css (task 7.5)", () => {
  it("emits custom properties and keeps an alias as a var() reference", () => {
    const css = emitTokens("css", doc());
    expect(css).toContain("--primitive-color-blue-500: #1D4ED8;");
    expect(css).toContain("--theme-color-primary: var(--primitive-color-blue-500);");
  });

  it("infers units from $type — px for a dimension, ms for a duration", () => {
    const css = emitTokens("css", doc());
    expect(css).toContain("--primitive-spacing-16: 16px;");
    expect(css).toContain("--motion-duration-fast: 150ms;");
  });

  it("flattens a shadow composite into the box-shadow longhand", () => {
    expect(emitTokens("css", doc())).toContain("--shadow-md: 0 4px 8px #00000026;");
  });

  it("honours the root selector", () => {
    expect(emitTokens("css", doc(), { rootSelector: "[data-theme]" })).toContain("[data-theme] {");
  });
});

describe("emitTokens — scss (task 7.5)", () => {
  it("emits SCSS variables and expresses an alias as a SCSS reference", () => {
    const scss = emitTokens("scss", doc());
    expect(scss).toContain("$primitive-color-blue-500: #1D4ED8;");
    expect(scss).toContain("$theme-color-primary: $primitive-color-blue-500;");
  });
});

describe("emitTokens — ts theme (task 7.5)", () => {
  it("mirrors the token tree as a nested const object", () => {
    const ts = emitTokens("ts", doc(), { exportName: "tokens" });
    expect(ts).toContain("export const tokens = {");
    expect(ts).toContain("as const;");
    expect(ts).toContain('"500": "#1D4ED8"');
  });

  it("resolves aliases to literals, since an object literal cannot reference itself", () => {
    const ts = emitTokens("ts", doc());
    expect(ts).toContain('primary: "#1D4ED8"');
  });
});

describe("curateTailwindTheme — a curated semantic mapping, not a raw dump (task 7.6)", () => {
  it("maps standard utilities to project tokens rather than Tailwind's defaults", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    // p-4  → the 16px token, because Tailwind's spacing step is 4px
    expect(extend.spacing?.["4"]).toBe("var(--primitive-spacing-16)");
    // rounded → the DEFAULT radius, snapped to the project's nearest token
    expect(extend.borderRadius?.DEFAULT).toBe("var(--primitive-radius-4)");
    // shadow-md → the project's md shadow
    expect(extend.boxShadow?.md).toBe("var(--shadow-md)");
    // bg-primary → the semantic primary
    expect(extend.colors?.primary).toBe("var(--theme-color-primary)");
  });

  it("names colors semantically instead of dumping one key per token", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    expect(Object.keys(extend.colors ?? {})).toEqual(["blue", "primary"]);
    expect(extend.colors?.blue).toEqual({
      "100": "var(--primitive-color-blue-100)",
      "500": "var(--primitive-color-blue-500)",
    });
  });

  it("keeps role-nested colors apart instead of collapsing them onto their last segment", () => {
    const flat = flattenCanonicalTokens(roleNestedColorDoc());
    const extend = curateTailwindTheme(flat);
    const rendered = JSON.stringify(extend.colors);
    // Not one token may be dropped: a color no utility reaches forces component code back onto
    // `bg-[var(--…)]`, the arbitrary-value output the spec forbids as an emitter's output.
    for (const token of flat)
      expect(rendered.split(`"var(--${token.name})"`)).toHaveLength(2);
    // …and each utility points at its OWN token, not at whichever role happened to win.
    expect(extend.colors?.["text-primary"]).toBe("var(--color-text-primary)");
    expect(extend.colors?.["background-primary"]).toBe("var(--color-background-primary)");
    expect(extend.colors?.["border-primary"]).toBe("var(--color-border-primary)");
    expect(extend.colors?.["text-secondary"]).toBe("var(--color-text-secondary)");
    expect(extend.colors?.["background-secondary"]).toBe("var(--color-background-secondary)");
    expect(extend.colors?.["border-secondary"]).toBe("var(--color-border-secondary)");
    // `brand` is still normalised onto `primary`, and now owns the ramp uncontested.
    expect(extend.colors?.primary).toEqual({ "500": "var(--color-brand-500)" });
  });

  it("keeps BOTH tokens when two paths still want one key, rather than dropping the loser", () => {
    const extend = curateTailwindTheme(
      flattenCanonicalTokens({
        color: { accent: { $type: "color", $value: "#111111" } },
        semantic: { color: { accent: { $type: "color", $value: "#222222" } } },
      } as unknown as DesignTokenDocument),
    );
    // The shorter — more semantic — path keeps the plain key…
    expect(extend.colors?.accent).toBe("var(--color-accent)");
    // …and the longer one is still reachable under a key of its own.
    expect(JSON.stringify(extend.colors)).toContain("var(--semantic-color-accent)");
  });

  it("gives every value as a var() reference, so the CSS layer stays the source of truth", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    const values = JSON.stringify(extend).match(/"[^"]*"/g) ?? [];
    const refs = values.filter((v) => v.startsWith('"var('));
    expect(refs.length).toBeGreaterThan(0);
    expect(JSON.stringify(extend)).not.toContain("#1D4ED8");
  });

  it("routes a token to the scale its name and type earn, and no further", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    expect(extend.borderRadius?.lg).toBe("var(--primitive-radius-8)");
    expect(extend.transitionDuration?.fast).toBe("var(--motion-duration-fast)");
    // A radius must never also land on `spacing` — `p-1` would then mean a corner radius.
    expect(Object.values(extend.spacing ?? {})).not.toContain("var(--primitive-radius-4)");
  });

  it("backfills DEFAULT so `rounded` and `shadow` never fall back to Tailwind's own values", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    expect(extend.boxShadow?.DEFAULT).toBe(extend.boxShadow?.md);
  });

  it("backfills borderWidth.DEFAULT from the token nearest 1px, so `border` is not Tailwind's", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(strokeWidthDoc()));
    expect(extend.borderWidth?.["1"]).toBe("var(--stroke-width-1)");
    // `border` with no suffix is the utility component code writes most; unbacked it silently
    // means Tailwind's hardcoded 1px rather than the project's own stroke token.
    expect(extend.borderWidth?.DEFAULT).toBe("var(--stroke-width-1)");
  });

  it("falls back to the narrowest non-`none` width when no token sits near 1px", () => {
    const extend = curateTailwindTheme(
      flattenCanonicalTokens({
        border: {
          width: {
            $type: "dimension",
            none: { $value: 0 },
            thin: { $value: 3 },
            thick: { $value: 6 },
          },
        },
      } as unknown as DesignTokenDocument),
    );
    expect(extend.borderWidth?.DEFAULT).toBe("var(--border-width-thin)");
    expect(extend.borderWidth?.none).toBe("var(--border-width-none)");
  });

  it("points `font-sans` at the system's body family, and keeps its own name too", () => {
    const extend = curateTailwindTheme(flattenCanonicalTokens(doc()));
    expect(extend.fontFamily?.sans).toBe("var(--typography-font-family-base)");
    // `base` must NOT collapse to DEFAULT — `font` is not a Tailwind utility, `font-base` is.
    expect(extend.fontFamily?.base).toBe("var(--typography-font-family-base)");
    expect(extend.fontFamily?.DEFAULT).toBeUndefined();
  });
});

describe("emitTokens — tailwind (tasks 7.5, 7.6)", () => {
  it("v3 writes a config whose theme.extend is the curated mapping", () => {
    const config = emitTokens("tailwind-v3", doc(), { content: ["./src/**/*.tsx"] });
    expect(config).toContain("export default {");
    expect(config).toContain('content: ["./src/**/*.tsx"]');
    expect(config).toContain('"4": "var(--primitive-spacing-16)"');
    // A raw arbitrary-value dump is exactly what this must not be.
    expect(config).not.toContain("bg-[");
  });

  it("v4 writes the raw token layer plus an @theme block on top of it", () => {
    const css = emitTokens("tailwind-v4", doc());
    expect(css).toContain("--primitive-spacing-16: 16px;");
    expect(css).toContain("@theme {");
    expect(css).toContain("--color-primary: var(--theme-color-primary);");
    expect(css).toContain("--spacing-4: var(--primitive-spacing-16);");
    // The DEFAULT key is the bare namespace in v4 — `rounded` reads `--radius`.
    expect(css).toContain("--radius: var(--primitive-radius-4);");
  });

  it("v4 never self-references a token whose name IS the theme namespace name", () => {
    const css = emitTokens("tailwind-v4", doc());
    // `shadow/md` in the design system and `--shadow-md` in v4's namespace are the same name, so
    // the raw token moves aside and the theme entry follows it there.
    expect(css).not.toContain("--shadow-md: var(--shadow-md);");
    expect(css).toContain("--token-shadow-md: 0 4px 8px #00000026;");
    expect(css).toContain("--shadow-md: var(--token-shadow-md);");
    expect(css.match(/--shadow-md:/g)).toHaveLength(1);
  });

  it("v4 leaves a non-colliding token declared exactly once in the raw layer", () => {
    const css = emitTokens("tailwind-v4", doc());
    expect(css.match(/--primitive-spacing-16:/g)).toHaveLength(1);
  });

  it("v4 declares a contended name once, and it resolves to the curated token", () => {
    // The most common Figma spacing convention: a px-NAMED scale. `spacing/4` wants the raw name
    // `--spacing-4`, and so does the curated 4px grid — where it must mean the 16px token.
    const css = emitTokens("tailwind-v4", pxNamedSpacingDoc());
    expect(css.match(/--spacing-4:/g)).toHaveLength(1);
    expect(css).toContain("--spacing-4: var(--spacing-16);");
    expect(css).toContain("--spacing-16: 16px;");
    // The displaced 4px token is not lost, and nothing points at it under the contended name.
    expect(css).toContain("--token-spacing-4: 4px;");
    expect(css).toContain("--spacing-1: var(--token-spacing-4);");
  });

  it("v4 rewrites a raw-layer alias whose target was displaced by a theme name", () => {
    const css = emitTokens("tailwind-v4", pxNamedSpacingDoc());
    // `semantic/gap/tight` aliases `spacing/4`, which moved — the alias must move with it.
    expect(css).toContain("--semantic-gap-tight: var(--token-spacing-4);");
  });

  it("v4 declares every custom property its @theme block references", () => {
    for (const document of [doc(), pxNamedSpacingDoc()])
      expectEveryReferenceDeclared(emitTokens("tailwind-v4", document));
  });
});

describe("emitTokensForStyling", () => {
  it("routes each supported styling approach to its emitter", () => {
    expect(emitTokensForStyling("css", doc()).format).toBe("css");
    expect(emitTokensForStyling("css-modules", doc()).format).toBe("css");
    expect(emitTokensForStyling("scss", doc()).files[0].extension).toBe(".scss");
    expect(emitTokensForStyling("styled-components", doc()).format).toBe("ts");
    expect(emitTokensForStyling("emotion", doc()).format).toBe("ts");
    expect(emitTokensForStyling("tailwind", doc()).format).toBe("tailwind-v4");
    expect(emitTokensForStyling("tailwind", doc(), { tailwindVersion: 3 }).format).toBe(
      "tailwind-v3",
    );
  });

  it("emits one file, the token file itself, for every self-sufficient format", () => {
    for (const styling of ["css", "css-modules", "scss", "styled-components", "emotion", "tailwind"])
      expect(emitTokensForStyling(styling, doc()).files.map((f) => f.role)).toEqual(["token-file"]);
  });

  it("emits the custom-property layer a Tailwind v3 config cannot work without", () => {
    const emitted = emitTokensForStyling("tailwind", doc(), { tailwindVersion: 3 });
    expect(emitted.files.map((f) => [f.role, f.extension])).toEqual([
      ["token-file", ".js"],
      ["custom-properties", ".css"],
    ]);
    // The config is nothing but var() references; every one of them must be declared by the
    // companion, or the utilities it generates compute to nothing at all.
    expectEveryReferenceDeclared(emitted.files.map((f) => f.content).join("\n"));
    expect(emitted.files[1].content).toContain("--primitive-spacing-16: 16px;");
  });

  it("fails loudly, naming the approach, when nothing emits it (task 7.7)", () => {
    expect(() => emitTokensForStyling("vanilla-extract", doc())).toThrow(/vanilla-extract/);
    expect(() => emitTokensForStyling(undefined, doc())).toThrow(/styling approach/);
  });

  it("never falls back to a format the project cannot consume (task 7.7)", () => {
    let emitted: unknown = "not thrown";
    try {
      emitted = emitTokensForStyling("panda", doc());
    } catch (error) {
      emitted = error;
    }
    expect(emitted).toBeInstanceOf(Error);
    expect(SUPPORTED_STYLING_APPROACHES).not.toContain("panda");
  });

  it("answers the same question without throwing, for callers that only want to ask", () => {
    expect(resolveEmitFormat("panda")).toBeNull();
    expect(resolveEmitFormat("SCSS")).toBe("scss");
  });

  it("is idempotent — the same document emits byte-identical output", () => {
    for (const format of ["css", "scss", "tailwind-v3", "tailwind-v4", "ts"] as const)
      expect(emitTokens(format, doc())).toBe(emitTokens(format, doc()));
  });
});
