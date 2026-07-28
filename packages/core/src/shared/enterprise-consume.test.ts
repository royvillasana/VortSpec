import { describe, expect, it } from "vitest";
import { analyzeEnterpriseReadiness, buildEnterpriseFoundationPrompt } from "./enterprise-consume";

const tokens = [
  { name: "--color-brand", resolvedValue: "#7C6FF0" },
  { name: "--space-2", resolvedValue: "8px" },
];

describe("analyzeEnterpriseReadiness — validate, don't extract", () => {
  it("all assets usable → ok, usable true", () => {
    const r = analyzeEnterpriseReadiness({
      tokens,
      components: [
        { name: "Button", hasStory: true, importable: true },
        { name: "Card", hasStory: true, importable: true },
      ],
      knowledgeBase: { connected: true, reachable: true },
    });
    expect(r.tokens.status).toBe("ok");
    expect(r.components.status).toBe("ok");
    expect(r.knowledgeBase.status).toBe("ok");
    expect(r.usable).toBe(true);
    expect(r.componentDetail.every((c) => c.fidelity === "harvested")).toBe(true);
  });

  it("a component without a story is a gap (placeholder fidelity), not a block", () => {
    const r = analyzeEnterpriseReadiness({
      tokens,
      components: [
        { name: "Button", hasStory: true, importable: true },
        { name: "Modal", hasStory: false, importable: true },
      ],
    });
    expect(r.components.status).toBe("gap");
    expect(r.components.detail).toContain("1 will use a placeholder");
    expect(r.componentDetail.find((c) => c.name === "Modal")?.fidelity).toBe("placeholder");
    expect(r.usable).toBe(true); // gaps don't block
  });

  it("unmatched component values flag a token gap, never a copy/hardcode", () => {
    const r = analyzeEnterpriseReadiness({
      tokens,
      unresolvedValues: ["#ABCDEF on border"],
      components: [{ name: "Button", hasStory: true, importable: true }],
    });
    expect(r.tokens.status).toBe("gap");
    expect(r.tokens.detail).toContain("1 component value(s) map to no token");
  });

  it("no tokens or no components is missing → not usable", () => {
    expect(analyzeEnterpriseReadiness({ tokens: [], components: [{ name: "Button", hasStory: true, importable: true }] }).usable).toBe(false);
    expect(analyzeEnterpriseReadiness({ tokens, components: [] }).usable).toBe(false);
  });

  it("an unreachable knowledge base is a gap, not silent", () => {
    const r = analyzeEnterpriseReadiness({
      tokens,
      components: [{ name: "Button", hasStory: true, importable: true }],
      knowledgeBase: { connected: true, reachable: false },
    });
    expect(r.knowledgeBase.status).toBe("gap");
    expect(r.knowledgeBase.detail).toMatch(/not reachable/i);
    expect(r.usable).toBe(true); // KB is optional
  });
});

describe("buildEnterpriseFoundationPrompt — consume, never rebuild", () => {
  const p = buildEnterpriseFoundationPrompt({
    storybookSourceKind: "url",
    storybookSource: "https://sb.acme.com",
    enterpriseRepoUrl: "git@github.com:acme/ds.git",
    knowledgeBaseKind: "docs-repo",
    knowledgeBase: "git@github.com:acme/handbook.git",
  });

  it("forbids extraction/build/provision/storybook-install and copying", () => {
    expect(p).toMatch(/Do NOT extract/i);
    expect(p).toMatch(/do NOT build or rebuild components/i);
    expect(p).toMatch(/do NOT run \/provision-library/i);
    expect(p).toMatch(/do NOT install a VortSpec Storybook/i);
    expect(p).toMatch(/never copy it/i);
  });

  it("requires validate + a pointer index (not a competing definition) + the light snapshot", () => {
    expect(p).toMatch(/VALIDATE \(a readiness report, not extraction\)/);
    expect(p).toMatch(/INDEX, don't copy/);
    expect(p).toMatch(/POINTERS/);
    expect(p).toMatch(/NEVER author a competing token or component definition/i);
    expect(p).toMatch(/light stand-ins/);
    expect(p).toContain("https://sb.acme.com");
  });
});
