import { describe, expect, it } from "vitest";
import { buildPushScript, parsePushEval } from "./figma-cli";
import type { PushPlan } from "@vortspec/core/inspector";

const plan: PushPlan = {
  collection: "Tokens",
  entries: [
    { variable: "color-primary", op: "update", figmaType: "COLOR", value: "#7C6FF0", tokenName: "color-primary", tokenType: "color" },
    { variable: "button-bg", op: "create", figmaType: "COLOR", aliasTarget: "color-primary", tokenName: "button-bg", tokenType: "color" },
  ],
};

describe("buildPushScript", () => {
  it("embeds the plan and targets the collection by name", () => {
    const script = buildPushScript(plan);
    expect(script).toContain('"collection":"Tokens"');
    expect(script).toContain("getLocalVariableCollectionsAsync");
    expect(script).toContain("createVariableAlias");
    expect(script).toContain("collection-missing");
  });
});

describe("parsePushEval", () => {
  it("parses a success summary behind a CLI banner", () => {
    const raw = "figma-cli v1\nconnected\n{ \"error\": null, \"created\": 2, \"updated\": 3 }\n";
    expect(parsePushEval(raw)).toEqual({ error: null, created: 2, updated: 3, collection: undefined });
  });
  it("parses a collection-missing error", () => {
    const raw = '{"error":"collection-missing","collection":"Tokens"}';
    expect(parsePushEval(raw)).toMatchObject({ error: "collection-missing", collection: "Tokens" });
  });
  it("returns null when there is no JSON object", () => {
    expect(parsePushEval("no json here")).toBeNull();
  });
});
