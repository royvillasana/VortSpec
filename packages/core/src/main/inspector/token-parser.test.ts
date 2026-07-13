import { describe, expect, it } from "vitest";
import {
  parseTokensFromCss,
  parseCssContexts,
  resolveInContext,
  deriveModeMap,
  DEFAULT_CONTEXT,
} from "./token-parser";
import type { FigmaCollection } from "@vortspec/core/inspector";

const CSS = `
:root {
  --primitive-neutral-white: #ffffff;
  --theme-primary: #087990;
  --color-text-default: #212529;
  --spacing-8: 8px;
  --radius-8: 8px;
  --font-size-body: 16px;
  --font-family-base: "Roboto", sans-serif;
  --shadow-default: 0 1px 2px rgba(0,0,0,0.05);
  --opacity-disabled: 0.65;
  --button-primary-hover: var(--theme-primary);
}
`;

describe("parseTokensFromCss", () => {
  const tokens = parseTokensFromCss(CSS);
  const byName = new Map(tokens.map((t) => [t.name, t]));

  it("parses every custom property", () => {
    expect(tokens).toHaveLength(10);
  });

  it("classifies tokens by name and value", () => {
    expect(byName.get("primitive-neutral-white")?.type).toBe("color");
    expect(byName.get("theme-primary")?.type).toBe("color");
    expect(byName.get("color-text-default")?.type).toBe("color");
    expect(byName.get("spacing-8")?.type).toBe("spacing");
    expect(byName.get("radius-8")?.type).toBe("radius");
    expect(byName.get("font-size-body")?.type).toBe("typography");
    expect(byName.get("font-family-base")?.type).toBe("typography");
    expect(byName.get("shadow-default")?.type).toBe("shadow");
    expect(byName.get("opacity-disabled")?.type).toBe("other");
  });

  it("resolves in-file var() references to a concrete value", () => {
    const t = byName.get("button-primary-hover");
    expect(t?.rawValue).toBe("var(--theme-primary)");
    expect(t?.resolvedValue).toBe("#087990");
    // A resolved color reference is still classified as a color.
    expect(t?.type).toBe("color");
  });
});

const MULTI = `
:root {
  --color-primary: #7C6FF0;
  --bg: var(--color-primary);
}
.dark {
  --color-primary: #2A2540;
  --bg: var(--color-primary);
}
@media (prefers-color-scheme: dark) {
  :root { --color-primary: #111111; }
}
`;

describe("parseCssContexts", () => {
  const p = parseCssContexts(MULTI);

  it("collects each declaration under its selector context", () => {
    expect(p.raw.get("color-primary")?.get(":root")).toBe("#7C6FF0");
    expect(p.raw.get("color-primary")?.get(".dark")).toBe("#2A2540");
    expect(p.raw.get("color-primary")?.get("@media (prefers-color-scheme: dark)")).toBe("#111111");
  });

  it("orders contexts with the default `:root` first", () => {
    expect(p.contexts[0]).toBe(DEFAULT_CONTEXT);
    expect(p.contexts).toContain(".dark");
  });

  it("treats a Tailwind @theme block as the default context", () => {
    const t = parseCssContexts("@theme { --x: 1px; }");
    expect(t.raw.get("x")?.get(":root")).toBe("1px");
  });
});

describe("resolveInContext", () => {
  const p = parseCssContexts(MULTI);
  it("resolves var() within the same context (not the default)", () => {
    expect(resolveInContext("var(--color-primary)", ".dark", p)).toBe("#2A2540");
    expect(resolveInContext("var(--color-primary)", ":root", p)).toBe("#7C6FF0");
  });
  it("falls back to the default context when the ref is absent in-context", () => {
    const q = parseCssContexts(":root { --a: red; } .dark { --b: var(--a); }");
    expect(resolveInContext("var(--a)", ".dark", q)).toBe("red");
  });
});

describe("deriveModeMap", () => {
  const collection: FigmaCollection = {
    name: "Theme",
    modes: [
      { id: "1:0", name: "Light" },
      { id: "1:1", name: "Dark" },
    ],
    defaultModeId: "1:0",
  };
  it("maps the default mode to :root and a dark mode to a dark context", () => {
    const map = deriveModeMap(collection, [":root", ".dark"]);
    expect(map.Light).toBe(":root");
    expect(map.Dark).toBe(".dark");
  });
  it("prefers a prefers-color-scheme media context for dark", () => {
    const map = deriveModeMap(collection, [":root", "@media (prefers-color-scheme: dark)"]);
    expect(map.Dark).toBe("@media (prefers-color-scheme: dark)");
  });
  it("leaves a mode unmapped when no matching context exists", () => {
    const map = deriveModeMap(collection, [":root"]);
    expect(map.Dark).toBe("");
  });
});
