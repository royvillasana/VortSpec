import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_TOKENS_PATH,
  DTCG_EXTENSION_NS,
  designTokenDocumentSchema,
  dtcgSegmentFromSourceName,
  figmaNameToDtcgAlias,
  figmaNameToDtcgPath,
  isKnownDtcgType,
  isTokenLeaf,
  parseDesignTokenDocument,
  parseDtcgAlias,
  readDocumentExtension,
  readTokenExtension,
  toDtcgAlias,
  tokenValueForMode,
  type DesignTokenGroup,
  type DesignTokenLeaf,
} from "./design-tokens";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "../../../..");
const CONTRACT_RELATIVE = "extensions-contract.md";

/**
 * The worked example, as a fixture THIS PACKAGE owns.
 *
 * It used to be read straight out of `openspec/changes/agentic-design-system/extensions-contract.md`
 * at module scope, so that the doc was the fixture and the two could not drift. That intent is kept
 * below (`the contract document's worked example`), but the path binding is not: archiving the
 * change moves the doc under `openspec/changes/archive/<date>-agentic-design-system/`, and a
 * module-scope read of the old path would throw during collection and take down every test in this
 * file at the exact moment the change completes. The schema cases therefore run off the owned copy,
 * and the drift check runs only where the doc is still resolvable.
 */
const WORKED_EXAMPLE = JSON.parse(
  readFileSync(join(HERE, "__fixtures__/canonical-tokens.example.json"), "utf8"),
) as Record<string, unknown>;

/** The contract doc, live or archived, or null once it exists in neither place. */
function findContractDoc(): string | null {
  const live = join(REPO_ROOT, "openspec/changes/agentic-design-system", CONTRACT_RELATIVE);
  if (existsSync(live)) return live;
  const archive = join(REPO_ROOT, "openspec/changes/archive");
  if (!existsSync(archive)) return null;
  // Archived as `<date>-<change>`, so match on the change name rather than a guessed date.
  const entry = readdirSync(archive)
    .filter((name) => name.endsWith("-agentic-design-system"))
    .sort()
    .pop();
  if (!entry) return null;
  const archived = join(archive, entry, CONTRACT_RELATIVE);
  return existsSync(archived) ? archived : null;
}

/** The `## 7. Worked example` JSON fence out of the contract doc. */
function workedExampleFromContract(doc: string): Record<string, unknown> {
  const md = readFileSync(doc, "utf8");
  const section = md.split(/^## 7\. Worked example$/m)[1];
  if (!section) throw new Error(`no "## 7. Worked example" section in ${doc}`);
  const fence = /```json\n([\s\S]*?)```/.exec(section);
  if (!fence) throw new Error(`no json fence under the worked example in ${doc}`);
  return JSON.parse(fence[1]) as Record<string, unknown>;
}

/** Narrow a path through the document; the tests know these nodes exist. */
function at(doc: Record<string, unknown>, path: string[]): DesignTokenLeaf {
  let node: unknown = doc;
  for (const seg of path) node = (node as Record<string, unknown>)[seg];
  return node as DesignTokenLeaf;
}

describe("designTokenDocumentSchema", () => {
  it("accepts the contract's worked example, unchanged", () => {
    // Edit the example into something the schema rejects, or into something the parse would alter,
    // and this fails.
    const doc = parseDesignTokenDocument(WORKED_EXAMPLE);
    expect(doc).not.toBeNull();
    expect(doc).toEqual(WORKED_EXAMPLE);
  });

  it("keeps the fixture identical to the contract document's §7 example", () => {
    // The fixture is the schema's input; the doc is what a reader trusts. They must say the same
    // thing. Skipped rather than failed once the doc is neither live nor archived — a suite that
    // dies because a spec was filed away is a worse failure than an unchecked doc.
    const doc = findContractDoc();
    if (!doc) return;
    expect(workedExampleFromContract(doc)).toEqual(WORKED_EXAMPLE);
  });

  it("preserves a nested group tree rather than flattening it", () => {
    const doc = parseDesignTokenDocument(WORKED_EXAMPLE);
    expect(doc).not.toBeNull();
    // `primitive/color/primary` is three levels of nesting, not one flat key.
    expect(Object.keys(doc!)).toEqual(expect.arrayContaining(["primitive", "semantic"]));
    expect(doc!["primitive/color/primary"]).toBeUndefined();
    const group = doc!.primitive as DesignTokenGroup;
    expect(isTokenLeaf(group)).toBe(false);
    expect(at(doc!, ["primitive", "color", "primary"]).$value).toBe("#7C6FF0");
  });

  it("keeps a token's modes and durable key under the namespaced $extensions", () => {
    const doc = parseDesignTokenDocument(WORKED_EXAMPLE)!;
    const leaf = at(doc, ["primitive", "color", "primary"]);
    const ext = readTokenExtension(leaf)!;
    expect(ext.collection).toBe("Primitives");
    expect(ext.defaultMode).toBe("Light");
    expect(ext.modes).toEqual({ Light: { value: "#7C6FF0" }, Dark: { value: "#9C93F5" } });
    expect(ext.figma).toEqual({
      key: "b1c9f0a3e4d5678901234567890abcdef1234567",
      resolvedType: "COLOR",
    });
    // $value mirrors the default mode's value.
    expect(leaf.$value).toBe(ext.modes!.Light.value);
  });

  it("carries a DTCG alias reference in $value and per mode", () => {
    const doc = parseDesignTokenDocument(WORKED_EXAMPLE)!;
    const leaf = at(doc, ["semantic", "color", "action"]);
    expect(parseDtcgAlias(leaf.$value)).toEqual(["primitive", "color", "primary"]);
    const modes = readTokenExtension(leaf)!.modes!;
    expect(modes.Dark.alias).toBe("{primitive.color.primary}");
    // The concrete value rides along so a consumer that can't follow references still emits.
    expect(modes.Dark.value).toBe("#9C93F5");
  });

  it("exposes the collection registry at the document level", () => {
    const doc = parseDesignTokenDocument(WORKED_EXAMPLE)!;
    const ext = readDocumentExtension(doc)!;
    expect(ext.source).toBe("figma");
    expect(ext.collections.map((c) => c.name)).toEqual(["Primitives", "Semantic"]);
    // Mode ORDER survives — the registry is a list, not a map.
    expect(ext.collections[0].modes).toEqual(["Light", "Dark"]);
  });

  it("passes a foreign vendor's $extensions through untouched", () => {
    const doc = parseDesignTokenDocument({
      color: {
        brand: {
          $type: "color",
          $value: "#000",
          $extensions: { "com.example.other": { anything: [1, 2] } },
        },
      },
    })!;
    const leaf = at(doc, ["color", "brand"]);
    expect(leaf.$extensions!["com.example.other"]).toEqual({ anything: [1, 2] });
    expect(readTokenExtension(leaf)).toBeUndefined();
  });

  it("accepts a composite $value and a token with no modes at all", () => {
    const doc = parseDesignTokenDocument({
      motion: { fast: { $type: "duration", $value: "150ms" } },
      elevation: {
        card: { $type: "shadow", $value: { offsetX: "0", offsetY: "1px", blur: "2px", color: "#0001" } },
      },
    })!;
    expect(at(doc, ["motion", "fast"]).$value).toBe("150ms");
    expect(at(doc, ["elevation", "card"]).$value).toMatchObject({ blur: "2px" });
  });

  it("rejects a group whose child is a bare value rather than a token", () => {
    expect(designTokenDocumentSchema.safeParse({ color: { primary: "#fff" } }).success).toBe(false);
  });

  it("rejects a node that carries both a $value and children", () => {
    // DTCG identifies a token by its `$value` and forbids it from being a group too. A union of
    // leaf-or-group used to re-admit this through the group branch (where `$value` is just another
    // `$`-member), and `nested` then became invisible to every reader.
    expect(
      designTokenDocumentSchema.safeParse({
        color: { brand: { $value: "#000", nested: { $value: "#111" } } },
      }).success,
    ).toBe(false);
  });

  it("preserves an unrecognised $type verbatim instead of discarding the document", () => {
    // `fontSize`/`lineHeight`/`boxShadow` are real DTCG export types this repo's own `mapDtcgType`
    // already handles; a closed enum would fail the whole parse and lose the colour token too.
    const doc = parseDesignTokenDocument({
      color: { primary: { $type: "color", $value: "#fff" } },
      font: { size: { md: { $type: "fontSize", $value: "16px" } } },
      text: { body: { $type: "lineHeight", $value: 1.5 } },
      elevation: { card: { $type: "boxShadow", $value: "0 1px 2px #0001" } },
    });
    expect(doc).not.toBeNull();
    expect(at(doc!, ["color", "primary"]).$value).toBe("#fff");
    expect(at(doc!, ["font", "size", "md"]).$type).toBe("fontSize");
    expect(at(doc!, ["text", "body"]).$type).toBe("lineHeight");
    expect(at(doc!, ["elevation", "card"]).$type).toBe("boxShadow");
  });

  it("names which $types it can switch on exhaustively", () => {
    expect(isKnownDtcgType("color")).toBe(true);
    expect(isKnownDtcgType("fontSize")).toBe(false);
    expect(isKnownDtcgType(undefined)).toBe(false);
  });

  it("returns null instead of throwing on a malformed artifact", () => {
    expect(parseDesignTokenDocument({ color: { primary: 42 } })).toBeNull();
    expect(parseDesignTokenDocument("not a document")).toBeNull();
  });
});

/**
 * The extension block is the whole point of this unit, so each case is an accept/reject PAIR: a
 * payload the contract describes must parse, and the corrupted twin must not. Asserting only that a
 * well-formed payload reads back would pass just as happily against `z.any()`.
 */
describe("the $extensions payload is validated at the parse boundary", () => {
  /** A one-token document whose token carries the given VortSpec payload. */
  const withTokenPayload = (payload: unknown) => ({
    color: {
      primary: { $type: "color", $value: "#fff", $extensions: { [DTCG_EXTENSION_NS]: payload } },
    },
  });
  /** The same document with the payload at the root instead. */
  const withDocumentPayload = (payload: unknown) => ({
    $extensions: { [DTCG_EXTENSION_NS]: payload },
    color: { primary: { $type: "color", $value: "#fff" } },
  });
  const accepts = (doc: unknown) => designTokenDocumentSchema.safeParse(doc).success;

  it("requires modes to be a map of mode names, not a scalar", () => {
    expect(accepts(withTokenPayload({ modes: { Light: { value: "#fff" } } }))).toBe(true);
    expect(accepts(withTokenPayload({ modes: "Light" }))).toBe(false);
  });

  it("requires each mode entry to be {value?, alias?}, not a bare value", () => {
    expect(accepts(withTokenPayload({ modes: { Light: { alias: "{a.b}" } } }))).toBe(true);
    // The shorthand a hand-editor would reach for. Accepting it would make `modes[m].alias`
    // undefined for a reference, and every emitter reads that field.
    expect(accepts(withTokenPayload({ modes: { Light: "#fff" } }))).toBe(false);
  });

  it("requires collection to be a name", () => {
    expect(accepts(withTokenPayload({ collection: "Primitives" }))).toBe(true);
    expect(accepts(withTokenPayload({ collection: 3 }))).toBe(false);
  });

  it("requires figma.resolvedType to be a type the design source actually has", () => {
    expect(accepts(withTokenPayload({ figma: { key: "abc", resolvedType: "COLOR" } }))).toBe(true);
    // `GRADIENT` is a Figma paint type, not a variable type — it can never appear here.
    expect(accepts(withTokenPayload({ figma: { resolvedType: "GRADIENT" } }))).toBe(false);
  });

  it("requires the document-level collection registry to be an ordered list", () => {
    expect(accepts(withDocumentPayload({ collections: [{ name: "P", modes: ["Light"] }] }))).toBe(
      true,
    );
    expect(accepts(withDocumentPayload({ collections: "Primitives" }))).toBe(false);
  });

  it("requires every registered collection to be named", () => {
    // The name is the join key from a token's `collection` back to its modes; without it the
    // registry cannot answer "what modes does this token have".
    expect(accepts(withDocumentPayload({ collections: [{ name: "P" }] }))).toBe(true);
    expect(accepts(withDocumentPayload({ collections: [{ modes: ["Light"] }] }))).toBe(false);
  });
});

/**
 * DTCG keeps adding `$`-prefixed members, and the artifact must survive the ones this module does
 * not model — failing the parse would discard the whole file, stripping them would break task 7.2's
 * promise to persist the source export unmodified.
 */
describe("unmodelled $-prefixed members", () => {
  it("keeps a root $schema through the round-trip", () => {
    const input = {
      $schema: "https://tr.designtokens.org/format/tokens.schema.json",
      color: { primary: { $type: "color", $value: "#fff" } },
    };
    const doc = parseDesignTokenDocument(input);
    expect(doc).not.toBeNull();
    expect(doc).toEqual(input);
  });

  it("parses a group carrying $deprecated and keeps its child token", () => {
    const input = { color: { $deprecated: true, primary: { $type: "color", $value: "#fff" } } };
    const doc = parseDesignTokenDocument(input);
    expect(doc).not.toBeNull();
    // The token must not be collateral damage of the unfamiliar sibling key.
    expect(at(doc!, ["color", "primary"]).$value).toBe("#fff");
    expect(doc).toEqual(input);
  });

  it("keeps $deprecated on a token rather than silently dropping it", () => {
    const input = {
      color: { primary: { $type: "color", $value: "#fff", $deprecated: "Use color.brand." } },
    };
    const doc = parseDesignTokenDocument(input);
    expect(at(doc!, ["color", "primary"]).$deprecated).toBe("Use color.brand.");
    expect(doc).toEqual(input);
  });

  it("still rejects a NON-$ member that is not a token", () => {
    // The passthrough is scoped to `$` keys; ordinary keys are children and must parse as nodes.
    expect(parseDesignTokenDocument({ color: { primary: { value: "#fff" } } })).toBeNull();
  });
});

/**
 * A real design system is 500–3000 variables and `primitive/color/brand/500` is already four levels
 * deep, so the parse cost has to be linear in the node count. It was not: validating in a
 * `superRefine` and rebuilding in a chained `transform` ran the recursive child schema twice per
 * level, doubling the work with every level of nesting (measured 2.4s at depth 4, 9.7s at depth 6).
 * Reintroduce that shape and this test blows straight through its budget.
 */
describe("parse cost is linear in the tree, not exponential in its depth", () => {
  /** A document of `count` tokens sitting `depth` groups deep, with modes and $extensions. */
  function deepDocument(count: number, depth: number): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (let i = 0; i < count; i += 1) {
      let cursor = root;
      for (let d = 0; d < depth; d += 1) {
        const key = `g${d}-${i % (d + 2)}`;
        cursor = (cursor[key] ??= {}) as Record<string, unknown>;
      }
      cursor[`token-${i}`] = {
        $type: "color",
        $value: "#7C6FF0",
        $extensions: {
          [DTCG_EXTENSION_NS]: {
            collection: "Core",
            defaultMode: "Light",
            modes: { Light: { value: "#7C6FF0" }, Dark: { value: "#9C93F5" } },
            figma: { key: `k${i}`, resolvedType: "COLOR" },
          },
        },
      };
    }
    return root;
  }

  it("parses 2000 tokens at depth 5 well inside a second", () => {
    const doc = deepDocument(2000, 5);
    const started = Date.now();
    const parsed = parseDesignTokenDocument(doc);
    const elapsed = Date.now() - started;
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(doc);
    expect(elapsed).toBeLessThan(1000);
  });

  it("costs roughly the same per node at depth 8 as at depth 4", () => {
    // The budget above alone would pass on a fast enough machine even with the old shape; the RATIO
    // is what names the exponential. Doubling per level would make this 16x, not ~1x.
    const time = (depth: number): number => {
      const doc = deepDocument(500, depth);
      const started = Date.now();
      parseDesignTokenDocument(doc);
      return Math.max(Date.now() - started, 1);
    };
    expect(time(8) / time(4)).toBeLessThan(6);
  });
});

describe("alias helpers", () => {
  it("round-trips a path through the DTCG alias syntax", () => {
    expect(toDtcgAlias(["primitive", "color", "primary"])).toBe("{primitive.color.primary}");
    expect(parseDtcgAlias(toDtcgAlias(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("translates a design source's slash path into a DTCG alias", () => {
    expect(figmaNameToDtcgAlias("primitive/color/primary")).toBe("{primitive.color.primary}");
    // Leading/duplicate separators must not produce empty segments.
    expect(figmaNameToDtcgAlias("/color//primary")).toBe("{color.primary}");
  });

  it("sanitises the characters DTCG forbids in a name", () => {
    // `.` is DTCG's path separator; `{`/`}` delimit an alias. None can survive in a name.
    expect(dtcgSegmentFromSourceName("0.5")).toBe("0-5");
    expect(dtcgSegmentFromSourceName("gray.100")).toBe("gray-100");
    expect(dtcgSegmentFromSourceName("{weird}")).toBe("-weird-");
    expect(dtcgSegmentFromSourceName("plain")).toBe("plain");
    expect(figmaNameToDtcgPath("spacing/0.5")).toEqual(["spacing", "0-5"]);
  });

  it("sanitises a leading $, which DTCG reserves for format members", () => {
    // Left alone, `$extensions/foo` would be written as a node every DTCG reader treats as metadata
    // and ingest would then overwrite with the real `$extensions` block — the token would vanish.
    expect(dtcgSegmentFromSourceName("$extensions")).toBe("-extensions");
    expect(dtcgSegmentFromSourceName("$brand")).toBe("-brand");
    expect(figmaNameToDtcgPath("$extensions/foo")).toEqual(["-extensions", "foo"]);
    // Only the PREFIX is reserved; a `$` elsewhere is an ordinary character.
    expect(dtcgSegmentFromSourceName("usd$")).toBe("usd$");
  });

  it("keeps a dotted source name addressable — the alias resolves to the same token", () => {
    // Unsanitised, `spacing/0.5` would become `{spacing.0.5}` → ["spacing","0","5"], a dangling
    // three-segment path. The alias must land back on the token the nesting actually spells.
    const alias = figmaNameToDtcgAlias("spacing/0.5");
    expect(alias).toBe("{spacing.0-5}");
    const path = figmaNameToDtcgPath("spacing/0.5");
    expect(parseDtcgAlias(alias)).toEqual(path);

    // And that path resolves in a document whose nesting was built by the same translation.
    const doc = parseDesignTokenDocument({
      spacing: {
        [path[1]]: {
          $type: "dimension",
          $value: "2px",
          $extensions: { [DTCG_EXTENSION_NS]: { figma: { sourceName: "spacing/0.5" } } },
        },
      },
    })!;
    const leaf = at(doc, parseDtcgAlias(alias)!);
    expect(isTokenLeaf(leaf)).toBe(true);
    expect(leaf.$value).toBe("2px");
    // The original name survives so the join back to the design source still works.
    expect(readTokenExtension(leaf)!.figma!.sourceName).toBe("spacing/0.5");
  });

  it("treats an interpolated reference as a literal, not an alias", () => {
    // DTCG aliases replace a $value; they do not interpolate into one.
    expect(parseDtcgAlias("1px solid {color.border}")).toBeNull();
    expect(parseDtcgAlias("{}")).toBeNull();
    expect(parseDtcgAlias(42)).toBeNull();
    expect(parseDtcgAlias(" {a.b} ")).toEqual(["a", "b"]);
  });
});

describe("tokenValueForMode", () => {
  const doc = parseDesignTokenDocument(WORKED_EXAMPLE)!;

  it("reads the requested mode's value", () => {
    const leaf = at(doc, ["primitive", "color", "primary"]);
    expect(tokenValueForMode(leaf, "Light")).toBe("#7C6FF0");
    expect(tokenValueForMode(leaf, "Dark")).toBe("#9C93F5");
  });

  it("returns the alias, not the resolved value, when the mode is a reference", () => {
    const leaf = at(doc, ["semantic", "color", "action"]);
    expect(tokenValueForMode(leaf, "Dark")).toBe("{primitive.color.primary}");
  });

  it("falls back to $value for a single-mode token so a flat source is not reported broken", () => {
    const leaf: DesignTokenLeaf = { $type: "color", $value: "#123456" };
    expect(tokenValueForMode(leaf, "Dark")).toBe("#123456");
  });

  it("treats an empty modes map as absent, not as 'no values' (absent ≠ empty)", () => {
    // `{}` is a bug in whatever wrote it; reading it literally would report a token that plainly
    // has a $value as having none.
    const leaf: DesignTokenLeaf = {
      $type: "color",
      $value: "#123456",
      $extensions: { [DTCG_EXTENSION_NS]: { modes: {} } },
    };
    expect(tokenValueForMode(leaf, "Dark")).toBe("#123456");
    expect(tokenValueForMode(leaf, "Light")).toBe("#123456");
  });

  it("returns undefined for a mode a multi-mode token does not define", () => {
    const leaf = at(doc, ["primitive", "color", "primary"]);
    expect(tokenValueForMode(leaf, "HighContrast")).toBeUndefined();
  });
});

describe("module constants", () => {
  it("names the canonical artifact and the extension namespace once", () => {
    expect(CANONICAL_TOKENS_PATH).toBe(".vortspec/tokens.json");
    // Reverse-domain, per DTCG, from this project's own domain.
    expect(DTCG_EXTENSION_NS).toBe("com.vortspec.tokens");
  });
});
