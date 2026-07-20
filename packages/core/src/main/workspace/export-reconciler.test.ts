import { describe, it, expect } from "vitest";
import { parseModuleExports, reconcileImports, type ModuleExports } from "./export-reconciler";

const named = (...names: string[]): ModuleExports => ({ default: null, named: new Set(names) });
const def = (name: string): ModuleExports => ({ default: name, named: new Set() });

describe("parseModuleExports", () => {
  it("reads a default export", () => {
    expect(parseModuleExports("export default Icon;").default).toBe("Icon");
    expect(parseModuleExports("export default function Icon() {}").default).toBe("Icon");
  });
  it("reads named exports from const/function and export lists", () => {
    const e = parseModuleExports("export const Button = 1;\nexport { fooCva, Bar as Baz };");
    expect([...e.named].sort()).toEqual(["Baz", "Button", "fooCva"]);
  });
});

describe("reconcileImports — repair default↔named mismatches", () => {
  it("fixes a named import of a default export", () => {
    const src = `import { Icon } from "./icon";`;
    const { code, changes } = reconcileImports(src, (rel) => (rel === "./icon" ? def("Icon") : null));
    expect(code).toBe(`import Icon from "./icon";`);
    expect(changes).toHaveLength(1);
  });

  it("fixes a default import of a named export", () => {
    const src = `import Button from "../atoms/button";`;
    const { code } = reconcileImports(src, (rel) =>
      rel === "../atoms/button" ? named("Button", "buttonCva") : null,
    );
    expect(code).toBe(`import { Button } from "../atoms/button";`);
  });

  it("leaves an already-correct import unchanged", () => {
    const src = `import { Button } from "./button";`;
    const { code, changes } = reconcileImports(src, () => named("Button"));
    expect(code).toBe(src);
    expect(changes).toHaveLength(0);
  });

  it("does not touch imports it cannot resolve", () => {
    const src = `import { Whatever } from "./nope";`;
    const { code, changes } = reconcileImports(src, () => null);
    expect(code).toBe(src);
    expect(changes).toHaveLength(0);
  });

  it("leaves a name that is neither a named nor default export alone", () => {
    const src = `import { Ghost } from "./mod";`;
    const { code } = reconcileImports(src, () => def("Real"));
    expect(code).toBe(src);
  });

  it("ignores non-relative and multi-name imports", () => {
    const pkg = `import { useState } from "react";`;
    const multi = `import { A, B } from "./mod";`;
    const l = () => def("A");
    expect(reconcileImports(pkg, l).code).toBe(pkg);
    expect(reconcileImports(multi, l).code).toBe(multi);
  });
});
