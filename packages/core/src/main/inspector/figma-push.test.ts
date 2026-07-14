import { describe, expect, it } from "vitest";
import {
  computePushPlan,
  decomposeShadow,
  figmaTypeFor,
  pushLayerOf,
  VORTSPEC_COLLECTION,
} from "./figma-push";
import type { FigmaVariable, InspectorToken } from "@vortspec/core/inspector";

type TokenInput = Pick<InspectorToken, "name" | "rawValue" | "resolvedValue" | "type">;
const tok = (name: string, rawValue: string, type: InspectorToken["type"], resolved?: string): TokenInput => ({
  name,
  rawValue,
  resolvedValue: resolved ?? rawValue,
  type,
});
const fvar = (name: string, resolvedValue: string): FigmaVariable => ({ name, resolvedValue });

describe("figmaTypeFor", () => {
  it("maps colors to COLOR", () => {
    expect(figmaTypeFor("color", "color-primary", "#7C6FF0")).toBe("COLOR");
    expect(figmaTypeFor("other", "brand", "rgb(0,0,0)")).toBe("COLOR");
  });
  it("maps spacing/radius to FLOAT", () => {
    expect(figmaTypeFor("spacing", "space-2", "8px")).toBe("FLOAT");
    expect(figmaTypeFor("radius", "radius-md", "6px")).toBe("FLOAT");
  });
  it("maps typography by name/value", () => {
    expect(figmaTypeFor("typography", "font-family-sans", "Geist")).toBe("STRING");
    expect(figmaTypeFor("typography", "font-size-md", "16px")).toBe("FLOAT");
  });
  it("falls back to STRING for non-numeric other", () => {
    expect(figmaTypeFor("other", "ease", "cubic-bezier(0,0,1,1)")).toBe("STRING");
  });
});

describe("decomposeShadow", () => {
  it("splits a single box-shadow into scalar parts + color", () => {
    const parts = decomposeShadow("0 1px 2px 0 #00000033");
    expect(parts?.map((p) => p.suffix)).toEqual(["offset-x", "offset-y", "blur", "spread", "color"]);
    expect(parts?.at(-1)).toMatchObject({ suffix: "color", figmaType: "COLOR" });
  });
  it("works without an explicit spread", () => {
    const parts = decomposeShadow("0 2px 4px rgba(0,0,0,0.2)");
    expect(parts?.map((p) => p.suffix)).toEqual(["offset-x", "offset-y", "blur", "color"]);
  });
  it("returns null for multi-shadow values", () => {
    expect(decomposeShadow("0 1px 2px #000, 0 2px 4px #111")).toBeNull();
  });
});

describe("computePushPlan", () => {
  it("classifies create vs update vs in-sync", () => {
    const tokens = [
      tok("color-primary", "#7C6FF0", "color"), // update (drifted)
      tok("color-accent", "#22C55E", "color"), // create (not in Figma)
      tok("space-2", "8px", "spacing"), // in-sync → skip
    ];
    const figma = [fvar("color/primary", "#5b4fd0"), fvar("space/2", "8px")];
    const plan = computePushPlan(tokens, figma, { collection: "Tokens" });
    expect(plan.collection).toBe("Tokens");
    const byToken = Object.fromEntries(plan.entries.map((e) => [e.tokenName, e]));
    expect(byToken["color-primary"]).toMatchObject({ op: "update", currentFigmaValue: "#5b4fd0" });
    expect(byToken["color-accent"]).toMatchObject({ op: "create", figmaType: "COLOR" });
    expect(byToken["space-2"]).toBeUndefined();
  });

  it("emits an alias entry when a var(--x) reference exists in Figma", () => {
    const tokens = [tok("button-bg", "var(--color-primary)", "color", "#7C6FF0")];
    const figma = [fvar("color/primary", "#7C6FF0"), fvar("button/bg", "#000000")];
    const [entry] = computePushPlan(tokens, figma).entries;
    expect(entry).toMatchObject({ aliasTarget: "color-primary", op: "update" });
    expect(entry.value).toBeUndefined();
  });

  it("falls back to concrete value when the reference is not in Figma", () => {
    const tokens = [tok("button-bg", "var(--color-primary)", "color", "#7C6FF0")];
    const [entry] = computePushPlan(tokens, []).entries;
    expect(entry.aliasTarget).toBeUndefined();
    expect(entry).toMatchObject({ op: "create", value: "#7C6FF0" });
  });

  it("decomposes a composite shadow token into scalar create entries — never skipped", () => {
    const tokens = [tok("shadow-md", "0 1px 2px 0 #00000033", "shadow")];
    const plan = computePushPlan(tokens, []);
    expect(plan.entries.map((e) => e.variable)).toEqual([
      "shadow-md-offset-x",
      "shadow-md-offset-y",
      "shadow-md-blur",
      "shadow-md-spread",
      "shadow-md-color",
    ]);
    expect(plan.entries.every((e) => e.op === "create")).toBe(true);
  });

  it("covers every token type in the plan", () => {
    const tokens = [
      tok("color-x", "#111111", "color"),
      tok("space-x", "4px", "spacing"),
      tok("radius-x", "2px", "radius"),
      tok("font-size-x", "14px", "typography"),
      tok("shadow-x", "0 1px 1px #000000", "shadow"),
    ];
    const types = new Set(computePushPlan(tokens, []).entries.map((e) => e.tokenType));
    expect(types).toEqual(new Set(["color", "spacing", "radius", "typography", "shadow"]));
  });

  it("is a no-op round-trip: pushing already-synced tokens yields an empty plan", () => {
    const tokens = [tok("color-primary", "#7C6FF0", "color")];
    const figma = [fvar("color-primary", "#7c6ff0")]; // same value, different case
    expect(computePushPlan(tokens, figma).entries).toHaveLength(0);
  });

  it("defaults to VortSpec's own collection", () => {
    expect(computePushPlan([], []).collection).toBe(VORTSPEC_COLLECTION);
    expect(VORTSPEC_COLLECTION).toBe("VortSpec");
  });

  it("tags each entry with its architecture layer (for adaptive routing)", () => {
    const tokens = [
      tok("primitive-red-500", "#DC3545", "color"),
      tok("color-primary", "#7C6FF0", "color"),
      tok("component-button-bg", "#000000", "color"),
    ];
    const byToken = Object.fromEntries(computePushPlan(tokens, []).entries.map((e) => [e.tokenName, e.layer]));
    expect(byToken["primitive-red-500"]).toBe("primitive");
    expect(byToken["color-primary"]).toBe("semantic");
    expect(byToken["component-button-bg"]).toBe("component");
  });
});

describe("pushLayerOf", () => {
  it("classifies by name prefix across both separators", () => {
    expect(pushLayerOf("primitive/red/500")).toBe("primitive");
    expect(pushLayerOf("--primitive-red-500")).toBe("primitive");
    expect(pushLayerOf("component/button/bg")).toBe("component");
    expect(pushLayerOf("component-button-bg")).toBe("component");
    expect(pushLayerOf("primary")).toBe("semantic");
    expect(pushLayerOf("color/status/danger")).toBe("semantic");
  });

  it("names the pushed variable with its Figma group path (folders preserved)", () => {
    const tokens = [{ ...tok("color-primary", "#7C6FF0", "color"), figmaPath: "color/primary" }];
    const [entry] = computePushPlan(tokens, []).entries;
    expect(entry.variable).toBe("color/primary");
    expect(entry.op).toBe("create");
  });

  it("targets the given mode and compares against that mode's Figma value", () => {
    const tokens = [
      {
        ...tok("color-primary", "#2A2540", "color"),
        figmaPath: "color/primary",
        modes: {
          Light: { rawValue: "#7C6FF0", resolvedValue: "#7C6FF0", readOnly: false },
          Dark: { rawValue: "#2A2540", resolvedValue: "#2A2540", readOnly: false },
        },
      },
    ];
    const figma: FigmaVariable[] = [
      {
        name: "color/primary",
        resolvedValue: "#7C6FF0",
        valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#111111" } },
      },
    ];
    // Pushing the Dark mode: code #2A2540 drifts from Figma's Dark #111111 → an update.
    const plan = computePushPlan(tokens, figma, { mode: "Dark" });
    expect(plan.mode).toBe("Dark");
    const [entry] = plan.entries;
    expect(entry).toMatchObject({ op: "update", value: "#2A2540", currentFigmaValue: "#111111" });
    // The same token is in-sync for Light → no entry when pushing Light.
    expect(computePushPlan(tokens, figma, { mode: "Light" }).entries).toHaveLength(0);
  });
});
