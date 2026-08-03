import { describe, expect, it } from "vitest";
import { buildLightPagePrompt, buildConvertToFrameworkPrompt, buildGenerateCodePrompt, lightPagePath, LIGHT_PAGES_DIR } from "./light-page";
import type { CompileResult } from "./compile";

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

  it("forbids inlining video/large binaries as base64 and points media at the served assets folder", () => {
    // The whole-app freeze came from an AI-inlined base64 <video> — the prompt must rule that out.
    expect(prompt).toMatch(/NEVER inline video/i);
    expect(prompt).toMatch(/base64/i);
    expect(prompt).toMatch(/FREEZES the live preview/i);
    expect(prompt).toContain(".vortspec/light-pages/assets/");
    expect(prompt).toMatch(/assets\/hero\.mp4/); // a served relative path, not a data: URI
  });

  it("allows Astro-style interactive islands (bounded vanilla JS, only where needed, marked data-island)", () => {
    expect(prompt).toMatch(/Astro-style islands/i);
    expect(prompt).toMatch(/vanilla JS/i);
    expect(prompt).toMatch(/SELF-CONTAINED/i);
    expect(prompt).toContain("data-island");
    expect(prompt).toMatch(/only where interactivity is actually required|ONLY where a screen genuinely needs/i);
  });
});

describe("buildConvertToFrameworkPrompt", () => {
  it("without a compile: builds the framework-first spec from the light HTML, no compile block", () => {
    const p = buildConvertToFrameworkPrompt("Airbnb Landing", undefined, "react");
    expect(p).toContain('CONVERT the light page "Airbnb Landing"');
    expect(p).toContain(lightPagePath("Airbnb Landing"));
    expect(p).not.toMatch(/DETERMINISTIC COMPILE/);
  });

  const compiled: CompileResult = {
    code: '<div style={{ backgroundColor: "var(--color-brand)" }}>\n  <Button variant="primary" />\n</div>',
    usedComponents: ["Button"],
    lintIssues: [],
    deterministicCoverage: { tokensRestored: 1, literalsKept: 0, componentsMapped: 1, residual: [] },
  };

  it("with a clean compile: folds in the JSX as the authoritative structure + coverage + used components", () => {
    const p = buildConvertToFrameworkPrompt("Airbnb Landing", compiled, "react");
    expect(p).toMatch(/DETERMINISTIC COMPILE \(authoritative/);
    expect(p).toContain('var(--color-brand)');
    expect(p).toContain('<Button variant="primary" />');
    expect(p).toMatch(/Components used[^\n]*Button/);
    expect(p).toMatch(/1 token value\(s\) restored, 1 component\(s\) mapped/);
    expect(p).toMatch(/fully deterministic/i);
  });

  it("surfaces residual + lint as the only parts needing judgment", () => {
    const withResidual: CompileResult = {
      ...compiled,
      lintIssues: ['padding: "16px" matches a design token but was emitted as a raw value'],
      deterministicCoverage: { ...compiled.deterministicCoverage, residual: ['unmapped token value "16px" on padding'] },
    };
    const p = buildConvertToFrameworkPrompt("X", withResidual, "react");
    expect(p).toMatch(/NEEDS YOUR JUDGMENT/);
    expect(p).toContain('unmapped token value "16px" on padding');
  });

  it("ignores an empty compile (no code) — same as no compile", () => {
    const empty: CompileResult = { code: "  ", usedComponents: [], lintIssues: [], deterministicCoverage: { tokensRestored: 0, literalsKept: 0, componentsMapped: 0, residual: [] } };
    expect(buildConvertToFrameworkPrompt("X", empty, "react")).not.toMatch(/DETERMINISTIC COMPILE/);
  });
});

describe("buildGenerateCodePrompt", () => {
  const p = buildGenerateCodePrompt(["Home", "Pricing"], "react");

  it("targets the CONFIGURED framework, not hardcoded React", () => {
    expect(p).toMatch(/read `\.sdd-de\/project\.yaml` for the target framework/i);
    expect(p).toMatch(/do NOT default to React/i);
  });

  it("lists every screen by its light-page path as the authoritative spec", () => {
    expect(p).toContain(lightPagePath("Home"));
    expect(p).toContain(lightPagePath("Pricing"));
    expect(p).toMatch(/AUTHORITATIVE spec/i);
    expect(p).toContain("data-component");
  });

  it("requires build/reuse components + audit + visual validation, keeping screens intact", () => {
    expect(p).toMatch(/REUSE components that already exist/i);
    expect(p).toMatch(/reference a design token/i);
    expect(p).toMatch(/AUDIT/);
    expect(p).toMatch(/VISUAL-VALIDATE/);
    expect(p).toMatch(/stay UNCHANGED|remain the editable source/i);
  });

  it("converts interactive data-island markers to idiomatic framework components (not copied scripts)", () => {
    expect(p).toContain("data-island");
    expect(p).toMatch(/framework's idiomatic way|interactive component with the equivalent/i);
    expect(p).toMatch(/NOT a copied <script>/i);
  });
});

describe("buildGenerateCodePrompt — the LIVE Playground 'Generate code' path", () => {
  // This is the function `lite-source.ts` actually calls (buildProjectGenerateCodePrompt and
  // buildProjectConvertPagePrompt). An earlier commit wired the contract into
  // buildConvertToFrameworkPrompt, which has no production caller — so the live conversion
  // from light pages into site/app framework code could still fall back to React habits.
  it.each([
    ["svelte", "$props()"],
    ["angular", "(click)"],
    ["vue", "defineProps"],
  ])("carries the %s contract into the generated-code prompt", (framework, marker) => {
    const p = buildGenerateCodePrompt(["home"], framework);
    expect(p).toContain("FRAMEWORK CONTRACT");
    expect(p).toContain(marker);
    expect(p).toContain(".vortspec/light-pages/home.html");
  });

  it("refuses structurally on an unknown framework — STOP and nothing else to follow", () => {
    // Appending STOP to a prompt that still carries implementation steps leaves the model
    // instructions to read past. This returns ONLY the stop clause.
    for (const f of ["brand-new-framework", undefined, null, ""] as const) {
      const p = buildGenerateCodePrompt(["home"], f);
      expect(p).toContain("STOP");
      expect(p).toMatch(/Do NOT generate any component/);
      // None of the build steps survive.
      expect(p).not.toContain("scaffold");
      expect(p).not.toContain("VISUAL-VALIDATE");
      expect(p).not.toContain(".vortspec/light-pages/home.html");
    }
  });

  it("applies the same structural refusal to the single-page convert prompt", () => {
    const p = buildConvertToFrameworkPrompt("home", undefined, "not-a-framework");
    expect(p).toContain("STOP");
    expect(p).not.toContain("scaffold");
  });
});
