/**
 * Draw-to-component project graph (see docs/draw-to-component-graph.md). The durable substrate for
 * the Playground's Draw tool: a typed graph of sketches → components → versions, plus the
 * `selectSubgraph` grounding lens that feeds the compose pipeline a bounded slice of the design
 * system for each generation.
 *
 * Pure + framework-free (mirrors the token resolver). Builders are DETERMINISTIC — the caller
 * supplies `now` (and ids derive from stable inputs), so nothing here calls Date.now()/random.
 * The graph is plain JSON: persisted at `.vortspec/canvas/graph.json`. `component`/`token`/`page`
 * nodes are REFERENCES (by name) to the authoritative sources — the graph never duplicates their
 * definitions; version OUTPUTS are referenced by path (`outputRef`), never inlined.
 */

export type Tier = "atom" | "molecule" | "organism" | "template" | (string & {});
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NodeId = string;

export interface SketchNode {
  type: "sketch";
  id: NodeId;
  label: string;
  note?: string;
  frameId: string;
  pngRef?: string;
  bbox?: Box;
  createdAt: number;
  updatedAt: number;
}
export interface ComponentNode {
  type: "component";
  id: NodeId;
  name: string;
  tier?: Tier;
  origin: "design-system" | "drawn";
}
export interface VersionNode {
  type: "version";
  id: NodeId;
  component: string;
  n: number;
  sketchId: NodeId;
  promptHash?: string;
  resultHash?: string;
  outputRef?: string;
  status: "generated" | "accepted" | "discarded";
  createdAt: number;
}
export interface TokenNode {
  type: "token";
  id: NodeId;
  name: string;
  value?: string;
}
export interface PageNode {
  type: "page";
  id: NodeId;
  name: string;
  path?: string;
}
export interface SpotNode {
  type: "spot";
  id: NodeId;
  page: string;
  slotPath?: string;
}
export type GraphNode = SketchNode | ComponentNode | VersionNode | TokenNode | PageNode | SpotNode;

export type EdgeType = "GENERATED" | "OF" | "EVOLVED_TO" | "REFERENCES" | "USES_TOKEN" | "COMPOSES" | "PLACED_AT";
export type RefRole = "trace" | "reuse" | "customize-target";
export interface GraphEdge {
  type: EdgeType;
  from: NodeId;
  to: NodeId;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export interface DrawGraph {
  schemaVersion: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const SCHEMA_VERSION = 1 as const;

// ── ids ────────────────────────────────────────────────────────────────────
export const sketchId = (frameId: string): NodeId => `sketch:${frameId}`;
export const componentId = (name: string): NodeId => `component:${name}`;
export const versionId = (component: string, n: number): NodeId => `version:${component}@${n}`;
export const tokenId = (name: string): NodeId => `token:${name}`;
export const pageId = (name: string): NodeId => `page:${name}`;
export const spotId = (page: string, slot: string): NodeId => `spot:${page}#${slot}`;

// ── (de)serialization ────────────────────────────────────────────────────────
export function emptyGraph(): DrawGraph {
  return { schemaVersion: SCHEMA_VERSION, nodes: [], edges: [] };
}
export function serializeGraph(g: DrawGraph): string {
  return JSON.stringify(g, null, 2);
}
export function parseGraph(text: string): DrawGraph {
  const data = JSON.parse(text) as DrawGraph;
  if (!data || data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`draw-graph: unsupported schemaVersion ${String(data?.schemaVersion)}`);
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("draw-graph: nodes/edges must be arrays");
  }
  return data;
}

// ── immutable node/edge helpers ──────────────────────────────────────────────
function withNode(g: DrawGraph, node: GraphNode): DrawGraph {
  const nodes = g.nodes.some((n) => n.id === node.id)
    ? g.nodes.map((n) => (n.id === node.id ? node : n))
    : [...g.nodes, node];
  return { ...g, nodes };
}
/** Add an edge unless one with the same (type, from, to) already exists (idempotent). */
function withEdge(g: DrawGraph, edge: GraphEdge): DrawGraph {
  if (g.edges.some((e) => e.type === edge.type && e.from === edge.from && e.to === edge.to)) return g;
  return { ...g, edges: [...g.edges, edge] };
}

// ── builders (g → g') ─────────────────────────────────────────────────────────
export function addSketch(
  g: DrawGraph,
  input: { frameId: string; label: string; note?: string; bbox?: Box },
  now: number,
): DrawGraph {
  const id = sketchId(input.frameId);
  const existing = g.nodes.find((n): n is SketchNode => n.id === id && n.type === "sketch");
  const node: SketchNode = {
    type: "sketch",
    id,
    frameId: input.frameId,
    label: input.label,
    note: input.note,
    bbox: input.bbox,
    pngRef: existing?.pngRef,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return withNode(g, node);
}

export function setSketchPng(g: DrawGraph, sketchNodeId: NodeId, pngRef: string, now: number): DrawGraph {
  const node = g.nodes.find((n): n is SketchNode => n.id === sketchNodeId && n.type === "sketch");
  if (!node) return g;
  return withNode(g, { ...node, pngRef, updatedAt: now });
}

export function upsertComponent(
  g: DrawGraph,
  name: string,
  opts?: { tier?: Tier; origin?: "design-system" | "drawn" },
): DrawGraph {
  const id = componentId(name);
  const existing = g.nodes.find((n): n is ComponentNode => n.id === id && n.type === "component");
  const node: ComponentNode = {
    type: "component",
    id,
    name,
    tier: opts?.tier ?? existing?.tier,
    origin: opts?.origin ?? existing?.origin ?? "design-system",
  };
  return withNode(g, node);
}

export function linkReference(g: DrawGraph, sketchNodeId: NodeId, component: string, role: RefRole, now: number): DrawGraph {
  const g2 = upsertComponent(g, component);
  return withEdge(g2, { type: "REFERENCES", from: sketchNodeId, to: componentId(component), meta: { role }, createdAt: now });
}

export function linkComposes(g: DrawGraph, parent: string, child: string, now: number): DrawGraph {
  let g2 = upsertComponent(g, parent);
  g2 = upsertComponent(g2, child);
  return withEdge(g2, { type: "COMPOSES", from: componentId(parent), to: componentId(child), createdAt: now });
}

/**
 * Record a generation: create the Version, wire GENERATED (sketch→version) + OF (version→component),
 * and EVOLVED_TO from the component's prior latest version (its per-component lineage). Returns the
 * new graph and the created version id.
 */
export function recordGeneration(
  g: DrawGraph,
  input: {
    sketchId: NodeId;
    component: string;
    promptHash?: string;
    resultHash?: string;
    outputRef?: string;
    status?: VersionNode["status"];
    origin?: "design-system" | "drawn";
    now: number;
  },
): { graph: DrawGraph; versionId: NodeId } {
  const { component, now } = input;
  let g2 = upsertComponent(g, component, { origin: input.origin });
  const existing = g2.nodes.filter((n): n is VersionNode => n.type === "version" && n.component === component);
  const n = existing.length + 1;
  const vId = versionId(component, n);
  const vnode: VersionNode = {
    type: "version",
    id: vId,
    component,
    n,
    sketchId: input.sketchId,
    promptHash: input.promptHash,
    resultHash: input.resultHash,
    outputRef: input.outputRef,
    status: input.status ?? "generated",
    createdAt: now,
  };
  g2 = withNode(g2, vnode);
  g2 = withEdge(g2, { type: "GENERATED", from: input.sketchId, to: vId, createdAt: now });
  g2 = withEdge(g2, { type: "OF", from: vId, to: componentId(component), createdAt: now });
  if (existing.length > 0) {
    const prev = existing.reduce((a, b) => (b.n > a.n ? b : a));
    g2 = withEdge(g2, { type: "EVOLVED_TO", from: prev.id, to: vId, createdAt: now });
  }
  return { graph: g2, versionId: vId };
}

export function setVersionStatus(g: DrawGraph, vId: NodeId, status: VersionNode["status"]): DrawGraph {
  const node = g.nodes.find((n): n is VersionNode => n.id === vId && n.type === "version");
  if (!node) return g;
  return withNode(g, { ...node, status });
}

export function recordTokens(g: DrawGraph, vId: NodeId, tokens: Array<{ name: string; value?: string }>, now: number): DrawGraph {
  let g2 = g;
  for (const t of tokens) {
    g2 = withNode(g2, { type: "token", id: tokenId(t.name), name: t.name, value: t.value });
    g2 = withEdge(g2, { type: "USES_TOKEN", from: vId, to: tokenId(t.name), createdAt: now });
  }
  return g2;
}

/**
 * Prune edges to components/tokens that no longer exist in the authoritative index (renamed or
 * deleted), plus orphan token nodes. Component nodes and the sketch/version history are RETAINED —
 * provenance is never lost.
 */
export function reconcile(g: DrawGraph, present: { components: string[]; tokens: string[] }): DrawGraph {
  const comps = new Set(present.components.map(componentId));
  const toks = new Set(present.tokens.map(tokenId));
  const edges = g.edges.filter((e) => {
    if (e.type === "REFERENCES") return comps.has(e.to);
    if (e.type === "COMPOSES") return comps.has(e.from) && comps.has(e.to);
    if (e.type === "USES_TOKEN") return toks.has(e.to);
    return true;
  });
  const usedTokens = new Set(edges.filter((e) => e.type === "USES_TOKEN").map((e) => e.to));
  const nodes = g.nodes.filter((n) => n.type !== "token" || toks.has(n.id) || usedTokens.has(n.id));
  return { ...g, nodes, edges };
}

// ── index + queries ───────────────────────────────────────────────────────────
export interface GraphIndex {
  graph: DrawGraph;
  byId: Map<NodeId, GraphNode>;
  out: Map<NodeId, GraphEdge[]>;
  in: Map<NodeId, GraphEdge[]>;
}

function group(edges: GraphEdge[], key: (e: GraphEdge) => NodeId): Map<NodeId, GraphEdge[]> {
  const m = new Map<NodeId, GraphEdge[]>();
  for (const e of edges) {
    const k = key(e);
    const a = m.get(k);
    if (a) a.push(e);
    else m.set(k, [e]);
  }
  return m;
}

export function buildIndex(g: DrawGraph): GraphIndex {
  const byId = new Map<NodeId, GraphNode>();
  for (const n of g.nodes) byId.set(n.id, n);
  return {
    graph: g,
    byId,
    out: group(g.edges, (e) => e.from),
    in: group(g.edges, (e) => e.to),
  };
}

export function getNode<T extends GraphNode = GraphNode>(ix: GraphIndex, id: NodeId): T | undefined {
  return ix.byId.get(id) as T | undefined;
}
export function outEdges(ix: GraphIndex, id: NodeId, type?: EdgeType): GraphEdge[] {
  const a = ix.out.get(id) ?? [];
  return type ? a.filter((e) => e.type === type) : a;
}
export function inEdges(ix: GraphIndex, id: NodeId, type?: EdgeType): GraphEdge[] {
  const a = ix.in.get(id) ?? [];
  return type ? a.filter((e) => e.type === type) : a;
}

export function versionsOf(ix: GraphIndex, component: string): VersionNode[] {
  return ix.graph.nodes
    .filter((n): n is VersionNode => n.type === "version" && n.component === component)
    .sort((a, b) => a.n - b.n);
}
export function latestVersion(ix: GraphIndex, component: string): VersionNode | null {
  const v = versionsOf(ix, component);
  return v.length ? v[v.length - 1] : null;
}
export function latestAccepted(ix: GraphIndex, component: string): VersionNode | null {
  const v = versionsOf(ix, component).filter((x) => x.status === "accepted");
  return v.length ? v[v.length - 1] : null;
}

/** The component's version lineage, following EVOLVED_TO from its root (falls back to n-order). */
export function lineage(ix: GraphIndex, component: string): VersionNode[] {
  const versions = versionsOf(ix, component);
  if (!versions.length) return [];
  const hasIncoming = new Set(ix.graph.edges.filter((e) => e.type === "EVOLVED_TO").map((e) => e.to));
  let cur: VersionNode | undefined = versions.find((v) => !hasIncoming.has(v.id)) ?? versions[0];
  const chain: VersionNode[] = [];
  const seen = new Set<NodeId>();
  while (cur && !seen.has(cur.id)) {
    const node: VersionNode = cur;
    chain.push(node);
    seen.add(node.id);
    const nextEdge: GraphEdge | undefined = outEdges(ix, node.id, "EVOLVED_TO")[0];
    cur = nextEdge ? getNode<VersionNode>(ix, nextEdge.to) : undefined;
  }
  return chain;
}

/** Distinct component names this sketch has produced (the derived REUSED_FOR relation). */
export function componentsFromSketch(ix: GraphIndex, sketchNodeId: NodeId): string[] {
  const names = new Set<string>();
  for (const e of outEdges(ix, sketchNodeId, "GENERATED")) {
    const v = getNode<VersionNode>(ix, e.to);
    if (v?.type === "version") names.add(v.component);
  }
  return [...names];
}

/** The sketch a component originated from (its first version's sketch). */
export function sketchOf(ix: GraphIndex, component: string): SketchNode | null {
  const v = versionsOf(ix, component)[0];
  if (!v) return null;
  return getNode<SketchNode>(ix, v.sketchId) ?? null;
}

// ── selectSubgraph — the grounding contract ───────────────────────────────────
export interface SubgraphSlice {
  sketch: { id: NodeId; label: string; note?: string; pngRef?: string };
  intent: "create-new" | "customize-existing";
  customizeTarget?: { component: string; latestVersion?: number; outputRef?: string };
  referenceComponents: Array<{ name: string; tier?: Tier; role: "trace" | "reuse" }>;
  composedFrom: Array<{ parent: string; children: string[] }>;
  priorVersions: Array<{ component: string; version: number; outputRef?: string }>;
  siblings: string[];
  tokens: Array<{ name: string; value?: string }>;
  budgets: { components: number; tokens: number; truncated: boolean };
}

export interface SelectSubgraphOptions {
  maxComponents?: number;
  maxTokens?: number;
  includePriorOutput?: boolean;
  hops?: number;
}

/**
 * Select a bounded, relevant slice of the graph for grounding one generation from `sketchNodeId`.
 * Priority (spending the component budget top-down): references → composed children → prior
 * evolutions of this sketch → siblings. Tokens = union of USES_TOKEN across included components'
 * latest versions, capped. Returns REFS (pngRef/outputRef), not blobs — the caller hydrates.
 */
export function selectSubgraph(ix: GraphIndex, sketchNodeId: NodeId, opts?: SelectSubgraphOptions): SubgraphSlice {
  const maxComponents = opts?.maxComponents ?? 8;
  const maxTokens = opts?.maxTokens ?? 40;
  const includePriorOutput = opts?.includePriorOutput ?? true;
  const hops = opts?.hops ?? 1;

  const sketch = getNode<SketchNode>(ix, sketchNodeId);
  const refEdges = outEdges(ix, sketchNodeId, "REFERENCES");
  const customizeEdge = refEdges.find((e) => e.meta?.role === "customize-target");
  const intent: SubgraphSlice["intent"] = customizeEdge ? "customize-existing" : "create-new";

  const included = new Set<string>();
  let dropped = false;
  const canAdd = (): boolean => included.size < maxComponents;

  // 1–2. References (user choices — always included).
  const referenceComponents: SubgraphSlice["referenceComponents"] = [];
  for (const e of refEdges) {
    const c = getNode<ComponentNode>(ix, e.to);
    if (!c || c.type !== "component") continue;
    const rawRole = e.meta?.role;
    const role: "trace" | "reuse" = rawRole === "trace" ? "trace" : "reuse";
    referenceComponents.push({ name: c.name, tier: c.tier, role });
    included.add(c.name);
  }
  if (referenceComponents.length > maxComponents) dropped = true;

  // 3. Composed children, expanded `hops` deep.
  const composedFrom: SubgraphSlice["composedFrom"] = [];
  let frontier = referenceComponents.map((r) => r.name);
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const parent of frontier) {
      const kidNames: string[] = [];
      for (const ce of outEdges(ix, componentId(parent), "COMPOSES")) {
        const k = getNode<ComponentNode>(ix, ce.to);
        if (!k || k.type !== "component") continue;
        if (included.has(k.name)) {
          kidNames.push(k.name);
        } else if (canAdd()) {
          included.add(k.name);
          kidNames.push(k.name);
          next.push(k.name);
        } else {
          dropped = true;
        }
      }
      if (kidNames.length) composedFrom.push({ parent, children: kidNames });
    }
    frontier = next;
  }

  // 4. Prior evolutions of this sketch (so a regenerate edits rather than restarts).
  const priorVersions: SubgraphSlice["priorVersions"] = [];
  if (includePriorOutput) {
    for (const cname of componentsFromSketch(ix, sketchNodeId)) {
      const v = latestAccepted(ix, cname) ?? latestVersion(ix, cname);
      if (v) priorVersions.push({ component: cname, version: v.n, outputRef: v.outputRef });
      included.add(cname);
    }
  }

  // customize target — the existing component being evolved.
  let customizeTarget: SubgraphSlice["customizeTarget"] | undefined;
  if (customizeEdge) {
    const c = getNode<ComponentNode>(ix, customizeEdge.to);
    if (c && c.type === "component") {
      const v = latestAccepted(ix, c.name) ?? latestVersion(ix, c.name);
      customizeTarget = { component: c.name, latestVersion: v?.n, outputRef: v?.outputRef };
    }
  }

  // 6. Siblings — same-tier known components, spare budget only.
  const siblings: string[] = [];
  const tiers = new Set(referenceComponents.map((r) => r.tier).filter((t): t is Tier => !!t));
  if (tiers.size) {
    for (const node of ix.graph.nodes) {
      if (node.type !== "component" || included.has(node.name)) continue;
      if (node.tier && tiers.has(node.tier)) {
        if (canAdd()) {
          included.add(node.name);
          siblings.push(node.name);
        } else {
          dropped = true;
          break;
        }
      }
    }
  }

  // 5. Tokens — union of USES_TOKEN across included components' latest versions.
  const tokenMap = new Map<string, string | undefined>();
  for (const cname of included) {
    const v = latestVersion(ix, cname);
    if (!v) continue;
    for (const te of outEdges(ix, v.id, "USES_TOKEN")) {
      const t = getNode<TokenNode>(ix, te.to);
      if (t && t.type === "token" && !tokenMap.has(t.name)) tokenMap.set(t.name, t.value);
    }
  }
  let tokens = [...tokenMap].map(([name, value]) => ({ name, value }));
  let tokensTruncated = false;
  if (tokens.length > maxTokens) {
    tokens = tokens.slice(0, maxTokens);
    tokensTruncated = true;
  }

  return {
    sketch: sketch
      ? { id: sketch.id, label: sketch.label, note: sketch.note, pngRef: sketch.pngRef }
      : { id: sketchNodeId, label: "" },
    intent,
    customizeTarget,
    referenceComponents,
    composedFrom,
    priorVersions,
    siblings,
    tokens,
    budgets: {
      components: included.size,
      tokens: tokens.length,
      truncated: dropped || tokensTruncated,
    },
  };
}
