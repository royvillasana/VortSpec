import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalFromCssCustomProperties } from "@vortspec/core/canonical-ingest";
import {
  deriveLiteManifest,
  mapCanonicalTokenGroup,
  serializeLiteManifest,
  TOKEN_GROUPS,
  VISUAL_TOKEN_GROUPS,
} from "@vortspec/core/lite-manifest";
import type { DesignTokenDocument } from "@vortspec/core/design-tokens";
import { buildDeriveInput, canonicalDeriveTokens, deriveProjectLiteManifest } from "./lite-source";
import { writeCanonicalTokens } from "../inspector/canonical-tokens";

/**
 * The light manifest derives its tokens from the canonical artifact — OpenSpec change:
 * agentic-design-system, task 7.11.
 *
 * The bug being closed: `buildDeriveInput` read VortSpec's coarse five-value `TokenType`, in which a
 * duration had already been folded into "spacing" on ingest, and `mapTokenGroup` returned null for
 * anything it did not recognise — so a motion token either reached `designer.md` mislabelled and
 * unitless, or did not reach it at all. Every assertion below is about a token SURVIVING the trip.
 */

/** A canonical artifact carrying one token of each interesting type. */
const DOC: DesignTokenDocument = {
  color: { primary: { $type: "color", $value: "#1d4ed8" } },
  spacing: { 4: { $type: "dimension", $value: 16 } },
  radius: { md: { $type: "dimension", $value: 8 } },
  motion: { fast: { $type: "duration", $value: 150 } },
  ease: { out: { $type: "cubicBezier", $value: [0, 0, 0.2, 1] } },
  layer: { modal: { $type: "number", $value: 1000 } },
} as unknown as DesignTokenDocument;

describe("mapCanonicalTokenGroup (task 7.11)", () => {
  it("keeps the distinctions the DTCG type actually made", () => {
    expect(mapCanonicalTokenGroup("color", "color.primary")).toBe("colors");
    expect(mapCanonicalTokenGroup("shadow", "elevation.1")).toBe("shadows");
    expect(mapCanonicalTokenGroup("fontWeight", "font.bold")).toBe("typography");
    expect(mapCanonicalTokenGroup("dimension", "spacing.4")).toBe("spacing");
    // The distinction the old path could not make: both arrived as `spacing`.
    expect(mapCanonicalTokenGroup("duration", "motion.fast")).toBe("motion");
    expect(mapCanonicalTokenGroup("cubicBezier", "ease.out")).toBe("motion");
  });

  it("separates radius from spacing by name, since both are dimensions", () => {
    expect(mapCanonicalTokenGroup("dimension", "radius.md")).toBe("radius");
    expect(mapCanonicalTokenGroup("dimension", "spacing.4")).toBe("spacing");
  });

  it("never returns null — an unknown type lands in `other`, not nowhere", () => {
    expect(mapCanonicalTokenGroup("number", "layer.modal")).toBe("other");
    expect(mapCanonicalTokenGroup("someFutureType", "x.y")).toBe("other");
    expect(mapCanonicalTokenGroup(undefined, "totally-opaque")).toBe("other");
  });

  it("falls back to the name for an untyped token, as a plain stylesheet's tokens are", () => {
    expect(mapCanonicalTokenGroup(undefined, "color-primary")).toBe("colors");
    expect(mapCanonicalTokenGroup(undefined, "radius-md")).toBe("radius");
    expect(mapCanonicalTokenGroup(undefined, "transition-fast")).toBe("motion");
  });
});

describe("canonicalDeriveTokens", () => {
  it("carries every token through, in the group its type implies", () => {
    const tokens = canonicalDeriveTokens(DOC);
    const byName = new Map(tokens.map((token) => [token.name, token]));
    expect(byName.get("color-primary")).toEqual({ name: "color-primary", value: "#1d4ed8", group: "colors" });
    expect(byName.get("radius-md")?.group).toBe("radius");
    expect(byName.get("layer-modal")?.group).toBe("other");
    // Nothing was dropped on the way.
    expect(tokens.length).toBe(6);
  });

  it("renders the value with the unit the type implies — the information the old path lost", () => {
    const byName = new Map(canonicalDeriveTokens(DOC).map((token) => [token.name, token]));
    expect(byName.get("motion-fast")).toEqual({ name: "motion-fast", value: "150ms", group: "motion" });
    expect(byName.get("spacing-4")?.value).toBe("16px");
    expect(byName.get("ease-out")?.value).toBe("cubic-bezier(0, 0, 0.2, 1)");
  });

  it("resolves aliases, because a light page has no cascade to resolve them against", () => {
    const { document } = canonicalFromCssCustomProperties(
      ":root { --blue-500: #1d4ed8; --color-primary: var(--blue-500); }",
    );
    const byName = new Map(canonicalDeriveTokens(document).map((token) => [token.name, token]));
    expect(byName.get("color-primary")?.value).toBe("#1d4ed8");
  });
});

describe("buildDeriveInput prefers the canonical artifact", () => {
  const inspectorTokens = [{ name: "color-primary", type: "color", resolvedValue: "#c53434" }];

  it("uses the canonical tokens when one is supplied", () => {
    const input = buildDeriveInput("Acme", inspectorTokens, [], DOC);
    expect(input.tokens.map((t) => t.name)).toContain("motion-fast");
    // The canonical value wins — it is the artifact every emitter also reads.
    expect(input.tokens.find((t) => t.name === "color-primary")?.value).toBe("#1d4ed8");
  });

  it("falls back to the inspector tokens when the project has no artifact yet", () => {
    // A project that has never been scanned must not regress to an empty manifest.
    for (const canonical of [undefined, null]) {
      const input = buildDeriveInput("Acme", inspectorTokens, [], canonical);
      expect(input.tokens).toEqual([{ name: "color-primary", value: "#c53434", group: "colors" }]);
    }
  });
});

describe("the manifest lists every group, and draws only the ones it can", () => {
  it("puts motion and other in `tokens`, and keeps `foundations.groups` to the drawable ones", () => {
    const manifest = deriveLiteManifest({
      projectName: "Acme",
      tokens: canonicalDeriveTokens(DOC),
      components: [],
    });
    expect(manifest.tokens.motion.map((t) => t.name)).toEqual(["motion-fast", "ease-out"]);
    expect(manifest.tokens.other.map((t) => t.name)).toEqual(["layer-modal"]);
    // The visual reference index stays the groups a swatch can honestly represent…
    expect(manifest.foundations.groups).not.toContain("motion");
    expect(manifest.foundations.groups).toEqual(["colors", "spacing", "radius"]);
    // …and `motion`/`other` are not in it precisely because they are not drawable.
    expect(VISUAL_TOKEN_GROUPS).not.toContain("other");
    expect(TOKEN_GROUPS).toContain("other");
  });

  it("writes them into designer.md, where a light page author can reference them", () => {
    const text = serializeLiteManifest(
      deriveLiteManifest({ projectName: "Acme", tokens: canonicalDeriveTokens(DOC), components: [] }),
    );
    expect(text).toContain("motion:");
    expect(text).toContain(`{ name: "motion-fast", value: "150ms" }`);
    expect(text).toContain("other:");
    expect(text).toContain(`{ name: "layer-modal", value: "1000" }`);
  });
});

describe("end to end: a duration in the design system reaches designer.md", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-lite-canonical-"));
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de", "project.yaml"),
      "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
      "utf8",
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("derives the manifest from the artifact on disk, motion tokens included", async () => {
    await writeCanonicalTokens(dir, DOC);

    const manifest = await deriveProjectLiteManifest(dir);

    expect(manifest.tokens.motion.map((t) => t.value)).toEqual(["150ms", "cubic-bezier(0, 0, 0.2, 1)"]);
    expect(manifest.tokens.other.map((t) => t.name)).toEqual(["layer-modal"]);
  });

  it("still derives a manifest when there is no artifact — the fallback is intact", async () => {
    await writeFile(join(dir, "src-tokens-absent"), "", "utf8");
    const manifest = await deriveProjectLiteManifest(dir);
    // No artifact and no token file: an empty but well-formed manifest, not a throw.
    expect(manifest.tokens.motion).toEqual([]);
    expect(manifest.name).toContain("Lite Design System");
  });
});
