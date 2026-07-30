import { describe, it, expect } from "vitest";
import {
  emptyGraph,
  parseGraph,
  serializeGraph,
  addSketch,
  linkReference,
  linkComposes,
  recordGeneration,
  setVersionStatus,
  recordTokens,
  reconcile,
  buildIndex,
  componentsFromSketch,
  versionsOf,
  lineage,
  latestVersion,
  latestAccepted,
  sketchOf,
  selectSubgraph,
  sketchId,
  componentId,
  tokenId,
  type DrawGraph,
} from "./draw-graph";

const T = 1_000; // fixed timestamps → deterministic

/** A small graph: sketch "product-card" refs Card(reuse)+Badge(trace); Card composes Button. */
function seed(): { g: DrawGraph; sk: string } {
  const sk = sketchId("product-card");
  let g = emptyGraph();
  g = addSketch(g, { frameId: "product-card", label: "Product card", note: "reuse Card, add rating" }, T);
  g = linkReference(g, sk, "Card", "reuse", T);
  g = linkReference(g, sk, "Badge", "trace", T);
  g = linkComposes(g, "Card", "Button", T);
  return { g, sk };
}

describe("draw-graph — provenance + lineage", () => {
  it("recordGeneration wires GENERATED + OF and componentsFromSketch reads it back", () => {
    const { g, sk } = seed();
    const { graph, versionId } = recordGeneration(g, { sketchId: sk, component: "ProductCard", now: T });
    const ix = buildIndex(graph);
    expect(versionId).toBe("version:ProductCard@1");
    expect(componentsFromSketch(ix, sk)).toEqual(["ProductCard"]);
    expect(versionsOf(ix, "ProductCard").map((v) => v.n)).toEqual([1]);
    expect(sketchOf(ix, "ProductCard")?.id).toBe(sk);
  });

  it("re-generating the same component chains EVOLVED_TO into a per-component lineage", () => {
    const { g, sk } = seed();
    let graph = recordGeneration(g, { sketchId: sk, component: "ProductCard", now: T }).graph;
    graph = recordGeneration(graph, { sketchId: sk, component: "ProductCard", now: T + 1 }).graph;
    graph = recordGeneration(graph, { sketchId: sk, component: "ProductCard", now: T + 2 }).graph;
    const ix = buildIndex(graph);
    expect(versionsOf(ix, "ProductCard").map((v) => v.n)).toEqual([1, 2, 3]);
    expect(lineage(ix, "ProductCard").map((v) => v.n)).toEqual([1, 2, 3]); // followed EVOLVED_TO
    // exactly one EVOLVED_TO per step
    expect(graph.edges.filter((e) => e.type === "EVOLVED_TO")).toHaveLength(2);
  });

  it("one drawing → several components (derived REUSED_FOR)", () => {
    const { g, sk } = seed();
    let graph = recordGeneration(g, { sketchId: sk, component: "ProductCard", now: T }).graph;
    graph = recordGeneration(graph, { sketchId: sk, component: "MiniCard", now: T + 1 }).graph;
    const ix = buildIndex(graph);
    expect(componentsFromSketch(ix, sk).sort()).toEqual(["MiniCard", "ProductCard"]);
  });

  it("latestAccepted respects version status", () => {
    const { g, sk } = seed();
    const r1 = recordGeneration(g, { sketchId: sk, component: "ProductCard", now: T });
    const r2 = recordGeneration(r1.graph, { sketchId: sk, component: "ProductCard", now: T + 1 });
    let graph = setVersionStatus(r2.graph, r1.versionId, "accepted");
    graph = setVersionStatus(graph, r2.versionId, "discarded");
    const ix = buildIndex(graph);
    expect(latestVersion(ix, "ProductCard")?.n).toBe(2); // latest overall
    expect(latestAccepted(ix, "ProductCard")?.n).toBe(1); // latest ACCEPTED
  });
});

describe("selectSubgraph — the grounding lens", () => {
  it("includes references, expands COMPOSES one hop, and defaults intent to create-new", () => {
    const { g, sk } = seed();
    const ix = buildIndex(g);
    const s = selectSubgraph(ix, sk);
    expect(s.intent).toBe("create-new");
    expect(s.referenceComponents.map((r) => r.name).sort()).toEqual(["Badge", "Card"]);
    expect(s.referenceComponents.find((r) => r.name === "Badge")?.role).toBe("trace");
    // Card composes Button → included one hop deep
    expect(s.composedFrom).toContainEqual({ parent: "Card", children: ["Button"] });
  });

  it("a customize-target reference flips intent and surfaces the base version to edit", () => {
    const sk = sketchId("tweak-btn");
    let g = emptyGraph();
    g = addSketch(g, { frameId: "tweak-btn", label: "make CTA bigger" }, T);
    g = linkReference(g, sk, "Button", "customize-target", T);
    // Button already has a drawn version with output
    const r = recordGeneration(g, { sketchId: sk, component: "Button", outputRef: ".vortspec/canvas/exports/btn@1.html", now: T });
    g = setVersionStatus(r.graph, r.versionId, "accepted");
    const s = selectSubgraph(buildIndex(g), sk);
    expect(s.intent).toBe("customize-existing");
    expect(s.customizeTarget).toEqual({ component: "Button", latestVersion: 1, outputRef: ".vortspec/canvas/exports/btn@1.html" });
  });

  it("carries prior version output for the iterate loop, and gathers tokens from included components", () => {
    const { g, sk } = seed();
    const r = recordGeneration(g, { sketchId: sk, component: "ProductCard", outputRef: "pc@1.html", now: T });
    const graph = recordTokens(r.graph, r.versionId, [{ name: "--color-primary", value: "#7c6ff0" }, { name: "--radius-lg", value: "0.5rem" }], T);
    const s = selectSubgraph(buildIndex(graph), sk);
    expect(s.priorVersions).toContainEqual({ component: "ProductCard", version: 1, outputRef: "pc@1.html" });
    expect(s.tokens.map((t) => t.name).sort()).toEqual(["--color-primary", "--radius-lg"]);
    // includePriorOutput=false drops the prior refs
    const s2 = selectSubgraph(buildIndex(graph), sk, { includePriorOutput: false });
    expect(s2.priorVersions).toHaveLength(0);
  });

  it("honors maxComponents and maxTokens budgets and reports truncation", () => {
    const sk = sketchId("big");
    let g = emptyGraph();
    g = addSketch(g, { frameId: "big", label: "kitchen sink" }, T);
    for (const c of ["A", "B", "C", "D", "E"]) g = linkReference(g, sk, c, "reuse", T);
    const s = selectSubgraph(buildIndex(g), sk, { maxComponents: 3 });
    expect(s.referenceComponents).toHaveLength(5); // user choices are never dropped…
    expect(s.budgets.truncated).toBe(true); // …but truncation is flagged

    // token cap
    const r = recordGeneration(g, { sketchId: sk, component: "A", now: T }); // A is a reference AND drawn → has a version
    const toks = Array.from({ length: 50 }, (_, i) => ({ name: `--t${i}` }));
    const graph = recordTokens(r.graph, r.versionId, toks, T);
    const s2 = selectSubgraph(buildIndex(graph), sk, { maxTokens: 10 });
    expect(s2.tokens).toHaveLength(10);
    expect(s2.budgets.truncated).toBe(true);
  });
});

describe("draw-graph — reconcile + (de)serialization", () => {
  it("prunes references/tokens to deleted names but keeps sketch/version history", () => {
    const { g, sk } = seed();
    const r = recordGeneration(g, { sketchId: sk, component: "ProductCard", now: T });
    let graph = recordTokens(r.graph, r.versionId, [{ name: "--gone" }, { name: "--kept" }], T);
    // Badge got deleted from the design system; --gone token removed
    graph = reconcile(graph, { components: ["Card", "Button", "ProductCard"], tokens: ["--kept"] });
    expect(graph.edges.some((e) => e.type === "REFERENCES" && e.to === componentId("Badge"))).toBe(false);
    expect(graph.edges.some((e) => e.type === "REFERENCES" && e.to === componentId("Card"))).toBe(true);
    expect(graph.edges.some((e) => e.type === "USES_TOKEN" && e.to === tokenId("--gone"))).toBe(false);
    // history intact
    expect(graph.nodes.some((n) => n.id === sk)).toBe(true);
    expect(versionsOf(buildIndex(graph), "ProductCard")).toHaveLength(1);
  });

  it("round-trips through serialize/parse and rejects a bad schemaVersion", () => {
    const { g } = seed();
    const round = parseGraph(serializeGraph(g));
    expect(round).toEqual(g);
    expect(() => parseGraph(JSON.stringify({ schemaVersion: 99, nodes: [], edges: [] }))).toThrow(/schemaVersion/);
  });
});
