import { describe, expect, it } from "vitest";
import { findOrphans, findDuplicates, analyzeSanitation } from "./token-sanitation";
import type { InspectorToken, InspectorTokensResult } from "@vortspec/core/inspector";

const tok = (name: string, resolvedValue: string, figmaPath?: string): InspectorToken => ({
  name,
  type: "color",
  rawValue: resolvedValue,
  resolvedValue,
  source: figmaPath ? "figma-variable" : "generated-code",
  uses: 0,
  figmaPath,
});

const result = (tokens: InspectorToken[], usage: InspectorTokensResult["usage"] = {}, figmaSynced = true): InspectorTokensResult => ({
  tokenFile: "tokens.css",
  tokens,
  usage,
  figmaOnly: [],
  figmaSynced,
  collections: [],
  activeCollection: null,
  activeMode: null,
  modeMap: {},
});

describe("findOrphans", () => {
  it("flags code-only tokens with where they are used", () => {
    const r = result(
      [tok("color-brand-primary", "#087990", "color/brand/primary"), tok("custom-accent", "#FF00AA")],
      { "custom-accent": [{ component: "Accordion" }, { component: "Nav", property: "background" }] },
    );
    const orphans = findOrphans(r);
    expect(orphans.map((o) => o.name)).toEqual(["custom-accent"]);
    expect(orphans[0].uses.map((u) => u.component)).toEqual(["Accordion", "Nav"]);
  });

  it("returns nothing when Figma isn't synced (every token is trivially code-only)", () => {
    expect(findOrphans(result([tok("x", "#000")], {}, false))).toEqual([]);
  });
});

describe("findDuplicates", () => {
  it("flags a semantic that duplicates a primitive value (flattened alias)", () => {
    const groups = findDuplicates(
      result([tok("color-excellus-blue-500", "#007AC3"), tok("color-surface-surface-control", "#007AC3")]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ value: "#007ac3", kind: "semantic-primitive", canonical: "color-excellus-blue-500" });
    // Only the semantic collapses — never a sibling primitive.
    expect(groups[0].tokens).toEqual(["color-surface-surface-control"]);
  });

  it("never suggests collapsing one brand primitive onto another", () => {
    // 3 brand primitives share a value AND a semantic does too → only the semantic collapses.
    const groups = findDuplicates(
      result([
        tok("color-excellus-blue-500", "#007AC3"),
        tok("color-univera-blue-500", "#007AC3"),
        tok("color-cdphp-blue-500", "#007AC3"),
        tok("color-surface-control", "#007AC3"),
      ]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].tokens).toEqual(["color-surface-control"]); // no brand primitive here
    expect(groups[0].canonical).toBe("color-excellus-blue-500");
  });

  it("does NOT flag cross-brand primitives that share a value", () => {
    const groups = findDuplicates(
      result([
        tok("color-excellus-grey-50", "#FFFFFF"),
        tok("color-univera-grey-50", "#FFFFFF"),
        tok("color-cdphp-grey-50", "#FFFFFF"),
      ]),
    );
    expect(groups).toEqual([]);
  });

  it("does not flag a token that is already an alias (var()) as a duplicate", () => {
    const aliased: InspectorToken = {
      ...tok("color-surface-control", "#007AC3"),
      rawValue: "var(--color-excellus-blue-500)",
    };
    const groups = findDuplicates(result([tok("color-excellus-blue-500", "#007AC3"), aliased]));
    expect(groups).toEqual([]); // the semantic is properly aliased — nothing to collapse
  });

  it("does NOT flag two distinct semantic roles sharing a value (not a duplicate)", () => {
    // Two legitimate roles that happen to share a value are not collapsible.
    const groups = findDuplicates(
      result([tok("color-surface-default", "#221F1F"), tok("color-text-body", "#221F1F")]),
    );
    expect(groups).toEqual([]);
  });
});

describe("analyzeSanitation", () => {
  it("bundles orphans + duplicates", () => {
    const s = analyzeSanitation(
      result([tok("color-excellus-blue-500", "#007AC3"), tok("color-surface-control", "#007AC3"), tok("orphan-x", "#ABCDEF")]),
    );
    expect(s.orphans.map((o) => o.name)).toContain("orphan-x");
    expect(s.duplicates).toHaveLength(1);
  });
});
