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

  it("counts semantic Tailwind classes that resolve to a token through the theme", () => {
    // The real-world case that reported zero uses: idiomatic classes, no literal var().
    const usage = buildUsage(TOKENS, [
      {
        component: "Button",
        text: `export const Button = () => <button className="bg-primary text-text rounded-8 p-4">Go</button>;`,
      },
    ]);
    expect(usage["color-primary"]).toEqual([{ component: "Button", property: "bg" }]);
    expect(usage["color-text"]).toEqual([{ component: "Button", property: "text" }]);
    expect(usage["radius-8"]).toEqual([{ component: "Button", property: "rounded" }]);
    expect(usage["spacing-4"]).toEqual([{ component: "Button", property: "p" }]);
  });

  it("sees classes through variant + opacity modifiers", () => {
    const usage = buildUsage(TOKENS, [
      { component: "Card", text: `<div className="hover:bg-primary md:gap-4 text-text/70" />` },
    ]);
    expect(usage["color-primary"]).toEqual([{ component: "Card", property: "bg" }]);
    expect(usage["spacing-4"]).toEqual([{ component: "Card", property: "gap" }]);
    expect(usage["color-text"]).toEqual([{ component: "Card", property: "text" }]);
  });

  it("does not match a class whose key belongs to a longer-named token", () => {
    // `bg-primary-hover` (a distinct token) must not count as a use of `color-primary`.
    const usage = buildUsage(TOKENS, [
      { component: "Link", text: `<a className="bg-primary-hover" />` },
    ]);
    expect(usage["color-primary"]).toBeUndefined();
  });

  it("still lists a component once per token when used via class and var()", () => {
    const usage = buildUsage(TOKENS, [
      { component: "Badge", text: `<span className="bg-primary" style={{ color: "var(--color-primary)" }} />` },
    ]);
    expect(usage["color-primary"]).toHaveLength(1);
  });
});

describe("buildUsage — Tailwind v3 config-mapped classes", () => {
  // Real v3 shape: arbitrary token names wired to arbitrary utility keys in the config.
  // Neither the literal `--` scan nor the v4 namespace map can see these — only the config does.
  const V3_TOKENS = [
    "theme-primary",
    "button-primary-background-hover",
    "color-status-danger",
    "color-neutral-100",
    "spacing-24",
    "radius-8",
  ];
  const CONFIG = `
    module.exports = {
      theme: {
        extend: {
          colors: {
            primary: {
              DEFAULT: 'var(--theme-primary)',
              hover: 'var(--button-primary-background-hover)',
            },
            danger: 'var(--color-status-danger)',
            neutral: { 100: 'var(--color-neutral-100)' },
          },
          spacing: { 6: 'var(--spacing-24)' },
          borderRadius: { md: 'var(--radius-8)' },
        },
      },
    };
  `;

  it("maps a nested DEFAULT color key to its bare utility (bg-primary → --theme-primary)", () => {
    const usage = buildUsage(
      V3_TOKENS,
      [{ component: "Button", text: `<button className="bg-primary text-primary border-primary" />` }],
      CONFIG,
    );
    expect(usage["theme-primary"]).toEqual([{ component: "Button", property: "bg" }]);
  });

  it("maps a nested sub-key to the suffixed utility (bg-primary-hover → --button-primary-background-hover)", () => {
    const usage = buildUsage(
      V3_TOKENS,
      [{ component: "Button", text: `<button className="hover:bg-primary-hover" />` }],
      CONFIG,
    );
    expect(usage["button-primary-background-hover"]).toEqual([{ component: "Button", property: "bg" }]);
    // …and the sub-key must NOT be mistaken for the DEFAULT token.
    expect(usage["theme-primary"]).toBeUndefined();
  });

  it("maps flat color, numeric shade, spacing and radius keys", () => {
    const usage = buildUsage(
      V3_TOKENS,
      [{ component: "Card", text: `<div className="bg-danger bg-neutral-100 p-6 gap-6 rounded-md" />` }],
      CONFIG,
    );
    expect(usage["color-status-danger"]).toEqual([{ component: "Card", property: "bg" }]);
    expect(usage["color-neutral-100"]).toEqual([{ component: "Card", property: "bg" }]);
    expect(usage["spacing-24"]).toEqual([{ component: "Card", property: "p" }]);
    expect(usage["radius-8"]).toEqual([{ component: "Card", property: "rounded" }]);
  });

  it("tolerates comments in the config", () => {
    const withComments = `
      module.exports = {
        theme: { extend: { colors: {
          // primary brand color
          primary: { DEFAULT: 'var(--theme-primary)' }, /* status */ danger: 'var(--color-status-danger)',
        } } },
      };`;
    const usage = buildUsage(V3_TOKENS, [{ component: "X", text: `<x className="bg-primary bg-danger" />` }], withComments);
    expect(usage["theme-primary"]).toBeDefined();
    expect(usage["color-status-danger"]).toBeDefined();
  });

  it("no config → falls back to the v4 namespace behavior unchanged", () => {
    const usage = buildUsage(["color-primary"], [{ component: "B", text: `<b className="bg-primary" />` }]);
    // v4 convention: token `color-primary` → class `bg-primary`.
    expect(usage["color-primary"]).toEqual([{ component: "B", property: "bg" }]);
  });
});
