import { describe, expect, it } from "vitest";
import { parseProps, componentDeps, reportUnresolved } from "./component-reader";

// Mirrors the real Button.variants.ts shape (CVA with string values containing `:`).
const CVA = `
export const buttonVariants = cva(
  'inline-flex items-center focus-visible:ring-2 disabled:opacity-disabled',
  {
    variants: {
      variant: {
        base: 'bg-neutral-600 text-white hover:brightness-95',
        primary: 'bg-primary text-white hover:bg-primary-hover',
        link: 'bg-transparent text-primary hover:underline',
      },
      size: {
        small: 'text-body rounded-sm px-2 py-1',
        medium: 'text-body rounded px-3 py-1.5',
        large: 'text-body rounded px-4 py-2',
      },
      outline: { true: 'bg-transparent', false: '' },
    },
    defaultVariants: { variant: 'base', size: 'medium', outline: false },
  },
);
`;

describe("reportUnresolved — a visual mismatch is never masked as verified", () => {
  it("clean PASS with all layers passing → verified", () => {
    const r = "VISUAL: pass\nTOKEN: pass\nCODE: pass\nVERIFY: PASS\n";
    expect(reportUnresolved(r)).toEqual({ unresolved: false, issues: [] });
  });

  it("a failed VISUAL layer keeps it out of verified even when it compiles", () => {
    const r = "VISUAL: fail — missing icon slot, wrong container shape\nTOKEN: pass\nCODE: pass\nVERIFY: ISSUES (visual)\n";
    const v = reportUnresolved(r);
    expect(v.unresolved).toBe(true);
    expect(v.issues.join(" ")).toMatch(/VISUAL: fail/);
  });

  it("a BLOCKED visual layer (no render) is unresolved", () => {
    const r = "VISUAL: blocked\nTOKEN: pass\nCODE: pass\nVERIFY: BLOCKED (no preview server)\n";
    expect(reportUnresolved(r).unresolved).toBe(true);
  });

  it("still honors the legacy 'status: open' marker", () => {
    expect(reportUnresolved("### D1 something\nstatus: open\n").unresolved).toBe(true);
  });

  it("tolerates list/blockquote prefixes on the machine-readable lines", () => {
    expect(reportUnresolved("- VISUAL: fail\n- TOKEN: pass\n").unresolved).toBe(true);
    expect(reportUnresolved("> VERIFY: ISSUES (token)\n").unresolved).toBe(true);
  });
});

describe("componentDeps (dependency graph, Plan B1c)", () => {
  const roster = ["Button", "Icon", "ButtonGroup", "Card"];
  it("collects roster components used as JSX tags, normalized and sorted", () => {
    const src = `export const Toolbar = () => (<div><Button/><Icon name="x"/></div>);`;
    expect(componentDeps(src, roster, "Toolbar")).toEqual(["button", "icon"]);
  });
  it("excludes the component itself", () => {
    const src = `export const Card = () => (<Card><Button/></Card>);`;
    expect(componentDeps(src, roster, "Card")).toEqual(["button"]);
  });
  it("is word-bounded — `<Button` does not match `<ButtonGroup`", () => {
    const src = `export const X = () => (<ButtonGroup/>);`;
    expect(componentDeps(src, roster, "X")).toEqual(["buttongroup"]);
  });
});

describe("parseProps (CVA)", () => {
  const props = parseProps(CVA);
  const byKey = new Map(props.map((p) => [p.key, p]));

  it("extracts every variant group as a prop", () => {
    expect(props.map((p) => p.key).sort()).toEqual(["outline", "size", "variant"]);
  });

  it("does not mistake `hover:`/`focus-visible:` inside class strings for options", () => {
    expect(byKey.get("variant")?.options).toEqual(["base", "primary", "link"]);
  });

  it("classifies a true/false group as a boolean", () => {
    expect(byKey.get("outline")?.kind).toBe("boolean");
    expect(byKey.get("size")?.kind).toBe("enum");
  });

  it("reads defaults from defaultVariants", () => {
    expect(byKey.get("variant")?.defaultValue).toBe("base");
    expect(byKey.get("size")?.defaultValue).toBe("medium");
  });

  it("captures each option's class string (for live variant preview)", () => {
    expect(byKey.get("variant")?.classes.primary).toBe("bg-primary text-white hover:bg-primary-hover");
    expect(byKey.get("variant")?.classes.base).toBe("bg-neutral-600 text-white hover:brightness-95");
  });

  it("returns nothing when there is no variants block", () => {
    expect(parseProps("export const x = 1;")).toEqual([]);
  });
});

// Option values that aren't plain string literals, plus a compoundVariants array.
const NESTED = `
export const cardVariants = cva('rounded', {
  variants: {
    tone: {
      // a cn()/clsx() call with multiple string args
      solid: cn('bg-primary text-white', 'shadow-md'),
      // an array of classes
      soft: ['bg-primary/10', 'text-primary'],
      // a multi-line template literal
      ghost: \`
        bg-transparent
        text-primary
      \`,
    },
    size: {
      sm: 'p-2',
      lg: 'p-6',
    },
  },
  compoundVariants: [
    { tone: 'solid', size: 'lg', class: 'ring-2 ring-primary' },
    { tone: 'soft', size: 'sm', className: 'ring-1' },
  ],
  defaultVariants: { tone: 'solid', size: 'sm' },
});
`;

describe("parseProps (nested values + compoundVariants)", () => {
  const props = parseProps(NESTED);
  const byKey = new Map(props.map((p) => [p.key, p]));

  it("extracts base variant groups without leaking compoundVariants", () => {
    expect(props.map((p) => p.key).sort()).toEqual(["size", "tone"]);
  });

  it("reads options whose value is a cn() call, array, or multi-line template", () => {
    expect(byKey.get("tone")?.options).toEqual(["solid", "soft", "ghost"]);
  });

  it("recovers the class string from a cn() call (joins the literals)", () => {
    expect(byKey.get("tone")?.classes.solid).toBe("bg-primary text-white shadow-md");
  });

  it("recovers classes from an array value", () => {
    expect(byKey.get("tone")?.classes.soft).toBe("bg-primary/10 text-primary");
  });

  it("recovers classes from a multi-line template literal (collapsed whitespace)", () => {
    expect(byKey.get("tone")?.classes.ghost).toBe("bg-transparent text-primary");
  });

  it("still reads defaults with compoundVariants present", () => {
    expect(byKey.get("tone")?.defaultValue).toBe("solid");
    expect(byKey.get("size")?.defaultValue).toBe("sm");
  });
});

describe("parseProps (robustness)", () => {
  it("never throws on malformed source (returns best-effort/empty)", () => {
    expect(() => parseProps("variants: { a: { ")).not.toThrow();
    expect(() => parseProps("variants: {}")).not.toThrow();
  });
});
