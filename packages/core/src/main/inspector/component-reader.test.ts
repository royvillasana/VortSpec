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
