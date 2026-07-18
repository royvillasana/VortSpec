import { describe, it, expect } from "vitest";
import {
  buildStructuralModel,
  slotAt,
  dropZonesFor,
  containerDepthAt,
  type StructureSnapshot,
  type NodeDesc,
} from "./structure-model";
import type { Rect } from "./inspector-bridge";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const node = (id: string, r: Rect, computed: Record<string, string>, childIds: string[] = []): NodeDesc => ({
  id,
  fingerprint: `fp:${id}`,
  rect: r,
  computed,
  childIds,
});

const ROW = { display: "flex", "flex-direction": "row", gap: "16px" };
const COL = { display: "flex", "flex-direction": "column", gap: "24px" };
const LEAF = { display: "block" };

/**
 * A section (column) containing two rows; row 1 has two columns (cards), row 2 has one.
 *   section [0,0 400x200]
 *     row1  [0,0 400x90]   → cardA [0,0 190x90], cardB [210,0 190x90]
 *     row2  [0,110 400x90] → cardC [0,110 400x90]
 */
function nested(): StructureSnapshot {
  const nodes: Record<string, NodeDesc> = {
    section: node("section", rect(0, 0, 400, 200), COL, ["row1", "row2"]),
    row1: node("row1", rect(0, 0, 400, 90), ROW, ["cardA", "cardB"]),
    cardA: node("cardA", rect(0, 0, 190, 90), LEAF),
    cardB: node("cardB", rect(210, 0, 190, 90), LEAF),
    row2: node("row2", rect(0, 110, 400, 90), ROW, ["cardC"]),
    cardC: node("cardC", rect(0, 110, 400, 90), LEAF),
  };
  return { rootId: "section", nodes };
}

describe("buildStructuralModel", () => {
  it("recognizes nesting: a section of rows, a row of columns", () => {
    const m = buildStructuralModel(nested())!;
    expect(m.kind).toBe("section");
    expect(m.axis).toBe("column");
    expect(m.gap).toBe(24);
    expect(m.children.map((c) => c.kind)).toEqual(["row", "row"]);
    const row1 = m.children[0];
    expect(row1.axis).toBe("row");
    expect(row1.children.map((c) => c.kind)).toEqual(["leaf", "leaf"]);
  });

  it("exposes the slots between a container's children", () => {
    const row1 = buildStructuralModel(nested())!.children[0];
    // before cardA, the gap → before cardB, after cardB.
    const anchors = row1.slots.map((s) => `${s.position}:${s.anchorId}`);
    expect(anchors).toContain("before:cardA");
    expect(anchors).toContain("before:cardB");
    expect(anchors).toContain("after:cardB");
  });

  it("returns null for a missing root", () => {
    expect(buildStructuralModel({ rootId: "nope", nodes: {} })).toBeNull();
  });
});

describe("slotAt", () => {
  it("resolves the gap inside the inner row (deepest container wins)", () => {
    const m = buildStructuralModel(nested())!;
    // A point in the gap between cardA (ends x=190) and cardB (starts x=210), inside row1.
    const s = slotAt(m, { x: 200, y: 45 })!;
    expect(s.containerId).toBe("row1");
    expect(s).toMatchObject({ anchorId: "cardB", position: "before", axis: "row" });
  });

  it("pops out one level to target the section's slot", () => {
    const m = buildStructuralModel(nested())!;
    // Same point, but popped out → the section (column) container's slot.
    const s = slotAt(m, { x: 200, y: 45 }, { popOut: 1 })!;
    expect(s.containerId).toBe("section");
    expect(s.axis).toBe("column");
  });

  it("excludes the dragged subtree — you can't drop a card inside itself", () => {
    const m = buildStructuralModel(nested())!;
    // Point inside cardC's box; dragging cardC excludes it, so the slot resolves on
    // the section (cardC's container), not inside cardC.
    const s = slotAt(m, { x: 200, y: 150 }, { excludeSubtree: ["cardC"] });
    expect(s?.containerId).toBe("section");
    expect(s?.anchorId).not.toBe("cardC");
  });

  it("returns null over no container", () => {
    const m = buildStructuralModel(nested())!;
    expect(slotAt(m, { x: 900, y: 900 })).toBeNull();
  });
});

describe("containerDepthAt / dropZonesFor", () => {
  it("reports the container stack depth for a pop-out affordance", () => {
    const m = buildStructuralModel(nested())!;
    // Inside row1: section + row1 = depth 2.
    expect(containerDepthAt(m, { x: 200, y: 45 })).toBe(2);
    // Inside the section gap between rows (y≈100): only the section.
    expect(containerDepthAt(m, { x: 200, y: 102 })).toBe(1);
  });

  it("enumerates every drop zone, minus a dragged subtree's anchors", () => {
    const m = buildStructuralModel(nested())!;
    const all = dropZonesFor(m);
    expect(all.length).toBeGreaterThan(0);
    const withoutCardB = dropZonesFor(m, ["cardB"]);
    expect(withoutCardB.some((s) => s.anchorId === "cardB")).toBe(false);
  });
});
