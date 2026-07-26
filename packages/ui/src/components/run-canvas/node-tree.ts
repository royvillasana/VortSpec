import type { StructureSnapshotWire, BridgeTree } from "@vortspec/core/ipc";

/**
 * Projected node tree (change: instatic-node-tree, DR-1, task 1.1). An in-memory projection of the
 * rendered page built from the inspector bridge's structure snapshot — the fast representation the
 * canvas will manipulate, reconciled to real source by STABLE IDENTITY (the `fingerprint`) rather
 * than positional line:col. This first stage is PURE + read-only: it derives the tree (identity,
 * parent/child, rect, layout) so we can prove parity with the DOM before routing anything through it.
 *
 * The per-node identity fields the reconciler needs beyond structure (tag / className / dataSource /
 * dataDriven) are optional here — they're filled once the snapshot is enriched (tasks 1.2–1.3);
 * `fingerprint` already encodes the stable identity, so the tree is usable for reads immediately.
 */
export interface ProjectedNode {
  /** Ephemeral node id (this render) — the handle the bridge uses for selection/overrides. */
  id: string;
  /** STABLE identity across renders (tag + class signature + structural path). The reconciler
   *  locates source by this, never by line:col. */
  fingerprint: string;
  /** Parent's node id, or null for the root. */
  parentId: string | null;
  /** Child node ids in DOM order. */
  childIds: string[];
  rect: { x: number; y: number; width: number; height: number };
  /** Computed layout subset (display, flex-direction, gap, …). */
  computed: Record<string, string>;
  /** Lowercase tag name. */
  tag: string;
  /** className string (empty when none). */
  className: string;
  /** `data-source` anchor — a HINT for reconciliation; identity is the fingerprint. Null unstamped. */
  dataSource: string | null;
  /** True when rendered from a list (a data-driven node) — not directly editable as a single JSX node. */
  dataDriven: boolean;
  /** `data-component` value (Layers label hint), empty when none. */
  component: string;
  /** The node's direct inline text (immediate text children) — the reconciler diffs this for text edits. */
  text: string;
  /** Inline style overrides applied to this node since the last persist (baseline {} from source).
   *  The reconciler diffs this for style edits; setInlineStyle merges the delta into source. */
  style: Record<string, string>;
}

export interface Projection {
  root: ProjectedNode | null;
  byId: Map<string, ProjectedNode>;
}

/**
 * Build the projection from a structure snapshot — pure, so it's fully unit-testable and can be
 * diffed against a later snapshot for reconciliation. Parent links are derived from `childIds`;
 * a node referenced as a child but absent from `nodes` is skipped (defensive).
 */
export function buildProjection(snapshot: StructureSnapshotWire | null): Projection {
  const byId = new Map<string, ProjectedNode>();
  if (!snapshot) return { root: null, byId };

  // First pass: materialize every node (no parent yet).
  for (const [id, n] of Object.entries(snapshot.nodes)) {
    byId.set(id, {
      id,
      fingerprint: n.fingerprint,
      parentId: null,
      childIds: n.childIds.filter((c) => c in snapshot.nodes),
      rect: n.rect,
      computed: n.computed,
      tag: n.tag,
      className: n.className,
      dataSource: n.dataSource,
      dataDriven: n.dataDriven,
      component: n.component,
      text: n.text,
      style: {}, // baseline — source styles aren't captured; the diff tracks the delta from mutations
    });
  }
  // Second pass: wire parents from each node's children.
  for (const node of byId.values()) {
    for (const childId of node.childIds) {
      const child = byId.get(childId);
      if (child) child.parentId = node.id;
    }
  }
  return { root: byId.get(snapshot.rootId) ?? null, byId };
}

/** Locate a node by its STABLE fingerprint (identity), the way source reconciliation will. Returns
 *  the unique match, or null when zero or many share it (ambiguous → the caller keeps a tiebreaker). */
export function findByFingerprint(projection: Projection, fingerprint: string): ProjectedNode | null {
  let hit: ProjectedNode | null = null;
  for (const node of projection.byId.values()) {
    if (node.fingerprint !== fingerprint) continue;
    if (hit) return null; // ambiguous
    hit = node;
  }
  return hit;
}

/**
 * Structural parity check (task 1.4): the projection must be a well-formed tree before we route any
 * read or write through it. Returns a list of violations (empty = valid) — bidirectional parent/child
 * consistency, every non-root has a listing parent, no dangling child refs, and every node reachable
 * from the root (no cycles/orphans). Runs as a dev-only assertion; it never mutates.
 */
export function validateProjection(projection: Projection): string[] {
  const issues: string[] = [];
  if (!projection.root && projection.byId.size > 0) issues.push("projection has nodes but no root");
  for (const node of projection.byId.values()) {
    for (const childId of node.childIds) {
      const child = projection.byId.get(childId);
      if (!child) issues.push(`${node.id} references missing child ${childId}`);
      else if (child.parentId !== node.id) issues.push(`child ${childId} parent is ${child.parentId ?? "null"}, expected ${node.id}`);
    }
    if (node.parentId) {
      const parent = projection.byId.get(node.parentId);
      if (!parent) issues.push(`${node.id} has missing parent ${node.parentId}`);
      else if (!parent.childIds.includes(node.id)) issues.push(`parent ${node.parentId} doesn't list child ${node.id}`);
    } else if (projection.root && node.id !== projection.root.id) {
      issues.push(`${node.id} has no parent but isn't the root`);
    }
  }
  const reachable = new Set<string>();
  walkProjection(projection, (n) => reachable.add(n.id));
  for (const id of projection.byId.keys()) if (!reachable.has(id)) issues.push(`${id} not reachable from the root`);
  return issues;
}

/**
 * Adapt the projection to the `BridgeTree` shape the Layers panel renders (Stage 2.1). The projection
 * shares the guest's uid scheme, so ids line up with selection; this lets the Layers read from the
 * ONE projection instead of the separate `bridge.tree` walk. Component/tag/classes drive the label.
 */
export function projectionToBridgeTree(projection: Projection): BridgeTree {
  const nodes: BridgeTree["nodes"] = {};
  const children: BridgeTree["children"] = {};
  for (const node of projection.byId.values()) {
    nodes[node.id] = {
      id: node.id,
      tag: node.tag,
      classes: node.className.split(/\s+/).filter(Boolean),
      component: node.component || undefined,
      childCount: node.childIds.length,
    };
    children[node.id] = node.childIds;
  }
  return { roots: projection.root ? [projection.root.id] : [], nodes, children };
}

/**
 * Stage 2.1 parity gate: does the projection-derived tree match the existing `bridge.tree` (same node
 * set + same children per node)? Returns violations (empty = parity). Run as a dev assertion so we
 * confirm the projection can drive the Layers BEFORE swapping the source — the two guest walks
 * (buildTree vs buildStructureSnapshot) could filter differently, and this catches it.
 */
export function treeParityIssues(bridgeTree: BridgeTree | null, projection: Projection): string[] {
  if (!bridgeTree || projection.byId.size === 0) return [];
  const issues: string[] = [];
  const derived = projectionToBridgeTree(projection);
  const btIds = new Set(Object.keys(bridgeTree.nodes));
  const pjIds = new Set(Object.keys(derived.nodes));
  for (const id of pjIds) if (!btIds.has(id)) issues.push(`projection has extra node ${id}`);
  for (const id of btIds) if (!pjIds.has(id)) issues.push(`projection missing node ${id}`);
  for (const id of pjIds) {
    if (!btIds.has(id)) continue;
    const a = (derived.children[id] ?? []).join(",");
    const b = (bridgeTree.children[id] ?? []).join(",");
    if (a !== b) issues.push(`children differ for ${id}`);
  }
  return issues;
}

/** Depth-first walk from the root in DOM order (root first). */
export function walkProjection(projection: Projection, visit: (node: ProjectedNode, depth: number) => void): void {
  const step = (id: string, depth: number): void => {
    const node = projection.byId.get(id);
    if (!node) return;
    visit(node, depth);
    for (const childId of node.childIds) step(childId, depth + 1);
  };
  if (projection.root) step(projection.root.id, 0);
}
