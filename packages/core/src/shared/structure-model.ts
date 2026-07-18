import type { Rect } from "./inspector-bridge";
import {
  inferFlowAxis,
  enumerateInsertTargets,
  resolveInsertTarget,
  type FlowAxis,
  type InsertPosition,
  type HitOptions,
} from "./insert-geometry";

/**
 * Structural model of a container subtree (change: canvas-live-structural-editing, §2).
 *
 * `insert-geometry` sees one container and its direct children; this generalizes it
 * into the nested tree the page actually is — sections holding rows holding columns —
 * so the drag, insert-container, and axis-override features can reason about layout,
 * not just a single gap. It is pure: the guest serializes a `StructureSnapshot` off
 * the live DOM and this turns it into a `StructuralNode` tree, composing the existing
 * geometry primitives per container rather than reimplementing them.
 */

/** One element in the serialized subtree — a container (childIds non-empty) or a leaf. */
export interface NodeDesc {
  id: string;
  /** Stable fingerprint (from `dom-fingerprint`), so a slot survives a re-render. */
  fingerprint: string;
  rect: Rect;
  /** Computed layout subset: display, flex-direction, grid-auto-flow, gap. */
  computed: Record<string, string>;
  /** Element-child ids in DOM order (empty for a leaf). */
  childIds: string[];
}

/** A flat snapshot the guest produces: the scanned root plus every node under it. */
export interface StructureSnapshot {
  rootId: string;
  nodes: Record<string, NodeDesc>;
}

export type StructuralKind = "section" | "row" | "column" | "leaf";

/** A normalized insertion slot on a container (anchor child + before/after + its line). */
export interface Slot {
  /** The container this slot belongs to. */
  containerId: string;
  /** The child the slot anchors to. */
  anchorId: string;
  position: InsertPosition;
  axis: FlowAxis;
  /** The insertion line across the flow axis, in guest coords. */
  line: { x1: number; y1: number; x2: number; y2: number };
}

/** A node in the recognized structure tree. */
export interface StructuralNode {
  id: string;
  fingerprint: string;
  kind: StructuralKind;
  rect: Rect;
  /** The container's flow axis (a leaf inherits `column` as a harmless default). */
  axis: FlowAxis;
  /** The container's gap in px. */
  gap: number;
  children: StructuralNode[];
  /** Every insertion slot among this container's children. */
  slots: Slot[];
}

const px = (s?: string): number => Math.max(0, parseFloat(s ?? "") || 0);

function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** A synthetic computed style that makes `inferFlowAxis` return a known axis (for reuse). */
function computedForAxis(axis: FlowAxis): Record<string, string> {
  return { display: "flex", "flex-direction": axis === "column" ? "column" : "row" };
}

/** Build the structural tree from a snapshot, or null if the root is missing. */
export function buildStructuralModel(snapshot: StructureSnapshot): StructuralNode | null {
  const root = snapshot.nodes[snapshot.rootId];
  return root ? buildNode(root, snapshot) : null;
}

function buildNode(desc: NodeDesc, snap: StructureSnapshot): StructuralNode {
  const childDescs = desc.childIds.map((id) => snap.nodes[id]).filter(Boolean);
  const axis = inferFlowAxis(desc.computed);
  const children = childDescs.map((c) => buildNode(c, snap));
  const slots: Slot[] = childDescs.length
    ? enumerateInsertTargets({ computed: desc.computed, children: childDescs.map((c) => c.rect) }).map((t) => ({
        containerId: desc.id,
        anchorId: childDescs[t.anchorIndex].id,
        position: t.position,
        axis: t.axis,
        line: t.line,
      }))
    : [];
  return {
    id: desc.id,
    fingerprint: desc.fingerprint,
    kind: classify(children, axis),
    rect: desc.rect,
    axis,
    gap: px(desc.computed.gap),
    children,
    slots,
  };
}

/** Label a node: leaf when childless; a column of rows reads as a section; else by axis. */
function classify(children: StructuralNode[], axis: FlowAxis): StructuralKind {
  if (children.length === 0) return "leaf";
  const hasRowChildren = children.some((c) => c.kind === "row" || c.kind === "section");
  if (axis === "column" && hasRowChildren) return "section";
  return axis === "row" ? "row" : "column";
}

/**
 * The containers under a point, deepest last, excluding a dragged subtree (an id in
 * `exclude` prunes that node AND its descendants, so a drop can't land inside itself).
 */
function containersUnder(
  node: StructuralNode,
  point: { x: number; y: number },
  exclude: Set<string>,
  out: StructuralNode[],
): void {
  if (exclude.has(node.id) || !contains(node.rect, point)) return;
  if (node.children.length > 0) out.push(node);
  for (const c of node.children) containersUnder(c, point, exclude, out);
}

export interface SlotAtOptions extends HitOptions {
  /** Ids to exclude (the dragged element) — pruned along with their subtree. */
  excludeSubtree?: string[];
  /** Target an ancestor container instead of the deepest one (0 = deepest). */
  popOut?: number;
}

/**
 * Resolve the insertion slot under a point (deepest container first, or `popOut`
 * levels shallower), excluding a dragged subtree. Reuses `resolveInsertTarget` on the
 * chosen container's (surviving) children. Null when the point is over no container,
 * or the chosen container has no children left to anchor to.
 */
export function slotAt(
  model: StructuralNode,
  point: { x: number; y: number },
  opts: SlotAtOptions = {},
): Slot | null {
  const exclude = new Set(opts.excludeSubtree ?? []);
  const chain: StructuralNode[] = [];
  containersUnder(model, point, exclude, chain);
  chain.reverse(); // deepest first
  // Only containers that still have a child to anchor to (a container whose sole
  // child is the dragged element is not a valid target — pop up to its parent).
  const candidates = chain.filter((c) => c.children.some((ch) => !exclude.has(ch.id)));
  if (candidates.length === 0) return null;
  const container = candidates[Math.min(opts.popOut ?? 0, candidates.length - 1)];
  const visible = container.children.filter((c) => !exclude.has(c.id));
  const target = resolveInsertTarget(point, { computed: computedForAxis(container.axis), children: visible.map((c) => c.rect) }, opts);
  if (!target) return null;
  return {
    containerId: container.id,
    anchorId: visible[target.anchorIndex].id,
    position: target.position,
    axis: target.axis,
    line: target.line,
  };
}

/** How deep the container stack is under a point (for a pop-out affordance). */
export function containerDepthAt(model: StructuralNode, point: { x: number; y: number }, excludeSubtree: string[] = []): number {
  const chain: StructuralNode[] = [];
  containersUnder(model, point, new Set(excludeSubtree), chain);
  return chain.length;
}

/** Every drop zone (slot) in the tree, for drawing all targets — excluding a dragged subtree. */
export function dropZonesFor(model: StructuralNode, excludeSubtree: string[] = []): Slot[] {
  const exclude = new Set(excludeSubtree);
  const out: Slot[] = [];
  const walk = (n: StructuralNode): void => {
    if (exclude.has(n.id)) return;
    for (const s of n.slots) if (!exclude.has(s.anchorId)) out.push(s);
    for (const c of n.children) walk(c);
  };
  walk(model);
  return out;
}
