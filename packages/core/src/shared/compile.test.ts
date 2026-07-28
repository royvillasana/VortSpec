import { describe, expect, it } from "vitest";
import { compileLightPage, isFullyDeterministic, type LightNode, type CompileOptions } from "./compile";

const OPTS: CompileOptions = {
  valueToTokenRef: new Map([
    ["#c53434", "var(--color-brand-primary)"],
    ["0.375rem", "var(--radius-md)"],
  ]),
  knownTokenValues: new Set(["#c53434", "0.375rem", "1rem"]),
};

// A section wrapping a Button component next to a plain styled div.
const PAGE: LightNode = {
  tag: "section",
  styles: { display: "flex", gap: "1rem" },
  children: [
    { tag: "div", component: "Button", props: { variant: "primary" } },
    { tag: "div", styles: { "background-color": "#c53434", "border-radius": "0.375rem" }, text: "Hi" },
  ],
};

describe("compileLightPage — component mapping (6.3)", () => {
  it("maps a data-component block to the real component usage by identity", () => {
    const r = compileLightPage(PAGE, OPTS);
    expect(r.code).toContain(`<Button variant="primary" />`);
    expect(r.usedComponents).toEqual(["Button"]);
  });

  it("emits a component with children when it has them", () => {
    const node: LightNode = { tag: "div", component: "Card", children: [{ tag: "p", text: "body" }] };
    const r = compileLightPage(node, OPTS);
    expect(r.code).toContain("<Card>");
    expect(r.code).toContain("</Card>");
    expect(r.code).toContain("<p>");
  });
});

describe("compileLightPage — token restoration (6.2)", () => {
  it("restores embedded values to token references, never inventing a token", () => {
    const r = compileLightPage(PAGE, OPTS);
    expect(r.code).toContain(`backgroundColor: "var(--color-brand-primary)"`);
    expect(r.code).toContain(`borderRadius: "var(--radius-md)"`);
    expect(r.deterministicCoverage.tokensRestored).toBe(2);
  });

  it("keeps a genuine layout literal (no matching token) as-is without a lint issue", () => {
    // gap:1rem — "1rem" is a known token value but has NO ref here → that's the leak case (see below).
    // display:flex is not a token value → legitimately literal, no lint.
    const layoutOnly: LightNode = { tag: "div", styles: { display: "flex" } };
    const r = compileLightPage(layoutOnly, OPTS);
    expect(r.code).toContain(`display: "flex"`);
    expect(r.lintIssues).toEqual([]);
    expect(r.deterministicCoverage.literalsKept).toBe(1);
  });
});

describe("compileLightPage — token-discipline lint (6.4)", () => {
  it("flags a known-token literal that leaked without a token reference", () => {
    // gap:1rem is a known token value but not in valueToTokenRef → it should have been a token.
    const r = compileLightPage(PAGE, OPTS);
    expect(r.lintIssues.some((i) => i.includes('"1rem"'))).toBe(true);
    expect(r.deterministicCoverage.residual.some((x) => x.includes("1rem"))).toBe(true);
    expect(isFullyDeterministic(r)).toBe(false);
  });

  it("is fully deterministic when every token value maps and nothing leaks", () => {
    const clean: LightNode = {
      tag: "section",
      styles: { display: "flex" },
      children: [{ tag: "div", component: "Button", props: { variant: "primary" } }, { tag: "div", styles: { "background-color": "#c53434" } }],
    };
    const r = compileLightPage(clean, OPTS);
    expect(r.lintIssues).toEqual([]);
    expect(isFullyDeterministic(r)).toBe(true);
    expect(r.deterministicCoverage).toMatchObject({ tokensRestored: 1, componentsMapped: 1 });
  });
});

describe("compileLightPage — structure + safety", () => {
  it("produces valid JSX nesting for a mixed tree", () => {
    const r = compileLightPage(PAGE, OPTS);
    expect(r.code).toContain("<section");
    expect(r.code.trim().startsWith("<section")).toBe(true);
    expect(r.code.trim().endsWith("</section>")).toBe(true);
  });

  it("escapes text and JSX-hostile characters, and falls back to div for a bad tag", () => {
    const node: LightNode = { tag: "b@d", text: "a < b {x}" };
    const r = compileLightPage(node, OPTS);
    expect(r.code).toContain("<div>");
    expect(r.code).toContain("a &lt; b &#123;x&#125;");
  });

  it("records distinct used components across a tree (for imports + the compile gate)", () => {
    const node: LightNode = {
      tag: "div",
      children: [
        { tag: "div", component: "Button", props: { variant: "primary" } },
        { tag: "div", component: "Button", props: { variant: "ghost" } },
        { tag: "div", component: "Card" },
      ],
    };
    expect(compileLightPage(node, OPTS).usedComponents.sort()).toEqual(["Button", "Card"]);
  });
});
