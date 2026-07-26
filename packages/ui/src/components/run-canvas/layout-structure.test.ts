import { describe, expect, it } from "vitest";
import { isLayoutContainer, axisOf, classifyRole, structuralUnit, canContain } from "./layout-structure";
import type { Projection, ProjectedNode } from "./node-tree";

const rect = { x: 0, y: 0, width: 1, height: 1 };
function node(p: Partial<ProjectedNode> & { id: string }): ProjectedNode {
  return {
    fingerprint: p.id,
    parentId: null,
    childIds: [],
    rect,
    computed: {},
    tag: "div",
    className: "",
    dataSource: null,
    dataDriven: false,
    component: "",
    text: "",
    style: {},
    ...p,
  };
}
function projection(nodes: ProjectedNode[]): Projection {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { root: byId.get("root") ?? nodes[0] ?? null, byId };
}

// A realistic page: main(flex-col) > section(flex-row) > [ col.a(flex-col) > card > btn , col.b > img ]
// - main is the outermost layout container (the "main container")
// - section is a layout child of main (a "section")
// - col.a / col.b are deeper flex boxes (row/column cells)
// - card is a plain wrapper div (NOT flex) around btn
const PAGE: ProjectedNode[] = [
  node({ id: "root", tag: "main", className: "page", computed: { display: "flex", "flex-direction": "column" }, childIds: ["section"] }),
  node({ id: "section", className: "hero", parentId: "root", computed: { display: "flex", "flex-direction": "row" }, childIds: ["colA", "colB"] }),
  node({ id: "colA", className: "col", parentId: "section", computed: { display: "flex", "flex-direction": "column" }, childIds: ["card"] }),
  node({ id: "card", className: "card", parentId: "colA", childIds: ["btn"] }), // plain wrapper (no flex)
  node({ id: "btn", tag: "button", className: "cta", parentId: "card" }),
  node({ id: "colB", className: "col", parentId: "section", computed: { display: "flex", "flex-direction": "row" }, childIds: ["img"] }),
  node({ id: "img", tag: "img", parentId: "colB" }),
];
const P = projection(PAGE);

describe("isLayoutContainer + axisOf", () => {
  it("a flex/grid box with children is a layout container; a plain div or leaf is not", () => {
    expect(isLayoutContainer(P.byId.get("section")!)).toBe(true);
    expect(isLayoutContainer(P.byId.get("card")!)).toBe(false); // plain wrapper, no display:flex
    expect(isLayoutContainer(P.byId.get("btn")!)).toBe(false); // leaf
  });
  it("a flex container with no children is not a layout container", () => {
    expect(isLayoutContainer(node({ id: "x", computed: { display: "flex" } }))).toBe(false);
  });
  it("axis follows flex-direction (grid uses grid-auto-flow)", () => {
    expect(axisOf(P.byId.get("root")!)).toBe("column");
    expect(axisOf(P.byId.get("section")!)).toBe("row");
    expect(axisOf(node({ id: "g", computed: { display: "grid", "grid-auto-flow": "column" }, childIds: ["a"] }))).toBe("column");
  });
});

describe("classifyRole — main → section → row/column → content", () => {
  it("the outermost layout container is the main container", () => {
    expect(classifyRole(P, "root")).toBe("container");
  });
  it("a layout child of the main container is a section", () => {
    expect(classifyRole(P, "section")).toBe("section");
  });
  it("deeper flex boxes are rows/columns by axis", () => {
    expect(classifyRole(P, "colA")).toBe("column");
    expect(classifyRole(P, "colB")).toBe("row");
  });
  it("non-layout nodes (wrappers, leaves) are content", () => {
    expect(classifyRole(P, "card")).toBe("content");
    expect(classifyRole(P, "btn")).toBe("content");
    expect(classifyRole(P, "img")).toBe("content");
  });
});

describe("structuralUnit — grabbing a nested node promotes to its wrapper cell", () => {
  it("grabbing the button promotes to the card (its wrapper), the direct child of colA", () => {
    // The KEY behaviour: moving the button must move the card div with it, or the column breaks.
    expect(structuralUnit(P, "btn")).toBe("card");
  });
  it("a node already sitting directly in a layout container is its own unit (no promotion)", () => {
    expect(structuralUnit(P, "card")).toBe("card"); // card's parent (colA) is a layout container
    expect(structuralUnit(P, "colA")).toBe("colA"); // colA's parent (section) is a layout container
    expect(structuralUnit(P, "img")).toBe("img");
  });
  it("the root promotes to itself", () => {
    expect(structuralUnit(P, "root")).toBe("root");
  });
});

describe("canContain — the hierarchy a move must preserve", () => {
  it("sections only nest in the main container", () => {
    expect(canContain("container", "section")).toBe(true);
    expect(canContain("row", "section")).toBe(false); // a section can't drop inside a row
    expect(canContain("section", "section")).toBe(false);
  });
  it("rows/columns/content nest in sections and other rows/columns", () => {
    expect(canContain("section", "content")).toBe(true);
    expect(canContain("column", "row")).toBe(true);
    expect(canContain("row", "content")).toBe(true);
  });
  it("content never contains anything, and the main container only takes sections", () => {
    expect(canContain("content", "content")).toBe(false);
    expect(canContain("container", "content")).toBe(false);
  });
});
