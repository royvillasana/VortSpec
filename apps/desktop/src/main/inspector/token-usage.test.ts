import { describe, expect, it } from "vitest";
import { buildUsage } from "./token-parser";

const TOKENS = ["color-primary", "color-text", "spacing-4", "radius-8"];

describe("buildUsage — where-used index", () => {
  it("finds `var(--name)` references and recovers the CSS property", () => {
    const usage = buildUsage(TOKENS, [
      { component: "Button", text: ".btn { color: var(--color-text); background: var(--color-primary); }" },
    ]);
    expect(usage["color-text"]).toEqual([{ component: "Button", property: "color" }]);
    expect(usage["color-primary"]).toEqual([{ component: "Button", property: "background" }]);
  });

  it("finds Tailwind arbitrary-value references and recovers the utility", () => {
    const usage = buildUsage(TOKENS, [
      { component: "Card", text: `<div className="bg-[--color-primary] text-[var(--color-text)] rounded-[--radius-8]" />` },
    ]);
    expect(usage["color-primary"]).toEqual([{ component: "Card", property: "bg" }]);
    expect(usage["color-text"]).toEqual([{ component: "Card", property: "text" }]);
    expect(usage["radius-8"]).toEqual([{ component: "Card", property: "rounded" }]);
  });

  it("does not confuse a token with a longer-named sibling", () => {
    // `--color-primary-hover` must not count as a use of `--color-primary`.
    const usage = buildUsage(TOKENS, [
      { component: "Link", text: "a:hover { color: var(--color-primary-hover); }" },
    ]);
    expect(usage["color-primary"]).toBeUndefined();
  });

  it("lists each component once per token even with multiple references", () => {
    const usage = buildUsage(TOKENS, [
      { component: "Badge", text: "color: var(--color-primary); border-color: var(--color-primary);" },
    ]);
    expect(usage["color-primary"]).toHaveLength(1);
  });

  it("ignores tokens that are not referenced anywhere", () => {
    const usage = buildUsage(TOKENS, [{ component: "Empty", text: "<div />" }]);
    expect(usage["spacing-4"]).toBeUndefined();
  });
});
