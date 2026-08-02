import { describe, expect, it } from "vitest";
import {
  COMPONENT_LIBRARY_OPTIONS,
  DESIGN_SOURCE_OPTIONS,
  FRAMEWORK_OPTIONS,
  STYLING_OPTIONS,
} from "@vortspec/core/setup";
import { designSourceLogo, libraryLogo, techLogo } from "./brand-logos";

/**
 * The intake grids are the first screen of the product, and a card with no mark next to five that
 * have one reads as broken rather than minimal. These tests exist so that adding an option to any
 * of the four lists FAILS here until someone gives it a mark — the coverage is the point, not the
 * rendering.
 */

const LANGUAGES = ["typescript", "javascript"];

/** The `d` of the brand path, or null when the option fell back to a lucide glyph. */
function brandPath(el: unknown): string | null {
  const node = el as { props?: { children?: { props?: { d?: string } } } } | null;
  return node?.props?.children?.props?.d ?? null;
}

describe("every intake option carries a mark", () => {
  it("design sources", () => {
    for (const o of DESIGN_SOURCE_OPTIONS) {
      expect(designSourceLogo(o.value), o.value).toBeTruthy();
    }
  });

  it("component libraries", () => {
    for (const o of COMPONENT_LIBRARY_OPTIONS) {
      expect(libraryLogo(o.value), o.value).toBeTruthy();
    }
  });

  it("frameworks, languages and styling — techLogo may return null, so these must not", () => {
    for (const value of [
      ...FRAMEWORK_OPTIONS.map((o) => o.value),
      ...STYLING_OPTIONS.map((o) => o.value),
      ...LANGUAGES,
    ]) {
      expect(techLogo(value), value).not.toBeNull();
    }
  });
});

describe("marks are the right marks", () => {
  it("distinct brands get distinct paths", () => {
    // A copy-paste in the generated map would silently give two frameworks the same logo. SvelteKit
    // is the one legitimate duplicate — it has no mark of its own and uses Svelte's.
    const seen = new Map<string, string>();
    for (const o of FRAMEWORK_OPTIONS) {
      const path = brandPath(techLogo(o.value));
      if (!path) continue;
      const prior = seen.get(path);
      if (prior) expect([prior, o.value].sort()).toEqual(["svelte", "sveltekit"]);
      else seen.set(path, o.value);
    }
  });

  it("falls back to a glyph only where the brand mark is missing or unreadable", () => {
    // Emotion has no Simple Icons entry. CSS Modules' mark is a two-line wordmark and
    // styled-components' is a 💅 emoji — both illegible at 13px, so they take a glyph instead.
    const glyphed = new Set(["emotion", "css-modules", "styled-components"]);
    for (const o of STYLING_OPTIONS) {
      const isBrand = brandPath(techLogo(o.value)) !== null;
      expect(isBrand, o.value).toBe(!glyphed.has(o.value));
    }
  });

  it("an unknown value still renders rather than throwing", () => {
    expect(libraryLogo("not-a-library")).toBeTruthy();
    expect(designSourceLogo("not-a-source")).toBeTruthy();
    expect(techLogo("not-a-framework")).toBeNull();
  });
});
