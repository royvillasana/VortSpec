import { describe, it, expect } from "vitest";
import {
  bridgeTreeSchema,
  nodeReadoutSchema,
  selectionSchema,
  bridgeCommandSchema,
  bridgeEventSchema,
} from "./inspector-bridge";

describe("inspector-bridge contracts", () => {
  it("parses a flat node tree and applies defaults", () => {
    const tree = bridgeTreeSchema.parse({
      roots: ["n0"],
      nodes: { n0: { id: "n0", tag: "div", childCount: 1 }, n1: { id: "n1", tag: "button" } },
      children: { n0: ["n1"] },
    });
    expect(tree.roots).toEqual(["n0"]);
    expect(tree.nodes.n0.classes).toEqual([]); // default applied
    expect(tree.nodes.n1.childCount).toBe(0); // default applied
    expect(tree.children.n0).toEqual(["n1"]);
  });

  it("parses a node readout with computed style and custom props", () => {
    const r = nodeReadoutSchema.parse({
      nodeId: "n1",
      rect: { x: 0, y: 0, width: 108, height: 38 },
      computed: { "padding-left": "12px", "border-radius": "8px" },
      customProps: { "--radius-md": "8px" },
      dataComponent: "button",
      className: "btn btn--secondary",
    });
    expect(r.computed["border-radius"]).toBe("8px");
    expect(r.customProps["--radius-md"]).toBe("8px");
    expect(r.dataComponent).toBe("button");
  });

  it("parses a Selection view-model with ordered Figma sections", () => {
    const sel = selectionSchema.parse({
      nodeId: "n1",
      label: "button",
      component: "Button",
      file: "src/components/Button.tsx",
      rect: { x: 1362, y: 30, width: 108, height: 38 },
      variants: [
        { key: "size", kind: "enum", options: ["small", "medium", "large"], current: "medium" },
      ],
      sections: [
        {
          id: "layout",
          title: "Layout",
          fields: [
            { key: "gap", label: "Gap", kind: "length", value: "8px", token: "space-2", unit: "px" },
            { key: "padding-left", label: "Padding", kind: "length", value: "12px" },
          ],
        },
      ],
    });
    expect(sel.variants[0].current).toBe("medium");
    expect(sel.sections[0].fields[0].token).toBe("space-2");
    expect(sel.sections[0].fields[1].token).toBeNull(); // literal default
  });

  it("discriminates host commands", () => {
    expect(bridgeCommandSchema.parse({ t: "requestTree" }).t).toBe("requestTree");
    const apply = bridgeCommandSchema.parse({
      t: "applyOverride",
      nodeId: "n1",
      css: { "border-radius": "12px" },
    });
    expect(apply).toMatchObject({ t: "applyOverride", nodeId: "n1" });
    // clearOverride may omit nodeId (clear all)
    expect(bridgeCommandSchema.parse({ t: "clearOverride" }).t).toBe("clearOverride");
  });

  it("discriminates guest events", () => {
    expect(bridgeEventSchema.parse({ t: "ready", ok: true }).t).toBe("ready");
    const geo = bridgeEventSchema.parse({
      t: "geometry",
      nodeId: "n1",
      rect: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(geo).toMatchObject({ t: "geometry", nodeId: "n1" });
  });

  it("parses inspect-mode commands and hover events", () => {
    expect(bridgeCommandSchema.parse({ t: "setMode", mode: "inspect" })).toMatchObject({ mode: "inspect" });
    expect(() => bridgeCommandSchema.parse({ t: "setMode", mode: "nope" })).toThrow();
    // hovered may carry a rect, or be a clear (null id, no rect)
    expect(bridgeEventSchema.parse({ t: "hovered", nodeId: null }).t).toBe("hovered");
    const h = bridgeEventSchema.parse({
      t: "hovered",
      nodeId: "n2",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(h).toMatchObject({ t: "hovered", nodeId: "n2" });
  });

  it("rejects an unknown command discriminant", () => {
    expect(() => bridgeCommandSchema.parse({ t: "nope" })).toThrow();
  });
});
