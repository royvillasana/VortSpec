import { describe, expect, it } from "vitest";
import {
  EMPTY_THEME_OVERRIDES,
  parseThemeOverrides,
  setComponentOverride,
  setTokenOverride,
} from "./theme-overrides";

describe("parseThemeOverrides", () => {
  it("parses a valid overlay and defaults empty on malformed input", () => {
    const ok = parseThemeOverrides({ version: 1, tokens: { primary: { value: "#000" } }, components: {} });
    expect(ok.tokens.primary.value).toBe("#000");
    expect(parseThemeOverrides("nonsense")).toEqual(EMPTY_THEME_OVERRIDES);
    expect(parseThemeOverrides(null)).toEqual(EMPTY_THEME_OVERRIDES);
  });
});

describe("setTokenOverride", () => {
  it("sets, mode-scopes, and clears (empty value) a token override", () => {
    let o = setTokenOverride(EMPTY_THEME_OVERRIDES, "--primary", "#635bff");
    expect(o.tokens.primary).toEqual({ value: "#635bff" }); // leading -- stripped
    o = setTokenOverride(o, "primary", "#111", "dark");
    expect(o.tokens.primary).toEqual({ value: "#111", mode: "dark" });
    o = setTokenOverride(o, "primary", "  ");
    expect(o.tokens.primary).toBeUndefined();
  });
});

describe("setComponentOverride", () => {
  it("targets base / variant-option / slot and prunes empties", () => {
    let o = setComponentOverride(EMPTY_THEME_OVERRIDES, "Button", {}, { background: "var(--primary)" });
    expect(o.components.Button.base).toEqual({ background: "var(--primary)" });

    o = setComponentOverride(o, "Button", { variant: "variant", option: "ghost" }, { color: "#fff" });
    expect(o.components.Button.variants?.variant.ghost).toEqual({ color: "#fff" });

    o = setComponentOverride(o, "Button", { slot: "label" }, { fontWeight: "600" });
    expect(o.components.Button.slots?.label).toEqual({ fontWeight: "600" });

    // Clearing every target removes the component entry entirely.
    o = setComponentOverride(o, "Button", {}, {});
    o = setComponentOverride(o, "Button", { variant: "variant", option: "ghost" }, {});
    o = setComponentOverride(o, "Button", { slot: "label" }, {});
    expect(o.components.Button).toBeUndefined();
  });
});
