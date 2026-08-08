import { describe, expect, it } from "vitest";
import { kebabProperty, opaqueUtilities, tokenApplications } from "./token-application";

const find = (source: string, token: string) =>
  tokenApplications(source).filter((a) => a.token === token);

describe("where a token landed (task 4.3)", () => {
  it("reads a plain CSS declaration", () => {
    expect(tokenApplications(".a { color: var(--color-fg); }")).toEqual([
      { token: "color-fg", property: "color", syntax: "css" },
    ]);
  });

  it("normalizes a JSX style object's camelCase to the CSS property", () => {
    const apps = tokenApplications('<div style={{ backgroundColor: "var(--color-surface)" }} />');
    expect(apps).toEqual([{ token: "color-surface", property: "background-color", syntax: "jsx-style" }]);
  });

  it("derives the property from a Tailwind utility", () => {
    const apps = tokenApplications('<div className="bg-[var(--color-surface)] text-[var(--color-fg)]" />');
    expect(apps).toEqual([
      { token: "color-fg", property: "color", syntax: "tailwind" },
      { token: "color-surface", property: "background-color", syntax: "tailwind" },
    ]);
  });

  it("takes the longest utility prefix, so min-h is a min-height", () => {
    expect(find('<div className="min-h-[var(--size-screen)]" />', "size-screen")[0]?.property).toBe("min-height");
  });

  it("SKIPS a utility whose property is ambiguous rather than guessing one", () => {
    // `ring` and `divide` each expand to several declarations. A made-up property in a finding is
    // worse than a missing finding, because someone acts on it.
    expect(find('<div className="ring-[var(--color-focus)]" />', "color-focus")).toEqual([]);
  });

  it("ignores a custom-property DEFINITION — nothing is being styled there", () => {
    // Otherwise every alias in a token file reads as a placement, and the whole token file becomes
    // a wall of governance violations.
    expect(tokenApplications(":root { --brand: var(--blue-500); }")).toEqual([]);
  });

  it("still reports a definition's CONSUMER", () => {
    const apps = tokenApplications(":root { --brand: var(--blue-500); }\n.a { color: var(--brand); }");
    expect(apps).toEqual([{ token: "brand", property: "color", syntax: "css" }]);
  });

  it("reads a Sass-style token", () => {
    expect(tokenApplications(".a { color: $brand-fg; }")).toEqual([
      { token: "brand-fg", property: "color", syntax: "css" },
    ]);
  });

  it("counts one decision once, however many variants repeat it", () => {
    // Severity must not become a function of how many variants a component happens to have.
    const source = `
      const v = cva("", { variants: { tone: {
        a: "bg-[var(--color-surface)]",
        b: "bg-[var(--color-surface)]",
        c: "bg-[var(--color-surface)]",
      } } });`;
    expect(find(source, "color-surface")).toHaveLength(1);
  });

  it("distinguishes the same token on two different properties", () => {
    const apps = find(".a { color: var(--x); border-color: var(--x); }", "x");
    expect(apps.map((a) => a.property).sort()).toEqual(["border-color", "color"]);
  });

  it("finds nothing in a source with no tokens", () => {
    expect(tokenApplications('<div className="flex gap-2" style={{ color: "#fff" }} />')).toEqual([]);
  });
});

describe("kebabProperty", () => {
  it("converts camelCase and leaves kebab alone", () => {
    expect(kebabProperty("backgroundColor")).toBe("background-color");
    expect(kebabProperty("background-color")).toBe("background-color");
    expect(kebabProperty("borderTopLeftRadius")).toBe("border-top-left-radius");
  });
});

describe("styling the rules cannot read (task 6.7)", () => {
  it("flags a theme-mapped utility, which names a property but not a token", () => {
    expect(opaqueUtilities('<div className="bg-primary" />')).toEqual([
      { className: "bg-primary", property: "background-color" },
    ]);
  });

  it("says nothing about an arbitrary value, which IS readable", () => {
    expect(opaqueUtilities('<div className="bg-[var(--color-surface)]" />')).toEqual([]);
  });

  it("ignores values that are plainly not design tokens", () => {
    // Over-reporting would put every layout class into a coverage warning, and the warning would
    // stop being read.
    expect(opaqueUtilities('<div className="w-full h-screen m-auto p-px" />')).toEqual([]);
  });

  it("ignores a utility whose property is not in the table", () => {
    expect(opaqueUtilities('<div className="flex items-center ring-2" />')).toEqual([]);
  });

  it("counts a class once however often it appears", () => {
    expect(opaqueUtilities('a="bg-primary" b="bg-primary" c="bg-primary"')).toHaveLength(1);
  });

  it("finds nothing in a component with no styling", () => {
    expect(opaqueUtilities("export const X = () => <div />;")).toEqual([]);
  });
});
