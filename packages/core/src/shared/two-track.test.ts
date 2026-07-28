import { describe, expect, it } from "vitest";
import { buildTwoTrackBuildPrompt } from "./two-track";

describe("buildTwoTrackBuildPrompt", () => {
  const targets = [
    { name: "Header", tier: "organism", figmaNodeId: "3:3", variants: [] },
    { name: "Button", tier: "atom", figmaNodeId: "1:1", variants: ["primary", "secondary"] },
    { name: "SearchBar", tier: "molecule", figmaNodeId: "2:2", variants: [] },
  ];
  const prompt = buildTwoTrackBuildPrompt(targets);

  it("orders the two tracks: light stand-ins FIRST, framework SECOND", () => {
    expect(prompt).toMatch(/TRACK 1 — LIGHT/);
    expect(prompt).toMatch(/TRACK 2 — FRAMEWORK/);
    expect(prompt.indexOf("TRACK 1 — LIGHT")).toBeLessThan(prompt.indexOf("TRACK 2 — FRAMEWORK"));
  });

  it("pins ONE Figma read reused across both tracks", () => {
    expect(prompt).toMatch(/ONE Figma read/i);
    expect(prompt).toMatch(/REUSING the Figma reads you already did/i);
    expect(prompt).toMatch(/do NOT\s+re-read/i);
  });

  it("embeds the light stand-in pass verbatim (framework-free HTML first)", () => {
    expect(prompt).toMatch(/framework-free/i);
    expect(prompt).toContain(".vortspec/light-html");
  });

  it("orders the framework build atoms → molecules → organisms", () => {
    const buildSection = prompt.slice(prompt.indexOf("Components to build"));
    expect(buildSection.indexOf("Button")).toBeLessThan(buildSection.indexOf("SearchBar"));
    expect(buildSection.indexOf("SearchBar")).toBeLessThan(buildSection.indexOf("Header"));
  });

  it("requires identity convergence + token discipline + harvest→framework-ready", () => {
    expect(prompt).toMatch(/identity MUST match the contract/i);
    expect(prompt).toMatch(/referencing a design token/i);
    expect(prompt).toMatch(/framework-ready/);
    expect(prompt).toMatch(/HARVEST/);
  });

  it("falls back to 'default' when a component has no variants, and tags untiered targets last", () => {
    const p = buildTwoTrackBuildPrompt([
      { name: "Mystery", figmaNodeId: "9:9", variants: [] },
      { name: "Icon", tier: "atom", figmaNodeId: "8:8", variants: [] },
    ]);
    const section = p.slice(p.indexOf("Components to build"));
    expect(section).toContain("default");
    expect(section.indexOf("Icon")).toBeLessThan(section.indexOf("Mystery"));
  });
});
