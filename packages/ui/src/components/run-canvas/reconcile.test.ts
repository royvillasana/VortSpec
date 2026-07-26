import { describe, expect, it } from "vitest";
import { diffProjections, treeChangesToEdits } from "./reconcile";
import type { Projection, ProjectedNode } from "./node-tree";

const rect = { x: 0, y: 0, width: 1, height: 1 };
function node(p: Partial<ProjectedNode> & { id: string; fingerprint: string }): ProjectedNode {
  return {
    parentId: null,
    childIds: [],
    rect,
    computed: {},
    tag: "div",
    className: "",
    dataSource: `src/App.tsx:${p.id.length}:0`,
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
/** A clone with edits applied to one node, so prev vs next differ only by that mutation. */
function mutate(nodes: ProjectedNode[], id: string, patch: Partial<ProjectedNode>): ProjectedNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch, style: { ...n.style, ...(patch.style ?? {}) } } : { ...n }));
}

const BASE: ProjectedNode[] = [
  node({ id: "root", fingerprint: "main", tag: "main", childIds: ["h1", "ul"] }),
  node({ id: "h1", fingerprint: "h1.title", tag: "h1", className: "title", parentId: "root", text: "Hello", dataSource: "src/App.tsx:8:6" }),
  node({ id: "ul", fingerprint: "ul.list", tag: "ul", parentId: "root", childIds: ["a", "b", "c"], dataSource: "src/App.tsx:10:6" }),
  node({ id: "a", fingerprint: "li.row", tag: "li", parentId: "ul", dataDriven: true, dataSource: "src/App.tsx:12:8", text: "A" }),
  node({ id: "b", fingerprint: "li.row", tag: "li", parentId: "ul", dataDriven: true, dataSource: "src/App.tsx:12:8", text: "B" }),
  node({ id: "c", fingerprint: "li.row", tag: "li", parentId: "ul", dataDriven: true, dataSource: "src/App.tsx:12:8", text: "C" }),
];

describe("diffProjections + treeChangesToEdits", () => {
  it("style mutation → one style edit located by the element's anchor", () => {
    const next = mutate(BASE, "h1", { style: { color: "#c53434" } });
    const { edits } = treeChangesToEdits(diffProjections(projection(BASE), projection(next)));
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ file: "src/App.tsx", edit: { op: "style", anchor: { line: 8, column: 6 }, css: { color: "#c53434" } } });
    expect(edits[0].expect).toEqual({ tag: "h1", className: "title" });
  });

  it("text mutation → text edit", () => {
    const next = mutate(BASE, "h1", { text: "Goodbye" });
    const { edits } = treeChangesToEdits(diffProjections(projection(BASE), projection(next)));
    expect(edits[0].edit).toMatchObject({ op: "text", text: "Goodbye" });
  });

  it("className mutation → attr edit located by the PRE-change className", () => {
    const next = mutate(BASE, "h1", { className: "title big" });
    const changes = diffProjections(projection(BASE), projection(next));
    const { edits } = treeChangesToEdits(changes);
    expect(edits[0].edit).toMatchObject({ op: "attr", name: "className", value: { kind: "string", value: "title big" } });
    expect(edits[0].expect).toEqual({ tag: "h1", className: "title" }); // located by old class
  });

  it("removing a static node → delete; removing a list row → listRemove by index", () => {
    const staticGone = BASE.filter((n) => n.id !== "h1").map((n) =>
      n.id === "root" ? { ...n, childIds: ["ul"] } : { ...n },
    );
    expect(treeChangesToEdits(diffProjections(projection(BASE), projection(staticGone))).edits[0].edit).toMatchObject({ op: "delete" });

    const rowGone = BASE.filter((n) => n.id !== "b").map((n) => (n.id === "ul" ? { ...n, childIds: ["a", "c"] } : { ...n }));
    expect(treeChangesToEdits(diffProjections(projection(BASE), projection(rowGone))).edits[0].edit).toMatchObject({ op: "listRemove", index: 1 });
  });

  it("reordering list rows → one listReorder (move c to front)", () => {
    const next = BASE.map((n) => (n.id === "ul" ? { ...n, childIds: ["c", "a", "b"] } : { ...n }));
    const { edits } = treeChangesToEdits(diffProjections(projection(BASE), projection(next)));
    const reorders = edits.filter((e) => e.edit.op === "listReorder");
    expect(reorders.length).toBeGreaterThanOrEqual(1);
    expect(reorders[0].edit).toMatchObject({ op: "listReorder", from: 2, to: 0 });
  });

  it("an unstamped node's change is returned unmapped (caller falls back)", () => {
    const noAnchor = BASE.map((n) => (n.id === "h1" ? { ...n, dataSource: null } : { ...n }));
    const next = mutate(noAnchor, "h1", { text: "x" });
    const { edits, unmapped } = treeChangesToEdits(diffProjections(projection(noAnchor), projection(next)));
    expect(edits).toHaveLength(0);
    expect(unmapped).toHaveLength(1);
  });

  it("no change → no edits", () => {
    expect(diffProjections(projection(BASE), projection(BASE))).toEqual([]);
  });

  it("independent mutations on two elements → two edits", () => {
    let next = mutate(BASE, "h1", { style: { color: "#111" } });
    next = mutate(next, "a", { text: "AA" });
    const { edits } = treeChangesToEdits(diffProjections(projection(BASE), projection(next)));
    expect(edits).toHaveLength(2);
  });
});
