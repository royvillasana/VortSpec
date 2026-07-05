import { describe, it, expect } from "vitest";
import { generateTokenCSS } from "../token-css";

describe("generateTokenCSS", () => {
  it("generates CSS custom properties from color tokens", () => {
    const tokens = [
      {
        id: "tok_1",
        name: "color/primary/500",
        type: "color",
        value: { type: "color", value: { hex: "#2563EB" } },
      },
    ];
    const css = generateTokenCSS(tokens);
    expect(css).toContain("--color-primary-500");
    expect(css).toContain("#2563EB");
  });

  it("handles empty token list", () => {
    const css = generateTokenCSS([]);
    expect(css).toContain(":root");
  });
});
