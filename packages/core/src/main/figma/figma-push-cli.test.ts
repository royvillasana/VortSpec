import { describe, expect, it } from "vitest";
import { buildPushScript, parsePushEval } from "./figma-cli";
import type { PushPlan } from "@vortspec/core/inspector";

const plan: PushPlan = {
  collection: "VortSpec",
  entries: [
    { variable: "primitive/red/500", op: "create", figmaType: "COLOR", value: "#DC3545", tokenName: "primitive-red-500", tokenType: "color", layer: "primitive" },
    { variable: "destructive", op: "create", figmaType: "COLOR", aliasTarget: "primitive-red-500", tokenName: "destructive", tokenType: "color", layer: "semantic" },
  ],
};

describe("buildPushScript", () => {
  it("embeds the plan and coerces to the variable's actual resolved type", () => {
    const script = buildPushScript(plan);
    expect(script).toContain("getLocalVariableCollectionsAsync");
    expect(script).toContain("createVariableAlias");
    expect(script).not.toContain("collection-missing");
    expect(script).toContain("v.resolvedType");
    expect(script).toContain("errors.push");
  });

  it("routes adaptively by layer and resolves aliases across all collections", () => {
    const script = buildPushScript(plan);
    // Layer inference + sibling-based collection selection + standard fallback.
    expect(script).toContain("layerOf");
    expect(script).toContain("pickCollection");
    expect(script).toContain("fallbackName");
    expect(script).toContain("createVariableCollection");
    // A GLOBAL index (not one scoped to a single collection) so a semantic can
    // alias a primitive in another collection.
    expect(script).toContain("globalByNorm");
    // The plan's layer travels into the embedded script.
    expect(script).toContain('"layer":"primitive"');
    expect(script).toContain('"layer":"semantic"');
  });
});

describe("parsePushEval", () => {
  it("parses a success summary behind a CLI banner", () => {
    const raw = 'figma-cli v1\nconnected\n{ "error": null, "created": 2, "updated": 3, "createdCollection": false }\n';
    expect(parsePushEval(raw)).toMatchObject({ error: null, created: 2, updated: 3, createdCollection: false, failed: 0 });
  });
  it("reports when the VortSpec collection was auto-created", () => {
    const raw = '{"error":null,"created":5,"updated":0,"createdCollection":true}';
    expect(parsePushEval(raw)).toMatchObject({ error: null, created: 5, createdCollection: true });
  });
  it("surfaces per-entry failures with the first offending variable", () => {
    const raw = '{"error":null,"created":30,"updated":1,"failed":1,"errors":[{"variable":"radius-full","error":"bad type"}]}';
    expect(parsePushEval(raw)).toMatchObject({ failed: 1, firstError: "radius-full: bad type" });
  });
  it("returns null when there is no JSON object", () => {
    expect(parsePushEval("no json here")).toBeNull();
  });
});
