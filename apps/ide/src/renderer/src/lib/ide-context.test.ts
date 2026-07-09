import { describe, it, expect } from "vitest";
import { buildSeedContext, buildLiveContext } from "./ide-context";

describe("buildSeedContext", () => {
  it("carries the preview URL and the SDD-DE instruction, not the file", () => {
    const s = buildSeedContext("http://localhost:5199");
    expect(s).toContain("http://localhost:5199");
    expect(s).toContain("token-referenced");
    // The concrete file grounding lives in buildLiveContext, not the seed.
    expect(s).not.toContain("open file is");
  });

  it("omits the preview note when there is no preview", () => {
    expect(buildSeedContext(null)).not.toContain("live preview");
  });
});

describe("buildLiveContext", () => {
  it("is empty when nothing is open", () => {
    expect(buildLiveContext(null, null)).toBe("");
  });

  it("names the open file when there is no selection", () => {
    expect(buildLiveContext("src/Button.tsx", null)).toBe(
      "[IDE context] The open file is src/Button.tsx.",
    );
  });

  it("inlines a single-line selection with its text", () => {
    const ctx = buildLiveContext("src/Button.tsx", {
      path: "src/Button.tsx",
      startLine: 12,
      endLine: 12,
      text: "const x = 1;",
    });
    expect(ctx).toContain("In src/Button.tsx, I have selected line 12:");
    expect(ctx).toContain("const x = 1;");
  });

  it("describes a multi-line selection as a range", () => {
    const ctx = buildLiveContext("a.ts", { path: "a.ts", startLine: 3, endLine: 9, text: "…" });
    expect(ctx).toContain("selected lines 3–9:");
  });

  it("falls back to the file when the selection is only whitespace", () => {
    const ctx = buildLiveContext("a.ts", { path: "a.ts", startLine: 1, endLine: 1, text: "   \n" });
    expect(ctx).toBe("[IDE context] The open file is a.ts.");
  });

  it("truncates a very large selection", () => {
    const big = "x".repeat(5000);
    const ctx = buildLiveContext("a.ts", { path: "a.ts", startLine: 1, endLine: 200, text: big });
    expect(ctx).toContain("(truncated)");
    expect(ctx.length).toBeLessThan(big.length);
  });
});
