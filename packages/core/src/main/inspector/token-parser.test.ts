import { describe, expect, it } from "vitest";
import { parseTokensFromCss } from "./token-parser";

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
