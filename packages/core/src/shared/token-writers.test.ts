import { describe, expect, it } from "vitest";
import {
  detectTokenFormat,
  materializeCssOverlay,
  writeCssVar,
  writeJsonToken,
  writeScssVar,
  writeToken,
  writeTsThemeToken,
} from "./token-writers";
import { EMPTY_THEME_OVERRIDES, setTokenOverride } from "./theme-overrides";

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
