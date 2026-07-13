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
  });
});

describe("parsePushEval", () => {
  it("parses a success summary behind a CLI banner", () => {
    const raw = 'figma-cli v1\nconnected\n{ "error": null, "created": 2, "updated": 3, "createdCollection": false }\n';
    expect(parsePushEval(raw)).toEqual({ error: null, created: 2, updated: 3, createdCollection: false });
  });
  it("reports when the VortSpec collection was auto-created", () => {
    const raw = '{"error":null,"created":5,"updated":0,"createdCollection":true}';
    expect(parsePushEval(raw)).toMatchObject({ error: null, created: 5, createdCollection: true });
  });
  it("returns null when there is no JSON object", () => {
    expect(parsePushEval("no json here")).toBeNull();
  });
});
