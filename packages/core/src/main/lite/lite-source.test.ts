import { describe, expect, it } from "vitest";
import { mapTokenGroup, mapTier, buildDeriveInput } from "./lite-source";

describe("mapTokenGroup", () => {
  it("maps inspector token types (singular) to manifest groups (plural)", () => {
    expect(mapTokenGroup("color")).toBe("colors");
    expect(mapTokenGroup("shadow")).toBe("shadows");
    expect(mapTokenGroup("spacing")).toBe("spacing");
    expect(mapTokenGroup("typography")).toBe("typography");
    expect(mapTokenGroup("radius")).toBe("radius");
  });
  it("skips a non-visual type", () => {
    expect(mapTokenGroup("other")).toBeNull();
  });
});

describe("mapTier", () => {
  it("normalizes level to a tier, defaulting unknown to atom", () => {
    expect(mapTier("molecule")).toBe("molecule");
    expect(mapTier("organism")).toBe("organism");
    expect(mapTier("template")).toBe("template");
    expect(mapTier(undefined)).toBe("atom");
    expect(mapTier("weird")).toBe("atom");
  });
});

describe("buildDeriveInput — inspector shapes → derive input", () => {
  const tokens = [
    { name: "color-primary", type: "color", resolvedValue: "#c53434" },
    { name: "space-2", type: "spacing", resolvedValue: "0.5rem" },
    { name: "misc-thing", type: "other", resolvedValue: "whatever" }, // dropped
    { name: "empty", type: "color", resolvedValue: "" }, // dropped (no value)
  ];
  const components = [
    {
      name: "Button",
      level: "atom",
      props: [
        { key: "variant", kind: "enum" as const, options: ["primary", "secondary"], defaultValue: "primary" },
        { key: "disabled", kind: "boolean" as const, options: [] },
      ],
    },
    { name: "Header", level: "organism", props: [] },
  ];

  it("keeps only visual tokens with a value, dual-keyed by name + resolved value", () => {
    const input = buildDeriveInput("Acme", tokens, components);
    expect(input.tokens).toEqual([
      { name: "color-primary", value: "#c53434", group: "colors" },
      { name: "space-2", value: "0.5rem", group: "spacing" },
    ]);
  });

  it("maps components with tier, variants (from the `variant` enum prop), and props", () => {
    const input = buildDeriveInput("Acme", tokens, components);
    expect(input.components[0]).toMatchObject({ name: "Button", tier: "atom", variants: ["primary", "secondary"] });
    expect(input.components[0].props).toEqual([
      { name: "variant", type: "enum", default: "primary" },
      { name: "disabled", type: "boolean", default: undefined },
    ]);
    expect(input.components[1]).toMatchObject({ name: "Header", tier: "organism", variants: [] });
  });

  it("carries the project name through", () => {
    expect(buildDeriveInput("Acme", [], []).projectName).toBe("Acme");
  });
});
