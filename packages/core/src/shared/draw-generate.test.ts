import { describe, it, expect } from "vitest";
import { buildDrawGeneratePrompt } from "./draw-generate";

describe("buildDrawGeneratePrompt", () => {
  const base = {
    name: "product-card",
    outputPath: ".vortspec/light-pages/product-card.html",
    label: "Product card",
    note: "reuse Card, add a rating row",
    pngPath: "/tmp/proj/.vortspec/canvas/exports/product-card.png",
  };

  it("tells the agent to read the sketch image and grounds it in the design system", () => {
    const p = buildDrawGeneratePrompt(base);
    expect(p).toContain("/tmp/proj/.vortspec/canvas/exports/product-card.png");
    expect(p).toMatch(/READ that image FIRST/);
    expect(p).toMatch(/GROUND IT IN THE PROJECT'S DESIGN SYSTEM/);
    expect(p).toContain("designer.md");
    expect(p).toContain(".vortspec/light-html/");
    expect(p).toMatch(/Never emit a\s*\n?\s*raw hex or px value/);
  });

  it("emits framework-free output marked data-component, written to the light page path", () => {
    const p = buildDrawGeneratePrompt(base);
    expect(p).toMatch(/framework-free/i);
    expect(p).toContain('data-component="<ComponentName>"');
    expect(p).toContain(".vortspec/light-pages/product-card.html");
    expect(p).toMatch(/MUST NOT contain: `import`/);
    expect(p).toContain("Product card");
    expect(p).toContain("reuse Card, add a rating row");
  });

  it("includes the graph grounding block when provided, and says CUSTOMIZE for an evolve", () => {
    const withBlock = buildDrawGeneratePrompt({ ...base, subgraphBlock: "=== Draw grounding ===\nSketch: x", intent: "customize-existing" });
    expect(withBlock).toContain("=== Draw grounding ===");
    expect(withBlock).toMatch(/CUSTOMIZE an existing/);
    // create-new is the default
    expect(buildDrawGeneratePrompt(base)).toMatch(/GENERATE a design-system component/);
  });
});
