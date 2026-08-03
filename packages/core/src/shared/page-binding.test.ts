import { describe, expect, it } from "vitest";
import { buildLightPagePrompt } from "./light-page";
import { declaredTokens, pageBinding, referencedTokens } from "./page-binding";

/**
 * Whether a composed page is joined to the design system or merely resembles it.
 *
 * The failure this guards against is silent by construction: a page styled with the design system's
 * VALUES, copied under names of its own, renders identically to a bound one. Nothing looks wrong until a
 * token edit reaches nothing.
 */

const DS = ["color-accent", "color-text-primary", "radius-element", "radius-full", "spacing-2"];

describe("reading a page's tokens", () => {
  it("finds references and ignores repeats", () => {
    expect(referencedTokens("a{color:var(--color-accent)}b{fill:var( --color-accent )}")).toEqual([
      "color-accent",
    ]);
  });

  it("finds a reference that carries a fallback", () => {
    // The form the prompt now asks for: bound AND standalone.
    expect(referencedTokens("a{border-radius:var(--radius-element, 10px)}")).toEqual(["radius-element"]);
  });

  it("tells a declaration apart from a reference", () => {
    const css = ":root{--radius-pill:999px}a{border-radius:var(--radius-pill)}";
    expect(declaredTokens(css)).toEqual(["radius-pill"]);
    expect(referencedTokens(css)).toEqual(["radius-pill"]);
  });

  it("does not mistake a reference for a declaration", () => {
    expect(declaredTokens("a{color:var(--color-accent)}")).toEqual([]);
  });
});

describe("binding a page against the design system", () => {
  it("counts a bound page as bound", () => {
    const html = `<button style="background:var(--color-accent,#5433eb);border-radius:var(--radius-element,10px)">x</button>`;
    const b = pageBinding(html, DS);
    expect(b.bound).toEqual(["color-accent", "radius-element"]);
    expect(b.unbound).toEqual([]);
    expect(b.ratio).toBe(1);
  });

  it("catches the severed page that still renders correctly", () => {
    // Exactly the shape a real composed page took: its own names, its own :root, and a button that
    // looks right on screen while being joined to nothing.
    const html = `<style>:root{--radius-pill:999px;--space-2:8px}
      [data-component="Button"]{gap:var(--space-2);border-radius:var(--radius-pill);background:var(--color-accent)}</style>`;
    const b = pageBinding(html, DS);
    expect(b.unbound).toEqual(["space-2", "radius-pill"]);
    expect(b.bound).toEqual(["color-accent"]);
    expect(b.ratio).toBeCloseTo(1 / 3);
  });

  it("does not count a page's own declaration as binding it", () => {
    // Declaring `--radius-pill` locally does not make it part of the design system. Counting it as bound
    // would report the severance as success.
    const b = pageBinding(":root{--radius-pill:999px}a{border-radius:var(--radius-pill)}", DS);
    expect(b.bound).toEqual([]);
    expect(b.declared).toEqual(["radius-pill"]);
  });

  it("distinguishes a page with nothing to bind from one bound to nothing", () => {
    // 0% bound and "no tokens at all" are different facts and must not read the same.
    expect(pageBinding("<p>hello</p>", DS).ratio).toBeNull();
    expect(pageBinding("a{color:var(--nope)}", DS).ratio).toBe(0);
  });
});

describe("the compose prompt asks for bound references", () => {
  // Collapsed: the prompt is assembled line by line, and a rule should not be assertable only while
  // its wording happens to fit one line.
  const prompt = buildLightPagePrompt("Home", "a landing page").replace(/\s+/g, " ");

  it("asks for the token reference WITH a fallback, not the value alone", () => {
    expect(prompt).toContain("var(--<token-name>, <resolved value>)");
  });

  it("says why both halves are needed, so the rule survives an edit", () => {
    expect(prompt).toMatch(/binds the page to the design system/i);
    expect(prompt).toMatch(/rendering standalone/i);
  });

  it("forbids re-naming a value the design system already names", () => {
    expect(prompt).toMatch(/Do NOT declare your own name/i);
  });

  it("no longer tells the composer to style with resolved values alone", () => {
    expect(prompt).not.toMatch(/Style with the tokens' RESOLVED values/);
  });
});
