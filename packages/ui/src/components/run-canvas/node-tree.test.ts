import { describe, expect, it } from "vitest";
import { buildProjection, findByFingerprint, walkProjection, validateProjection } from "./node-tree";
import type { StructureSnapshotWire } from "@vortspec/core/ipc";

const rect = { x: 0, y: 0, width: 10, height: 10 };
const n = (
  id: string,
  fingerprint: string,
  tag: string,
  className: string,
  childIds: string[],
  extra: { dataSource?: string | null; dataDriven?: boolean } = {},
) => ({ id, fingerprint, rect, computed: {}, childIds, tag, className, dataSource: extra.dataSource ?? null, dataDriven: extra.dataDriven ?? false });
// main > (h1, ul > (li#a, li#b)) — the two li share a fingerprint (list rows) and are data-driven.
const SNAP: StructureSnapshotWire = {
  rootId: "main",
  nodes: {
    main: n("main", "main", "main", "page", ["h1", "ul"], { dataSource: "src/App.tsx:7:4" }),
    h1: n("h1", "main>h1.title", "h1", "title", [], { dataSource: "src/App.tsx:8:6" }),
    ul: n("ul", "main>ul.list", "ul", "list", ["li-a", "li-b"]),
    "li-a": n("li-a", "main>ul>li.row", "li", "row", [], { dataDriven: true }),
    "li-b": n("li-b", "main>ul>li.row", "li", "row", [], { dataDriven: true }),
  },
};

describe("buildProjection", () => {
  it("materializes every node with a stable fingerprint identity", () => {
    const p = buildProjection(SNAP);
    expect(p.byId.size).toBe(5);
    expect(p.root?.id).toBe("main");
    expect(p.byId.get("h1")?.fingerprint).toBe("main>h1.title");
  });

  it("wires parent links from childIds", () => {
    const p = buildProjection(SNAP);
    expect(p.byId.get("h1")?.parentId).toBe("main");
    expect(p.byId.get("li-a")?.parentId).toBe("ul");
    expect(p.root?.parentId).toBeNull();
  });

  it("drops a child reference that isn't in nodes (defensive)", () => {
    const p = buildProjection({ rootId: "main", nodes: { main: n("main", "main", "main", "", ["ghost"]) } });
    expect(p.byId.get("main")?.childIds).toEqual([]);
  });

  it("carries the enriched identity fields (tag/className/dataSource/dataDriven)", () => {
    const p = buildProjection(SNAP);
    expect(p.byId.get("h1")).toMatchObject({ tag: "h1", className: "title", dataSource: "src/App.tsx:8:6", dataDriven: false });
    expect(p.byId.get("li-a")).toMatchObject({ tag: "li", className: "row", dataDriven: true });
  });

  it("returns an empty projection for a null snapshot", () => {
    const p = buildProjection(null);
    expect(p.root).toBeNull();
    expect(p.byId.size).toBe(0);
  });
});

describe("findByFingerprint — identity lookup (how reconciliation locates source)", () => {
  it("returns the unique node for a distinct fingerprint", () => {
    const p = buildProjection(SNAP);
    expect(findByFingerprint(p, "main>h1.title")?.id).toBe("h1");
  });
  it("returns null when the fingerprint is ambiguous (list rows share one) — caller needs a tiebreaker", () => {
    const p = buildProjection(SNAP);
    expect(findByFingerprint(p, "main>ul>li.row")).toBeNull();
  });
});

describe("validateProjection — parity gate (task 1.4)", () => {
  it("a built projection is well-formed (no issues)", () => {
    expect(validateProjection(buildProjection(SNAP))).toEqual([]);
  });
  it("flags a broken parent/child link", () => {
    const p = buildProjection(SNAP);
    p.byId.get("h1")!.parentId = "ul"; // lie: h1's parent says ul, but ul doesn't list h1
    const issues = validateProjection(p);
    expect(issues.some((i) => i.includes("h1"))).toBe(true);
  });
  it("flags an orphan not reachable from the root", () => {
    const p = buildProjection(SNAP);
    p.byId.get("main")!.childIds = ["ul"]; // drop h1 from the tree but leave it in byId
    expect(validateProjection(p).some((i) => i.includes("h1"))).toBe(true);
  });
});

describe("walkProjection", () => {
  it("visits depth-first in DOM order, root first", () => {
    const order: string[] = [];
    walkProjection(buildProjection(SNAP), (n) => order.push(n.id));
    expect(order).toEqual(["main", "h1", "ul", "li-a", "li-b"]);
  });
});
