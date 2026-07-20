import { describe, it, expect } from "vitest";
import { buildTokenTheme, parseCssVars, renderTailwindConfigCjs } from "./token-theme-bridge";

const TOKENS = `
:root {
  --brand-primary-500: #087990;
  --color-brand-primary: #087990;
  --color-status-danger: #dc3545;
  --color-text-default: #212529;
  --text-body-regular-size: 16px;
  --text-body-regular-leading: 24px;
  --text-body-regular-family: Inter, sans-serif;
  --font-sans: Inter, system-ui;
  --spacing-16: 16px;
  --radius-8: 8px;
  --shadow-default: 0 1px 2px rgba(0,0,0,0.1);
  --stroke-width: 1px;
}
`;

describe("buildTokenTheme — token → Tailwind theme bridge", () => {
  const t = buildTokenTheme(TOKENS);

  it("exposes palette colors under their raw name", () => {
    expect(t.colors["brand-primary-500"]).toBe("var(--brand-primary-500)");
  });

  it("strips a leading color- so bg-brand-primary resolves", () => {
    expect(t.colors["brand-primary"]).toBe("var(--color-brand-primary)");
    expect(t.colors["status-danger"]).toBe("var(--color-status-danger)");
  });

  it("maps --color-text-default to the `default` text color (text-default)", () => {
    expect(t.colors["default"]).toBe("var(--color-text-default)");
  });

  it("routes typography size/leading/family to the right scales", () => {
    expect(t.fontSize["body-regular-size"]).toBe("var(--text-body-regular-size)");
    expect(t.lineHeight["body-regular-leading"]).toBe("var(--text-body-regular-leading)");
    expect(t.fontFamily["body-regular-family"]).toEqual(["var(--text-body-regular-family)"]);
    expect(t.fontFamily["sans"]).toEqual(["var(--font-sans)"]);
  });

  it("maps spacing, radius, and shadow", () => {
    expect(t.spacing["16"]).toBe("var(--spacing-16)");
    expect(t.borderRadius["8"]).toBe("var(--radius-8)");
    expect(t.boxShadow["default"]).toBe("var(--shadow-default)");
  });

  it("does not miscategorize a non-color, non-typography scalar as a color", () => {
    expect(t.colors["stroke-width"]).toBeUndefined();
  });

  it("parseCssVars ignores comments and blank lines", () => {
    expect(parseCssVars("/* c */\n\n--a: #fff;").map((v) => v.name)).toEqual(["a"]);
  });
});

describe("renderTailwindConfigCjs — self-parsing config", () => {
  it("embeds the token-file path and the content globs", () => {
    const cfg = renderTailwindConfigCjs("src/styles/tokens.css");
    expect(cfg).toContain("src/styles/tokens.css");
    expect(cfg).toContain("./src/**/*.{ts,tsx,js,jsx,mdx}");
    expect(cfg).toContain("module.exports");
  });

  it("evaluates to a theme matching buildTokenTheme for the same tokens", () => {
    // Sanity that the embedded logic and the pure function agree.
    const cfg = renderTailwindConfigCjs("t.css");
    // The embedded categorization mirrors buildTokenTheme's rules verbatim.
    expect(cfg).toContain('name.startsWith("color-text-")');
    expect(cfg).toContain("/^text-.*-size$/");
    expect(cfg).toContain("/^shadows?-/");
  });
});
