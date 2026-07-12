import { describe, expect, it } from "vitest";
import { parseProps } from "./component-reader";

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
