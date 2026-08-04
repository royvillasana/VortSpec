import { describe, expect, it } from "vitest";
import { parseThemeOverrides } from "./theme-overrides";
import {
  detectTokenFormat,
  materializeComponentCss,
  materializeCssOverlay,
  writeCssVar,
  writeJsonToken,
  writeScssVar,
  writeToken,
  writeTsThemeToken,
} from "./token-writers";
import { EMPTY_THEME_OVERRIDES, setComponentOverride, setTokenOverride } from "./theme-overrides";

describe("detectTokenFormat", () => {
  it("maps extensions to formats", () => {
    expect(detectTokenFormat("tokens.css")).toBe("css");
    expect(detectTokenFormat("theme/_vars.scss")).toBe("scss");
    expect(detectTokenFormat("tokens.json")).toBe("json");
    expect(detectTokenFormat("src/theme.ts")).toBe("ts");
    expect(detectTokenFormat("theme.jsx")).toBe("ts");
  });
});

describe("writeCssVar / writeScssVar", () => {
  it("replaces a CSS var in place, null when absent", () => {
    expect(writeCssVar(":root { --primary: #000; }", "--primary", "#635bff")).toContain("--primary: #635bff;");
    expect(writeCssVar(":root { --primary: #000; }", "accent", "#111")).toBeNull();
  });
  it("replaces an SCSS variable in place", () => {
    expect(writeScssVar("$primary: #000;\n$radius: 4px;", "primary", "#635bff")).toContain("$primary: #635bff;");
  });
});

describe("writeJsonToken", () => {
  it("sets a dotted path, keeping a { value } leaf shape", () => {
    const out = writeJsonToken('{ "color": { "primary": { "value": "#000" } } }', "color.primary", "#635bff");
    expect(JSON.parse(out!).color.primary.value).toBe("#635bff");
  });
  it("sets a plain leaf and creates intermediate objects", () => {
    const out = writeJsonToken("{}", "color.primary", "#635bff");
    expect(JSON.parse(out!).color.primary).toBe("#635bff");
  });
  it("returns null on invalid JSON", () => {
    expect(writeJsonToken("{ not json", "x", "1")).toBeNull();
  });
});

describe("writeTsThemeToken", () => {
  const src = `import { createTheme } from "@mui/material";
export const theme = createTheme({
  palette: { primary: { main: "#000" } },
  shape: { borderRadius: 4 },
});`;
  it("sets a nested string path and quotes it", () => {
    const out = writeTsThemeToken(src, "palette.primary.main", "#635bff");
    expect(out).toContain('main: "#635bff"');
  });
  it("sets a numeric path without quotes", () => {
    const out = writeTsThemeToken(src, "shape.borderRadius", "8");
    expect(out).toContain("borderRadius: 8");
  });
  it("returns null when the path is absent", () => {
    expect(writeTsThemeToken(src, "palette.secondary.main", "#fff")).toBeNull();
  });
});

describe("writeToken dispatch", () => {
  it("routes by format", () => {
    expect(writeToken("css", "--a: 1;", "--a", "2")).toBe("--a: 2;");
    expect(JSON.parse(writeToken("json", "{}", "a.b", "c")!).a.b).toBe("c");
  });
});

describe("materializeCssOverlay", () => {
  it("emits :root + per-mode blocks from the overlay, and empty when there are none", () => {
    let o = setTokenOverride(EMPTY_THEME_OVERRIDES, "primary", "#635bff");
    o = setTokenOverride(o, "primary", "#111", "dark");
    o = setTokenOverride(o, "radius", "8px");
    const css = materializeCssOverlay(o);
    expect(css).toContain(":root {");
    expect(css).toContain("--radius: 8px;");
    expect(css).toContain(".dark {");
    expect(css).toContain("--primary: #111;");
    expect(materializeCssOverlay(EMPTY_THEME_OVERRIDES)).toBe("");
  });
});

describe("materializeComponentCss", () => {
  it("emits data-component-scoped rules for base / variant / slot, kebab-casing props", () => {
    let o = setComponentOverride(EMPTY_THEME_OVERRIDES, "Button", {}, { background: "var(--primary)" });
    o = setComponentOverride(o, "Button", { variant: "variant", option: "ghost" }, { color: "#fff" });
    o = setComponentOverride(o, "Button", { slot: "label" }, { fontWeight: "600" });
    const css = materializeComponentCss(o);
    expect(css).toContain('[data-component="Button"] {');
    expect(css).toContain("background: var(--primary);");
    expect(css).toContain('[data-component="Button"][data-variant="ghost"] {');
    expect(css).toContain("color: #fff;");
    expect(css).toContain('[data-component="Button"] [data-slot="label"] {');
    expect(css).toContain("font-weight: 600;"); // camelCase prop kebab-cased
    expect(materializeComponentCss(EMPTY_THEME_OVERRIDES)).toBe("");
  });
});

describe("a component-scoped token redefinition", () => {
  it("emits the token under the component's selector, not at the root", () => {
    // This is what makes "change every Button" possible without changing Cards: the SAME token name,
    // redefined only inside the component. Custom properties inherit, so every Button subtree resolves
    // the new value and everything outside keeps the design system's.
    const css = materializeComponentCss(
      parseThemeOverrides({
        version: 1,
        components: { Button: { base: { "--radius-element": "4px" } } },
      }),
    );
    expect(css).toContain('[data-component="Button"]');
    expect(css).toContain("--radius-element: 4px;");
    // Emphatically NOT at :root — that is the spill this scope exists to avoid.
    expect(css).not.toContain(":root");
  });

  it("leaves the custom property name intact rather than kebab-mangling it", () => {
    // The decl writer kebab-cases camelCase property names. A token name is already kebab and begins with
    // `--`; mangling it would emit a property nothing reads, and the edit would silently do nothing.
    const css = materializeComponentCss(
      parseThemeOverrides({
        version: 1,
        components: { Card: { base: { "--color-accent": "#5433EB" } } },
      }),
    );
    expect(css).toContain("--color-accent: #5433EB;");
  });

  it("scopes each component separately, so siblings sharing a token are spared", () => {
    const css = materializeComponentCss(
      parseThemeOverrides({
        version: 1,
        components: {
          Button: { base: { "--radius-element": "4px" } },
          Card: { base: { "--radius-element": "16px" } },
        },
      }),
    );
    // Two independent rules — neither can reach the other's component.
    expect(css).toMatch(/\[data-component="Button"\][^}]*--radius-element: 4px;/s);
    expect(css).toMatch(/\[data-component="Card"\][^}]*--radius-element: 16px;/s);
  });

  it("carries a scoped token alongside a plain declaration on the same component", () => {
    // A component can have both: a token redefined for it, and a property hardcoded on it.
    const css = materializeComponentCss(
      parseThemeOverrides({
        version: 1,
        components: { Button: { base: { "--radius-element": "4px", "box-shadow": "none" } } },
      }),
    );
    expect(css).toContain("--radius-element: 4px;");
    expect(css).toContain("box-shadow: none;");
  });
});
