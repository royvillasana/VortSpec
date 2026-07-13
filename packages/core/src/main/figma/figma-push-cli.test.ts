import { describe, expect, it } from "vitest";
import { buildPushScript, parsePushEval } from "./figma-cli";
import type { PushPlan } from "@vortspec/core/inspector";

const plan: PushPlan = {
  collection: "VortSpec",
  entries: [
    { variable: "color-primary", op: "update", figmaType: "COLOR", value: "#7C6FF0", tokenName: "color-primary", tokenType: "color" },
    { variable: "button-bg", op: "create", figmaType: "COLOR", aliasTarget: "color-primary", tokenName: "button-bg", tokenType: "color" },
  ],
};

describe("buildPushScript", () => {
  it("embeds the plan, targets VortSpec's collection, and auto-creates it when absent", () => {
    const script = buildPushScript(plan);
    expect(script).toContain('"collection":"VortSpec"');
    expect(script).toContain("getLocalVariableCollectionsAsync");
    expect(script).toContain("createVariableAlias");
    // Auto-create the collection instead of erroring when it's missing.
    expect(script).toContain("createVariableCollection");
    expect(script).not.toContain("collection-missing");
    // Coerce to the variable's actual resolved type + per-entry try/catch (no fatal mismatch).
    expect(script).toContain("v.resolvedType");
    expect(script).toContain("errors.push");
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
