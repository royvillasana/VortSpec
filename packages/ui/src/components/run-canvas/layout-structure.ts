import type { Projection, ProjectedNode } from "./node-tree";

/**
 * Deterministic container recognition for structure-preserving moves (change: instatic-node-tree).
 * A move must respect the page hierarchy — `main container → sections → rows/columns → content` — and,
 * crucially, move the STRUCTURAL UNIT (the wrapper cell), not a bare leaf: grabbing a component nested
 * in a `div` moves that `div` with it, so the row/column grid stays intact. All of this is derived
 * from the projection (computed layout + tree shape) with NO AI. Pure + unit-testable.
 */
export type StructuralRole = "container" | "section" | "row" | "column" | "content";

/** A flex/grid box with children is a layout container; everything else is content. */
export function isLayoutContainer(node: ProjectedNode): boolean {
  const d = node.computed.display ?? "";
  return (d === "flex" || d === "inline-flex" || d === "grid" || d === "inline-grid") && node.childIds.length > 0;
}

/** The main axis of a layout container — a `row` lays children horizontally, a `column` vertically. */
export function axisOf(node: ProjectedNode): "row" | "column" {
  const d = node.computed.display ?? "";
  if (d === "grid" || d === "inline-grid") {
    return (node.computed["grid-auto-flow"] ?? "row").startsWith("column") ? "column" : "row";
  }
  return (node.computed["flex-direction"] ?? "row").startsWith("column") ? "column" : "row";
}

/** How many layout-container ancestors a node has (its depth in the layout hierarchy). */
function layoutDepth(projection: Projection, node: ProjectedNode): number {
  let depth = 0;
  let cur: ProjectedNode | undefined = node.parentId ? projection.byId.get(node.parentId) : undefined;
  while (cur) {
    if (isLayoutContainer(cur)) depth++;
    cur = cur.parentId ? projection.byId.get(cur.parentId) : undefined;
  }
  return depth;
}

/**
 * Classify a node's role in the page hierarchy. A non-layout node is `content`. A layout container is
 * the `container` (outermost), a `section` (a layout child of the main container), or a `row`/`column`
 * by axis (anything deeper). This is the taxonomy moves must preserve.
 */
export function classifyRole(projection: Projection, nodeId: string): StructuralRole {
  const node = projection.byId.get(nodeId);
  if (!node) return "content";
  if (!isLayoutContainer(node)) return "content";
  const depth = layoutDepth(projection, node);
  if (depth === 0) return "container";
  if (depth === 1) return "section";
  return axisOf(node);
}

/**
 * The STRUCTURAL UNIT to actually move for a grabbed node: promote up to the ancestor that is a DIRECT
 * child of the nearest layout container (the "cell"). Grabbing a component wrapped in a `div` returns
 * that `div`, so the wrapper moves with its content and the grid order is preserved. A node already
 * sitting directly in a layout container is its own unit (no promotion); the root promotes to itself.
 */
export function structuralUnit(projection: Projection, nodeId: string): string {
  let node = projection.byId.get(nodeId);
  if (!node) return nodeId;
  while (node.parentId) {
    const parent = projection.byId.get(node.parentId);
    if (!parent) break;
    if (isLayoutContainer(parent)) return node.id; // node is a direct child of a layout container → the cell
    node = parent;
  }
  return node.id;
}

/** Which roles may legally CONTAIN which, so a move never breaks `main → sections → rows/cols → content`. */
const CONTAINS: Record<StructuralRole, StructuralRole[]> = {
  container: ["section"],
  section: ["row", "column", "content"],
  row: ["row", "column", "content"],
  column: ["row", "column", "content"],
  content: [],
};

/**
 * Is dropping a unit of role `moving` into a container of role `into` structure-preserving? Sections
 * only go in the main container; rows/columns/content go in sections or other rows/columns; content
 * never contains anything. This is what keeps a section from being dropped inside a row, etc.
 */
export function canContain(into: StructuralRole, moving: StructuralRole): boolean {
  return CONTAINS[into].includes(moving);
}
