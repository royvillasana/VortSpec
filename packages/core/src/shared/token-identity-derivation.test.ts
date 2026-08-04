import { describe, it, expect, vi } from "vitest";

/**
 * Proves Layer 2's canonical example is COMPUTED, not a literal that happens to be right.
 *
 * Its own file because the mapping has to be mocked before `sdd-prompts` imports it, and the
 * rest of that suite needs the real one.
 *
 * This exists because a mutation caught an overclaim of mine. I asserted the prompt contains
 * `componentTokenName(...)`'s output and described that as pinning the derivation. It does not:
 * replacing the interpolation with the correct literal left every test green. An assertion that
 * the emitted string EQUALS the computed string cannot distinguish "computed" from "currently
 * correct" — only changing what the mapping returns can. Same defect class as a matcher that
 * cannot fire, in a test I wrote to guard against exactly that.
 */
vi.mock("./component-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./component-tokens")>();
  return {
    ...actual,
    componentTokenName: (figmaPath: string) =>
      figmaPath.startsWith("Components/")
        ? { component: "sentinel", slot: "derived", name: "--sentinel-derived-not-hardcoded" }
        : null,
  };
});

describe("Layer 2's canonical example is derived from the mapping", () => {
  it("carries whatever componentTokenName returns, not a literal", async () => {
    const { verifyPrompt } = await import("./sdd-prompts");
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    // With the mapping stubbed, a DERIVED example changes; a hardcoded one does not.
    expect(p).toContain("--sentinel-derived-not-hardcoded");
    expect(p).not.toContain("--component-accordion-active-item-header-background");
  });
});
