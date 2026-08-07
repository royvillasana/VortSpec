import { describe, expect, it } from "vitest";
import { readTsThemeObject } from "./theme-object-reader";

describe("readTsThemeObject (task 7.10)", () => {
  it("reads a default-exported theme object", () => {
    expect(
      readTsThemeObject(`export default { color: { primary: "#1d4ed8" }, spacing: { 4: "1rem" } };`),
    ).toEqual({ color: { primary: "#1d4ed8" }, spacing: { 4: "1rem" } });
  });

  it("prefers a named `theme`/`tokens` export over an unrelated exported object", () => {
    const source = `
      export const config = { plugins: [] };
      export const theme = { color: { primary: "#1d4ed8" } };
    `;
    expect(readTsThemeObject(source)).toEqual({ color: { primary: "#1d4ed8" } });
  });

  it("reads through `as const` and `satisfies`, which are type-level only", () => {
    expect(readTsThemeObject(`export const tokens = { radius: { md: "8px" } } as const;`)).toEqual({
      radius: { md: "8px" },
    });
    expect(
      readTsThemeObject(`type T = Record<string, unknown>;\nexport const theme = { z: 1 } satisfies T;`),
    ).toEqual({ z: 1 });
  });

  it("reads the literal kinds a theme is made of, negatives included", () => {
    const read = readTsThemeObject(
      `export default { weight: 700, tight: -0.02, on: true, stack: ["Inter", "sans-serif"] };`,
    );
    expect(read).toEqual({ weight: 700, tight: -0.02, on: true, stack: ["Inter", "sans-serif"] });
  });

  it("omits what it cannot know statically instead of guessing at it", () => {
    // A call and a spread of an import are genuinely not readable without executing the module —
    // and executing a user's theme file to read tokens is not something this may do.
    const source = `
      import { base } from "./base";
      export default { ...base, color: { primary: "#1d4ed8" }, generated: makeScale(4) };
    `;
    expect(readTsThemeObject(source)).toEqual({ color: { primary: "#1d4ed8" } });
  });

  it("drops a whole array when one element is unreadable, rather than reporting a partial one", () => {
    // A font stack missing its fallback is silently wrong; an absent one is visibly absent.
    expect(readTsThemeObject(`export default { stack: ["Inter", FALLBACK] };`)).toEqual({});
  });

  it("returns null for a file with no object literal, and never throws on garbage", () => {
    expect(readTsThemeObject(`export const n = 1;`)).toBeNull();
    expect(readTsThemeObject(`this is not typescript ((((`)).toBeNull();
  });
});
