import { describe, expect, it } from "vitest";
import { buildPropsGlossary, glossaryDigestLines, normaliseType, type GlossaryInput } from "./props-glossary";

const p = (name: string, type: string, values: string[] = []) => ({ name, type, values });

describe("the props glossary (task 9b.1)", () => {
  it("indexes a prop across every component that declares it", () => {
    const g = buildPropsGlossary([
      { component: "Button", props: [p("variant", "enum", ["primary", "ghost"])] },
      { component: "Badge", props: [p("variant", "enum", ["primary"])] },
    ]);
    const variant = g.entries.find((e) => e.prop === "variant")!;
    expect(variant.components).toEqual(["Badge", "Button"]);
    expect(variant.values).toEqual(["ghost", "primary"]);
    expect(variant.conflict).toBe(false);
  });

  it("flags the SAME name declared with different types", () => {
    // The bug the glossary exists to surface: a generator seeing disagreement picks one, or invents
    // a fourth spelling to sidestep it.
    const g = buildPropsGlossary([
      { component: "Button", props: [p("size", "enum", ["sm", "lg"])] },
      { component: "Icon", props: [p("size", "number")] },
    ]);
    expect(g.conflicts.map((e) => e.prop)).toEqual(["size"]);
    expect(g.conflicts[0]?.types).toEqual(["enum", "number"]);
  });

  it("reports a partial enum SEPARATELY from a type conflict", () => {
    // A Badge reasonably has fewer sizes than a Button. Folding this in with type conflicts would
    // bury the real bugs under defensible differences.
    const g = buildPropsGlossary([
      { component: "Button", props: [p("size", "enum", ["sm", "md", "lg"])] },
      { component: "Badge", props: [p("size", "enum", ["sm", "md"])] },
    ]);
    const size = g.entries.find((e) => e.prop === "size")!;
    expect(size.conflict).toBe(false);
    expect(size.divergentValues).toEqual(["lg"]);
    expect(g.conflicts).toEqual([]);
  });

  it("treats a TS union of literals and a detected enum as the same type", () => {
    const g = buildPropsGlossary([
      { component: "Button", props: [p("tone", '"a" | "b"')] },
      { component: "Chip", props: [p("tone", "enum", ["a", "b"])] },
    ]);
    expect(g.entries.find((e) => e.prop === "tone")?.conflict).toBe(false);
  });

  it("ignores props that are universal by nature", () => {
    // className is a string everywhere; permanent noise at the top of a list is how the list dies.
    const g = buildPropsGlossary([
      { component: "Button", props: [p("className", "string"), p("children", "ReactNode")] },
      { component: "Badge", props: [p("className", "text"), p("children", "string")] },
    ]);
    expect(g.entries).toEqual([]);
  });

  it("counts a component once even if its prop is declared twice", () => {
    const g = buildPropsGlossary([
      { component: "Button", props: [p("variant", "enum", ["a"]), p("variant", "text")] },
    ]);
    const variant = g.entries.find((e) => e.prop === "variant")!;
    expect(variant.components).toEqual(["Button"]);
    expect(variant.conflict).toBe(false);
  });

  it("orders by how widely a prop is used", () => {
    const inputs: GlossaryInput[] = [
      { component: "A", props: [p("common", "text"), p("rare", "text")] },
      { component: "B", props: [p("common", "text")] },
      { component: "C", props: [p("common", "text")] },
    ];
    expect(buildPropsGlossary(inputs).entries[0]?.prop).toBe("common");
  });
});

describe("what reaches the digest", () => {
  it("carries CONFLICTS only, never the whole table", () => {
    const g = buildPropsGlossary([
      { component: "Button", props: [p("size", "enum", ["sm"]), p("label", "text")] },
      { component: "Icon", props: [p("size", "number")] },
    ]);
    const lines = glossaryDigestLines(g).join("\n");
    expect(lines).toContain("size: enum vs number");
    expect(lines).not.toContain("label");
  });

  it("adds NOTHING when every prop agrees", () => {
    // Prepending sixty prop names to every grounded run would spend the index's savings on a
    // reference the run has no reason to read.
    const g = buildPropsGlossary([{ component: "Button", props: [p("variant", "enum", ["a"])] }]);
    expect(glossaryDigestLines(g)).toEqual([]);
  });

  it("bounds the list and says what it omitted", () => {
    const many: GlossaryInput[] = [];
    for (let i = 0; i < 20; i++) {
      many.push({ component: `A${i}`, props: [{ name: `p${i}`, type: "enum", values: ["x"] }] });
      many.push({ component: `B${i}`, props: [{ name: `p${i}`, type: "number", values: [] }] });
    }
    const lines = glossaryDigestLines(buildPropsGlossary(many)).join("\n");
    expect(lines).toContain("+8 more");
    expect(lines).toContain("props-glossary.toon");
  });
});

describe("normaliseType", () => {
  it("makes differently-spelled equivalents comparable", () => {
    expect(normaliseType("bool", [])).toBe("boolean");
    expect(normaliseType("string", [])).toBe("text");
    expect(normaliseType("anything", ["a"])).toBe("enum");
    expect(normaliseType("", [])).toBe("unknown");
  });
});
