import { describe, expect, it } from "vitest";
import { buildLightPagePrompt, lightPagePath, LIGHT_PAGES_DIR } from "./light-page";

describe("lightPagePath", () => {
  it("normalizes the page name into a .vortspec/light-pages path", () => {
    expect(lightPagePath("Airbnb Landing")).toBe(`${LIGHT_PAGES_DIR}/Airbnb-Landing.html`);
  });
});

describe("buildLightPagePrompt", () => {
  const prompt = buildLightPagePrompt("Airbnb Landing", "A listings page with a top nav, hero search, and a grid of listing cards.");

  it("includes the page name + description", () => {
    expect(prompt).toContain('named "Airbnb Landing"');
    expect(prompt).toContain("grid of listing cards");
  });

  it("pins the light-first contract: read designer.md, reuse components, framework-free, transform later", () => {
    expect(prompt).toContain("designer.md");
    expect(prompt).toMatch(/framework-free/i);
    expect(prompt).toMatch(/transform step/i);
  });

  it("forcefully OVERRIDES the framework-first workflow (no gap check, no scaffold, no components, no new tokens)", () => {
    expect(prompt).toMatch(/OVERRIDES the project'?s normal framework-first workflow/i);
    expect(prompt).toMatch(/do NOT run Component Gap Detection/i);
    expect(prompt).toMatch(/do NOT scaffold/i);
    expect(prompt).toMatch(/do NOT implement React\/framework components/i);
    expect(prompt).toMatch(/do NOT add, modify, or invent design tokens/i);
  });

  it("requires framework-free output and data-component mapping + the write path", () => {
    expect(prompt).toMatch(/MUST\s+NOT contain/);
    expect(prompt).toContain("data-component");
    expect(prompt).toContain(LIGHT_PAGES_DIR);
  });

  it("falls back to an inferred layout when no description is given", () => {
    expect(buildLightPagePrompt("Pricing", "")).toMatch(/infer a sensible layout/i);
  });
});
