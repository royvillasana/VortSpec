import { describe, expect, it } from "vitest";
import { buildLightStandInPrompt, standInPath, LIGHT_HTML_DIR, type StandInTarget } from "./light-standin";
import { findFrameworkPointers } from "./lite-manifest";

describe("standInPath", () => {
  it("normalizes component + variant into a .vortspec/light-html path", () => {
    expect(standInPath("Button", "primary")).toBe(`${LIGHT_HTML_DIR}/Button/primary.html`);
    expect(standInPath("Search Bar", "default")).toBe(`${LIGHT_HTML_DIR}/Search-Bar/default.html`);
  });
});

describe("buildLightStandInPrompt", () => {
  const targets: StandInTarget[] = [
    { name: "Button", figmaNodeId: "12:34", variants: ["base", "primary"] },
    { name: "Card", componentKey: "abcdef", variants: [] },
    { name: "Orphan", variants: ["default"] },
  ];
  const prompt = buildLightStandInPrompt(targets);

  it("reuses the existing read recipe (get_design_context) and forbids a new reader / framework code", () => {
    expect(prompt).toContain("get_design_context");
    expect(prompt).toContain("REUSING");
    expect(prompt).toMatch(/do NOT\s+build a new reader/i);
    expect(prompt).toMatch(/do NOT author framework code/i);
  });

  it("pins the sequence: ONE read, light HTML FIRST, framework later", () => {
    expect(prompt).toMatch(/EXACTLY ONCE/);
    expect(prompt).toMatch(/light HTML is\s+the FIRST output/);
    expect(prompt).toMatch(/framework\s+components are generated LATER/i);
  });

  it("lists each component with its Figma ref + variants, and marks a missing ref", () => {
    expect(prompt).toContain("Button (figmaNodeId=12:34) · variants: base, primary");
    expect(prompt).toContain("Card (componentKey=abcdef) · variants: default");
    expect(prompt).toContain("Orphan (no Figma ref — SKIP)");
  });

  it("mandates the framework-free output + the exact write path", () => {
    expect(prompt).toContain(LIGHT_HTML_DIR);
    expect(prompt).toMatch(/MUST NOT contain/);
    // the prompt itself is instructions, not a stand-in, but it names the forbidden pointers explicitly
    expect(prompt).toContain("import");
    expect(prompt).toContain("localhost:6006");
  });

  it("the produced stand-in requirement matches our own guard (round-trip sanity)", () => {
    // A clean stand-in like the prompt asks for passes findFrameworkPointers; a dirty one fails.
    expect(findFrameworkPointers(`<button style="background:#c53434">Go</button>`)).toEqual([]);
    expect(findFrameworkPointers(`<div>import { Button } from '@/ui'</div>`).length).toBeGreaterThan(0);
  });
});
