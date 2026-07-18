import { describe, it, expect } from "vitest";
import { inferFlowAxis, visualRows, resolveInsertTarget, placeholderSizing } from "./insert-geometry";
import type { Rect } from "./inspector-bridge";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe("inferFlowAxis", () => {
  it("reads flex-direction", () => {
    expect(inferFlowAxis({ display: "flex" })).toBe("row");
    expect(inferFlowAxis({ display: "flex", "flex-direction": "row" })).toBe("row");
    expect(inferFlowAxis({ display: "flex", "flex-direction": "column" })).toBe("column");
    expect(inferFlowAxis({ display: "flex", "flex-direction": "column-reverse" })).toBe("column");
    expect(inferFlowAxis({ display: "inline-flex", "flex-direction": "row-reverse" })).toBe("row");
  });

  it("reads grid auto-flow", () => {
    expect(inferFlowAxis({ display: "grid" })).toBe("row");
    expect(inferFlowAxis({ display: "grid", "grid-auto-flow": "column" })).toBe("column");
    expect(inferFlowAxis({ display: "grid", "grid-auto-flow": "row dense" })).toBe("row");
  });

  it("treats block and anything else as a vertical (column) stack", () => {
    expect(inferFlowAxis({ display: "block" })).toBe("column");
    expect(inferFlowAxis({})).toBe("column");
    expect(inferFlowAxis({ display: "inline" })).toBe("column");
  });
});

describe("visualRows", () => {
  it("keeps a single row for an unwrapped flex row", () => {
    const children = [rect(0, 0, 90, 40), rect(100, 0, 90, 40), rect(200, 0, 90, 40)];
    expect(visualRows(children, "row")).toEqual([[0, 1, 2]]);
  });

  it("groups wrapped flex items by their visual row, not DOM order", () => {
    // Row 1: A,B,C at y=0; row 2: D,E at y=120. DOM order is A,B,C,D,E.
    const children = [
      rect(0, 0, 90, 40), // A
      rect(100, 0, 90, 40), // B
      rect(200, 0, 90, 40), // C
      rect(0, 120, 90, 40), // D
      rect(100, 120, 90, 40), // E
    ];
    expect(visualRows(children, "row")).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it("orders items within a row along the main axis even if DOM order differs", () => {
    const children = [rect(200, 0, 90, 40), rect(0, 0, 90, 40), rect(100, 0, 90, 40)];
    expect(visualRows(children, "row")).toEqual([[1, 2, 0]]);
  });
});

describe("resolveInsertTarget — gaps between siblings", () => {
  const row = { computed: { display: "flex" }, children: [rect(0, 0, 90, 40), rect(100, 0, 90, 40), rect(200, 0, 90, 40)] };

  it("targets the gap between two siblings, normalized to the following one + before", () => {
    // Pointer at x=95, in the 10px gap between item 0 (ends 90) and item 1 (starts 100).
    const t = resolveInsertTarget({ x: 95, y: 20 }, row);
    expect(t).toMatchObject({ anchorIndex: 1, position: "before", axis: "row" });
    // A vertical line at the gap midpoint (95), spanning the row height.
    expect(t?.line).toEqual({ x1: 95, y1: 0, x2: 95, y2: 40 });
  });

  it("normalizes 'after A' and 'before B' to the same slot", () => {
    // Just left of the gap centre (over the tail of A) and just right (over the head of B)
    // both resolve to the same normalized slot: before item 1.
    const nearA = resolveInsertTarget({ x: 92, y: 20 }, row);
    const nearB = resolveInsertTarget({ x: 103, y: 20 }, row);
    expect(nearA).toMatchObject({ anchorIndex: 1, position: "before" });
    expect(nearB).toMatchObject({ anchorIndex: 1, position: "before" });
  });

  it("draws a horizontal line for a column flow, spanning the anchor width", () => {
    const col = {
      computed: { display: "flex", "flex-direction": "column" },
      children: [rect(0, 0, 200, 40), rect(0, 60, 200, 40)],
    };
    // Pointer at y=52, in the gap between item 0 (ends 40) and item 1 (starts 60).
    const t = resolveInsertTarget({ x: 100, y: 52 }, col);
    expect(t).toMatchObject({ anchorIndex: 1, position: "before", axis: "column" });
    expect(t?.line).toEqual({ x1: 0, y1: 50, x2: 200, y2: 50 });
  });
});

describe("resolveInsertTarget — slop tolerance", () => {
  const row = { computed: { display: "flex" }, children: [rect(0, 0, 90, 40), rect(100, 0, 90, 40)] };

  it("hits a gap the pointer is near but not inside, within tolerance", () => {
    // Gap is [90,100]. Pointer at x=84 is 6px outside but within the 12px slop.
    expect(resolveInsertTarget({ x: 84, y: 20 }, row)).toMatchObject({ anchorIndex: 1, position: "before" });
  });

  it("respects a tightened slop", () => {
    // With slop 2, x=84 is no longer near the gap; it falls back to splitting item 0.
    const t = resolveInsertTarget({ x: 84, y: 20 }, row, { slop: 2 });
    // x=84 is past item 0's midpoint (45) → after item 0 → normalized to before item 1.
    expect(t).toMatchObject({ anchorIndex: 1, position: "before" });
  });
});

describe("resolveInsertTarget — nonsense gaps across a wrap are not offered", () => {
  it("does not offer a horizontal gap between the last item of a row and the first of the next", () => {
    // A,B on row 1 (y=0); C on row 2 (y=120). B and C are DOM-adjacent but on
    // different visual rows (no cross overlap), so the space between them must not
    // be offered as an in-row gap.
    const wrapped = {
      computed: { display: "flex" },
      children: [rect(0, 0, 90, 40), rect(100, 0, 90, 40), rect(0, 120, 90, 40)],
    };
    // Pointer between B's right edge and C, in the inter-row band (y≈80, x≈95).
    const t = resolveInsertTarget({ x: 95, y: 80 }, wrapped);
    // Whatever it resolves to, it must NOT be a gap whose line spans both rows
    // (i.e. a B|C cross-row gap). The line stays within a single row's band.
    if (t) {
      const spansBothRows = Math.min(t.line.y1, t.line.y2) < 40 && Math.max(t.line.y1, t.line.y2) > 120;
      expect(spansBothRows).toBe(false);
    }
  });
});

describe("resolveInsertTarget — midpoint fallback", () => {
  // A single lone element: no gaps, so the pointer splits it at its midpoint.
  const lone = { computed: { display: "flex" }, children: [rect(0, 0, 100, 40)] };

  it("targets 'before' when the pointer is before the element's midpoint", () => {
    // x=20 is before the midpoint (50) → insert before this element.
    expect(resolveInsertTarget({ x: 20, y: 20 }, lone)).toMatchObject({ anchorIndex: 0, position: "before" });
  });

  it("targets 'after' the lone element when past its midpoint (no following sibling)", () => {
    // x=80 is past the midpoint (50); with no next sibling it stays 'after'.
    expect(resolveInsertTarget({ x: 80, y: 20 }, lone)).toMatchObject({ anchorIndex: 0, position: "after" });
  });

  it("normalizes 'past the midpoint' to before the next sibling when one exists", () => {
    // Two wide items touching (no gap). Pointer past item 0's midpoint → before item 1.
    const touching = { computed: { display: "flex" }, children: [rect(0, 0, 100, 40), rect(100, 0, 100, 40)] };
    expect(resolveInsertTarget({ x: 70, y: 20 }, touching)).toMatchObject({ anchorIndex: 1, position: "before" });
  });
});

describe("resolveInsertTarget — edges and empties", () => {
  const row = { computed: { display: "flex" }, children: [rect(20, 0, 90, 40), rect(120, 0, 90, 40)] };

  it("targets before the first item at the leading edge", () => {
    expect(resolveInsertTarget({ x: 22, y: 20 }, row)).toMatchObject({ anchorIndex: 0, position: "before" });
  });

  it("targets after the last item at the trailing edge", () => {
    expect(resolveInsertTarget({ x: 208, y: 20 }, row)).toMatchObject({ anchorIndex: 1, position: "after" });
  });

  it("returns null for an empty container", () => {
    expect(resolveInsertTarget({ x: 10, y: 10 }, { computed: { display: "flex" }, children: [] })).toBeNull();
  });
});

describe("placeholderSizing", () => {
  it("fills its track implicitly in a row rather than taking a fixed width", () => {
    const s = placeholderSizing("row");
    expect(s.flex).toBe("0 1 auto");
    expect(s.width).toBeUndefined();
  });

  it("stretches across the column in a vertical flow", () => {
    expect(placeholderSizing("column").width).toBe("100%");
  });
});
