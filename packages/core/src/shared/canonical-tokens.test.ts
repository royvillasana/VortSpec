import { describe, expect, it } from "vitest";
import {
  canonicalFromDtcgExport,
  canonicalFromVariableModel,
  dtcgAliasToSourceName,
  dtcgTypeForVariable,
  projectCanonicalToVariables,
  validateCanonicalTokens,
} from "./canonical-tokens";
import {
  DTCG_EXTENSION_NS,
  readDocumentExtension,
  readTokenExtension,
  type DesignTokenDocument,
  type DesignTokenLeaf,
} from "./design-tokens";
import type { FigmaVariableModel } from "./inspector";

/** The token at a dot path, as a leaf — the tests read the tree, so they need to walk it. */
function leafAt(document: DesignTokenDocument, path: string): DesignTokenLeaf {
  let node: unknown = document;
  for (const segment of path.split(".")) node = (node as Record<string, unknown>)[segment];
  if (!node || typeof node !== "object" || !("$value" in node)) throw new Error(`no token at ${path}`);
  return node as DesignTokenLeaf;
}

/** A two-collection, two-mode model with an alias, a durable key and a dotted name to sanitise. */
function model(): FigmaVariableModel {
  return {
    collections: [
      {
        name: "Primitives",
        modes: [
          { id: "1:0", name: "Light" },
          { id: "1:1", name: "Dark" },
        ],
        defaultModeId: "1:0",
      },
      {
        name: "Semantic",
        modes: [
          { id: "2:0", name: "Light" },
          { id: "2:1", name: "Dark" },
        ],
        defaultModeId: "2:0",
      },
    ],
    variables: [
      {
        name: "primitive/color/primary",
        resolvedValue: "#7C6FF0",
        type: "color",
        collection: "Primitives",
        resolvedType: "COLOR",
        key: "b1c9f0a3",
        valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#9C93F5" } },
      },
      {
        name: "semantic/color/action",
        resolvedValue: "#7C6FF0",
        type: "color",
        collection: "Semantic",
        resolvedType: "COLOR",
        key: "c2da01b4",
        valuesByMode: {
          Light: { value: "#7C6FF0", aliasOf: "primitive/color/primary" },
          Dark: { value: "#9C93F5", aliasOf: "primitive/color/primary" },
        },
      },
      {
        name: "spacing/0.5",
        resolvedValue: "2",
        type: "spacing",
        collection: "Primitives",
        resolvedType: "FLOAT",
        valuesByMode: { Light: { value: "2" }, Dark: { value: "2" } },
      },
    ],
  };
}

describe("canonicalFromVariableModel (task 7.2 — the tree survives ingest)", () => {
  it("nests the group path instead of flattening it", () => {
    const { document } = canonicalFromVariableModel(model());
    expect(leafAt(document, "primitive.color.primary")).toBeDefined();
    expect(document["primitive/color/primary"]).toBeUndefined();
  });

  it("writes a reference as a DTCG alias, with the concrete value kept alongside", () => {
    const { document } = canonicalFromVariableModel(model());
    const action = leafAt(document, "semantic.color.action");
    expect(action.$value).toBe("{primitive.color.primary}");
    expect(readTokenExtension(action)?.modes).toEqual({
      Light: { value: "#7C6FF0", alias: "{primitive.color.primary}" },
      Dark: { value: "#9C93F5", alias: "{primitive.color.primary}" },
    });
  });

  it("keeps both modes and mirrors the default mode in $value", () => {
    const { document } = canonicalFromVariableModel(model());
    const primary = leafAt(document, "primitive.color.primary");
    const ext = readTokenExtension(primary);
    expect(ext?.defaultMode).toBe("Light");
    expect(ext?.modes).toEqual({ Light: { value: "#7C6FF0" }, Dark: { value: "#9C93F5" } });
    expect(primary.$value).toBe("#7C6FF0");
  });

  it("records the durable key and the source's own scalar type", () => {
    const { document } = canonicalFromVariableModel(model());
    expect(readTokenExtension(leafAt(document, "primitive.color.primary"))?.figma).toEqual({ key: "b1c9f0a3", resolvedType: "COLOR" });
  });

  it("sanitises a name DTCG cannot address and records the original", () => {
    const { document } = canonicalFromVariableModel(model());
    expect(Object.keys(document.spacing as object)).toEqual(["0-5"]);
    expect(readTokenExtension(leafAt(document, "spacing.0-5"))?.figma?.sourceName).toBe(
      "spacing/0.5",
    );
  });

  it("registers every collection with its ordered modes and default mode", () => {
    const { document } = canonicalFromVariableModel(model(), {
      source: "figma",
      generatedAt: "2026-08-07T10:14:22.000Z",
    });
    expect(readDocumentExtension(document)).toEqual({
      source: "figma",
      generatedAt: "2026-08-07T10:14:22.000Z",
      collections: [
        { name: "Primitives", modes: ["Light", "Dark"], defaultMode: "Light" },
        { name: "Semantic", modes: ["Light", "Dark"], defaultMode: "Light" },
      ],
    });
  });

  it("omits the modes map for a single-mode literal — $value already says it all", () => {
    const { document } = canonicalFromVariableModel({
      collections: [{ name: "Core", modes: [{ id: "1:0", name: "Value" }], defaultModeId: "1:0" }],
      variables: [
        {
          name: "radius/md",
          resolvedValue: "8",
          collection: "Core",
          resolvedType: "FLOAT",
          valuesByMode: { Value: { value: "8" } },
        },
      ],
    });
    const md = leafAt(document, "radius.md");
    expect(md.$value).toBe("8");
    expect(readTokenExtension(md)?.modes).toBeUndefined();
  });

  it("reports a variable whose path collides with a token rather than dropping it silently", () => {
    const { document, dropped } = canonicalFromVariableModel({
      collections: [],
      variables: [
        { name: "color/primary", resolvedValue: "#000" },
        { name: "color/primary/500", resolvedValue: "#111" },
      ],
    });
    expect(dropped).toEqual(["color/primary/500"]);
    expect(leafAt(document, "color.primary").$value).toBe("#000");
  });

  it("keeps a $-prefixed source name addressable instead of losing it to the format", () => {
    // `$` is DTCG's prefix for format members. Written through, `$extensions/foo` would be a node
    // every reader skips — and the document-level `$extensions` block would then overwrite the whole
    // group, so the token would vanish with `dropped` empty and the validator reporting all clear.
    const { document, dropped } = canonicalFromVariableModel({
      collections: [],
      variables: [
        { name: "$extensions/foo", resolvedValue: "#000" },
        { name: "$brand/primary", resolvedValue: "#111" },
      ],
    });
    expect(dropped).toEqual([]);
    expect(leafAt(document, "-extensions.foo").$value).toBe("#000");
    expect(readTokenExtension(leafAt(document, "-extensions.foo"))?.figma?.sourceName).toBe(
      "$extensions/foo",
    );
    // The document's own `$extensions` block still lands, and the tokens survive beside it.
    expect(readDocumentExtension(document)?.collections).toEqual([]);
    expect(projectCanonicalToVariables(document).map((v) => v.name)).toEqual([
      "$extensions/foo",
      "$brand/primary",
    ]);
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("produces an artifact that validates", () => {
    const { document } = canonicalFromVariableModel(model(), { source: "figma" });
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });
});

describe("canonicalFromDtcgExport (task 7.2 — the export tree is persisted unmodified)", () => {
  const exported = {
    $schema: "https://tokens.example/schema.json",
    color: {
      $type: "color",
      brand: { $value: "#087990", $description: "House teal." },
      action: { $value: "{color.brand}" },
    },
  };

  it("keeps nesting, aliases, descriptions and unknown $-members verbatim", () => {
    const doc = canonicalFromDtcgExport(exported, { source: "figma" });
    expect(doc?.$schema).toBe("https://tokens.example/schema.json");
    expect(doc?.color).toEqual(exported.color);
  });

  it("stamps provenance without inventing collections a flat export never had", () => {
    const doc = canonicalFromDtcgExport(exported, {
      source: "figma",
      generatedAt: "2026-08-07T10:14:22.000Z",
    });
    expect(readDocumentExtension(doc ?? undefined)).toEqual({
      source: "figma",
      generatedAt: "2026-08-07T10:14:22.000Z",
      collections: [],
    });
  });

  it("passes another vendor's $extensions block through untouched", () => {
    const doc = canonicalFromDtcgExport({
      $extensions: { "com.example.other": { keep: true } },
      color: { brand: { $type: "color", $value: "#000" } },
    });
    expect((doc?.$extensions as Record<string, unknown>)["com.example.other"]).toEqual({
      keep: true,
    });
  });

  it("keeps every valid token when the export carries a branch that is not a token", () => {
    // Real exports carry non-token branches (`version`, a `meta` block). Failing the whole document
    // over one of them would discard every valid token in the file AND leave the stale cache in
    // place — the exact silent, total loss this ingest exists to prevent.
    const doc = canonicalFromDtcgExport({
      version: "1.0",
      meta: { version: "1.0" },
      color: { brand: { $type: "color", $value: "#087990" } },
    });
    expect(doc).not.toBeNull();
    expect(leafAt(doc as DesignTokenDocument, "color.brand").$value).toBe("#087990");
    expect(projectCanonicalToVariables(doc)).toEqual([
      {
        name: "color/brand",
        resolvedValue: "#087990",
        type: "color",
        collection: undefined,
        resolvedType: undefined,
        key: undefined,
        valuesByMode: undefined,
      },
    ]);
    // The problem is REPORTED rather than made fatal.
    expect(validateCanonicalTokens(doc).valid).toBe(false);
  });

  it("returns null only when there is no tree to persist", () => {
    expect(canonicalFromDtcgExport("nope")).toBeNull();
    expect(canonicalFromDtcgExport(null)).toBeNull();
    expect(canonicalFromDtcgExport([])).toBeNull();
  });
});

describe("projectCanonicalToVariables (task 7.3 — flattening is a read concern)", () => {
  it("round-trips the model through the artifact back to flat rows", () => {
    const { document } = canonicalFromVariableModel(model());
    const rows = projectCanonicalToVariables(document);
    expect(rows).toEqual([
      {
        name: "primitive/color/primary",
        resolvedValue: "#7C6FF0",
        type: "color",
        collection: "Primitives",
        resolvedType: "COLOR",
        key: "b1c9f0a3",
        valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#9C93F5" } },
      },
      {
        name: "semantic/color/action",
        resolvedValue: "#7C6FF0",
        type: "color",
        collection: "Semantic",
        resolvedType: "COLOR",
        key: "c2da01b4",
        valuesByMode: {
          Light: { value: "#7C6FF0", aliasOf: "primitive/color/primary" },
          Dark: { value: "#9C93F5", aliasOf: "primitive/color/primary" },
        },
      },
      {
        name: "spacing/0.5",
        resolvedValue: "2",
        type: "spacing",
        collection: "Primitives",
        resolvedType: "FLOAT",
        key: undefined,
        valuesByMode: { Light: { value: "2" }, Dark: { value: "2" } },
      },
    ]);
  });

  it("leaves the artifact unflattened on disk — the projection is the only flat thing", () => {
    const { document } = canonicalFromVariableModel(model());
    expect(Object.keys(document).sort()).toEqual(["$extensions", "primitive", "semantic", "spacing"]);
  });

  it("resolves an aliased token's resolvedValue to the concrete default-mode value", () => {
    const { document } = canonicalFromVariableModel(model());
    const action = projectCanonicalToVariables(document).find(
      (v) => v.name === "semantic/color/action",
    );
    expect(action?.resolvedValue).toBe("#7C6FF0");
    expect(action?.valuesByMode?.Light.aliasOf).toBe("primitive/color/primary");
  });

  it("produces exactly the pre-artifact rows for a plain export with no $extensions", () => {
    const rows = projectCanonicalToVariables({
      "brand-primary": { "500": { $type: "color", $value: "#087990" } },
    });
    expect(rows).toEqual([
      {
        name: "brand-primary/500",
        resolvedValue: "#087990",
        type: "color",
        collection: undefined,
        resolvedType: undefined,
        key: undefined,
        valuesByMode: undefined,
      },
    ]);
  });
});

describe("validateCanonicalTokens (task 7.4)", () => {
  const valid = {
    $extensions: { [DTCG_EXTENSION_NS]: { source: "figma", collections: [] } },
    color: { brand: { $type: "color", $value: "#087990" } },
    semantic: { action: { $type: "color", $value: "{color.brand}" } },
  };

  it("accepts a well-formed artifact", () => {
    const result = validateCanonicalTokens(valid);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.document).not.toBeNull();
  });

  it("rejects a token that carries design-source structure outside $extensions", () => {
    const result = validateCanonicalTokens({
      color: {
        brand: {
          $type: "color",
          $value: "#087990",
          collection: "Primitives",
          valuesByMode: { Light: "#087990" },
          figma: { key: "b1c9f0a3", resolvedType: "COLOR" },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(
      result.violations
        .filter((v) => v.code === "source-field-outside-extensions")
        .map((v) => v.path)
        .sort(),
    ).toEqual(["color.brand.collection", "color.brand.figma", "color.brand.valuesByMode"]);
  });

  it("leaves a GROUP legitimately named after a source field alone", () => {
    // `modes` here is a real token path (`modes/compact`), not smuggled structure — flagging it
    // would make the validator reject an artifact that is entirely correct.
    expect(
      validateCanonicalTokens({ modes: { compact: { $type: "dimension", $value: "4px" } } })
        .violations,
    ).toEqual([]);
  });

  it("rejects design-source structure smuggled in as a $-prefixed member", () => {
    const result = validateCanonicalTokens({
      color: { brand: { $type: "color", $value: "#087990", $collection: "Primitives" } },
    });
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "source-field-outside-extensions",
        path: "color.brand.$collection",
      }),
    );
  });

  it("accepts the same fields inside the $extensions payload", () => {
    expect(
      validateCanonicalTokens({
        color: {
          brand: {
            $type: "color",
            $value: "#087990",
            $extensions: {
              [DTCG_EXTENSION_NS]: {
                collection: "Primitives",
                defaultMode: "Light",
                modes: { Light: { value: "#087990" } },
                figma: { key: "b1c9f0a3", resolvedType: "COLOR" },
              },
            },
          },
        },
      }).violations,
    ).toEqual([]);
  });

  it("reports data that is not a DTCG document at all", () => {
    expect(validateCanonicalTokens("nope").violations).toEqual([
      { code: "invalid-dtcg", path: "", message: expect.any(String) },
    ]);
  });

  it("reports a name carrying a character DTCG reserves", () => {
    const result = validateCanonicalTokens({ spacing: { "0.5": { $value: "2px" } } });
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "reserved-character-in-name", path: "spacing.0.5" }),
    );
  });

  it("reports an alias that points at no token", () => {
    const result = validateCanonicalTokens({
      semantic: { action: { $type: "color", $value: "{color.missing}" } },
    });
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "dangling-alias", path: "semantic.action" }),
    );
  });

  it("reports a $value that does not mirror the default mode", () => {
    const result = validateCanonicalTokens({
      color: {
        brand: {
          $type: "color",
          $value: "#087990",
          $extensions: {
            [DTCG_EXTENSION_NS]: {
              defaultMode: "Light",
              modes: { Light: { value: "#111111" }, Dark: { value: "#eeeeee" } },
            },
          },
        },
      },
    });
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "value-mode-mismatch", path: "color.brand" }),
    );
  });

  it("rejects a token that also carries children — DTCG's one structural rule", () => {
    // The nested token is INVISIBLE to every reader here (they stop at the `$value`), so a
    // validator that green-lights this cannot evidence that the artifact is valid DTCG.
    const result = validateCanonicalTokens({
      color: { brand: { $type: "color", $value: "#000000", nested: { $value: "#111111" } } },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "token-has-children", path: "color.brand.nested" }),
    );
  });

  it("does not mistake the document root's own children for a token's", () => {
    // The root has children and may carry `$extensions`; only a NAMED node can be a token.
    expect(
      validateCanonicalTokens(valid).violations.filter((v) => v.code === "token-has-children"),
    ).toEqual([]);
  });
});

describe("type mapping helpers", () => {
  it("uses the source's scalar type first, and the name only where the unit differs", () => {
    expect(dtcgTypeForVariable({ name: "brand/primary", resolvedValue: "", resolvedType: "COLOR" })).toBe(
      "color",
    );
    expect(dtcgTypeForVariable({ name: "motion/duration/fast", resolvedValue: "", resolvedType: "FLOAT" })).toBe(
      "duration",
    );
    expect(dtcgTypeForVariable({ name: "font-weight/bold", resolvedValue: "", resolvedType: "FLOAT" })).toBe(
      "fontWeight",
    );
    expect(dtcgTypeForVariable({ name: "space/4", resolvedValue: "", resolvedType: "FLOAT" })).toBe(
      "dimension",
    );
  });

  it("falls back to VortSpec's coarse token type when the source gave none", () => {
    expect(dtcgTypeForVariable({ name: "elevation/1", resolvedValue: "", type: "shadow" })).toBe("shadow");
    expect(dtcgTypeForVariable({ name: "misc/thing", resolvedValue: "", type: "other" })).toBeUndefined();
  });

  it("turns a DTCG alias back into the design source's slash path", () => {
    expect(dtcgAliasToSourceName("{primitive.color.primary}")).toBe("primitive/color/primary");
    expect(dtcgAliasToSourceName("#087990")).toBeUndefined();
  });
});
