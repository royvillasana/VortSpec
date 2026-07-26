import { describe, expect, it } from "vitest";
import { buildProjection, findByFingerprint, walkProjection } from "./node-tree";
import type { StructureSnapshotWire } from "@vortspec/core/ipc";

const rect = { x: 0, y: 0, width: 10, height: 10 };
// main > (h1, ul > (li#a, li#b))
const SNAP: StructureSnapshotWire = {
  rootId: "main",
  nodes: {
    main: { id: "main", fingerprint: "main", rect, computed: {}, childIds: ["h1", "ul"] },
    h1: { id: "h1", fingerprint: "main>h1.title", rect, computed: {}, childIds: [] },
    ul: { id: "ul", fingerprint: "main>ul.list", rect, computed: {}, childIds: ["li-a", "li-b"] },
    "li-a": { id: "li-a", fingerprint: "main>ul>li.row", rect, computed: {}, childIds: [] },
    "li-b": { id: "li-b", fingerprint: "main>ul>li.row", rect, computed: {}, childIds: [] },
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
    const p = buildProjection({ rootId: "main", nodes: { main: { id: "main", fingerprint: "main", rect, computed: {}, childIds: ["ghost"] } } });
    expect(p.byId.get("main")?.childIds).toEqual([]);
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

describe("walkProjection", () => {
  it("visits depth-first in DOM order, root first", () => {
    const order: string[] = [];
    walkProjection(buildProjection(SNAP), (n) => order.push(n.id));
    expect(order).toEqual(["main", "h1", "ul", "li-a", "li-b"]);
  });
});
