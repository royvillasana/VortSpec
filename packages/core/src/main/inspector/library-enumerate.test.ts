import { describe, expect, it } from "vitest";
import { enumerateComponentFromDts, stringLiteralUnion } from "./library-enumerate";

describe("stringLiteralUnion", () => {
  it("extracts a string-literal union", () => {
    expect(stringLiteralUnion('"text" | "outlined" | "contained"')).toEqual(["text", "outlined", "contained"]);
  });
  it("ignores non-unions, single literals, and non-string unions", () => {
    expect(stringLiteralUnion("string")).toEqual([]);
    expect(stringLiteralUnion('"only"')).toEqual([]);
    expect(stringLiteralUnion("number | string")).toEqual([]);
  });
});

describe("enumerateComponentFromDts", () => {
  const dts = `
    export interface ButtonProps {
      variant?: "text" | "outlined" | "contained";
      size?: "small" | "medium" | "large";
      disabled?: boolean;
      label: string;
    }
    export declare const Button: (props: ButtonProps) => JSX.Element;
  `;

  it("extracts props + string-literal variants from <Component>Props", () => {
    const r = enumerateComponentFromDts(dts, "Button");
    expect(r.component).toBe("Button");
    const variant = r.props.find((p) => p.name === "variant");
    expect(variant?.variants).toEqual(["text", "outlined", "contained"]);
    expect(variant?.optional).toBe(true);
    const label = r.props.find((p) => p.name === "label");
    expect(label?.optional).toBe(false);
    expect(label?.variants).toBeUndefined();
  });

  it("returns empty props when the <Component>Props interface is absent", () => {
    expect(enumerateComponentFromDts("export declare const x: number;", "Button").props).toEqual([]);
  });
});
