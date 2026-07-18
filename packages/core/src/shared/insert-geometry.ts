import type { Rect } from "./inspector-bridge";

/**
 * Insert-mode gap geometry (change: canvas-compose-and-preview-bar, tasks §5).
 *
 * Pure, framework-free hit-testing for the space *between* sibling elements —
 * the part that decides whether the slot picker feels like a tool or a test of
 * mouse precision. It runs in the guest over a container's computed style and its
 * children's rects (all guest-viewport coords), so it is kept here, pure and
 * unit-tested, rather than tangled into the guest's DOM plumbing.
 *
 * The three things that separate a working gap picker from a frustrating one, per
 * the Impeccable reference (`insert-ui.mjs`):
 *   1. cluster siblings into VISUAL rows by cross-axis position, so wrapped flex
 *      rows are grouped by what's actually adjacent on screen, not by DOM order;
 *   2. require a minimum cross-axis overlap before offering a gap, so the space
 *      across a wrap boundary isn't offered as a nonsense slot;
 *   3. apply SLOP around a gap, so pointing needn't be pixel-perfect.
 *
 * Every hit is normalized to **anchor element + `before`/`after`**, so "after A"
 * and "before B" — the two names for one slot — resolve identically.
 */

/** The container's main (item-flow) axis. `row` = items flow horizontally. */
export type FlowAxis = "row" | "column";

export type InsertPosition = "before" | "after";

export interface InsertTarget {
  /** Index into the container's `children` array that the slot is anchored to. */
  anchorIndex: number;
  /** Where the new content goes relative to the anchor. Normalized to `before`
   *  wherever a following sibling exists; only the run's tail stays `after`. */
  position: InsertPosition;
  /** The container's flow axis — drives the cursor and the line orientation. */
  axis: FlowAxis;
  /** The insertion line, a segment drawn ACROSS the flow axis, in guest coords. */
  line: { x1: number; y1: number; x2: number; y2: number };
}

export interface HitOptions {
  /** Pointer tolerance (px) around a gap and a run's ends. */
  slop?: number;
  /** Minimum cross-axis overlap (fraction of the smaller item) to call two
   *  items same-row and offer the gap between them. */
  minCrossOverlap?: number;
  /** Cross-start proximity (px) that clusters items into one visual row. */
  rowThreshold?: number;
}

const DEFAULTS: Required<HitOptions> = { slop: 12, minCrossOverlap: 0.2, rowThreshold: 8 };

/**
 * Infer the flow axis from the container's own computed style: flex direction,
 * grid auto-flow, else block (children stack vertically → column).
 */
export function inferFlowAxis(computed: Record<string, string>): FlowAxis {
  const display = (computed["display"] ?? "").trim();
  if (display === "flex" || display === "inline-flex") {
    const dir = (computed["flex-direction"] ?? "row").trim();
    return dir.startsWith("column") ? "column" : "row";
  }
  if (display === "grid" || display === "inline-grid") {
    // auto-flow "column" packs items down a column first → main axis vertical.
    const flow = (computed["grid-auto-flow"] ?? "row").trim();
    return flow.includes("column") ? "column" : "row";
  }
  return "column";
}

interface Item {
  index: number;
  rect: Rect;
}

const mainStart = (r: Rect, a: FlowAxis): number => (a === "row" ? r.x : r.y);
const mainEnd = (r: Rect, a: FlowAxis): number => (a === "row" ? r.x + r.width : r.y + r.height);
const crossStart = (r: Rect, a: FlowAxis): number => (a === "row" ? r.y : r.x);
const crossEnd = (r: Rect, a: FlowAxis): number => (a === "row" ? r.y + r.height : r.x + r.width);
const mainOf = (p: { x: number; y: number }, a: FlowAxis): number => (a === "row" ? p.x : p.y);
const crossOf = (p: { x: number; y: number }, a: FlowAxis): number => (a === "row" ? p.y : p.x);

/** Cross-axis overlap of two rects, as a fraction of the smaller one's extent. */
function crossOverlap(a: Rect, b: Rect, axis: FlowAxis): number {
  const lo = Math.max(crossStart(a, axis), crossStart(b, axis));
  const hi = Math.min(crossEnd(a, axis), crossEnd(b, axis));
  const overlap = Math.max(0, hi - lo);
  const minExtent = Math.min(crossEnd(a, axis) - crossStart(a, axis), crossEnd(b, axis) - crossStart(b, axis));
  return minExtent <= 0 ? 0 : overlap / minExtent;
}

/**
 * Group children into visual rows by cross-start proximity, each row sorted along
 * the main axis. This is what makes a wrapped flex container behave: items on the
 * same screen row cluster together regardless of DOM order.
 */
export function visualRows(children: Rect[], axis: FlowAxis, rowThreshold = DEFAULTS.rowThreshold): number[][] {
  const items: Item[] = children.map((rect, index) => ({ index, rect }));
  const sorted = [...items].sort(
    (a, b) => crossStart(a.rect, axis) - crossStart(b.rect, axis) || mainStart(a.rect, axis) - mainStart(b.rect, axis),
  );
  const runs: Item[][] = [];
  for (const it of sorted) {
    const run = runs.find((r) => Math.abs(crossStart(r[0].rect, axis) - crossStart(it.rect, axis)) <= rowThreshold);
    if (run) run.push(it);
    else runs.push([it]);
  }
  for (const r of runs) r.sort((a, b) => mainStart(a.rect, axis) - mainStart(b.rect, axis));
  return runs.map((r) => r.map((it) => it.index));
}

function lineAt(main: number, crossLo: number, crossHi: number, axis: FlowAxis): InsertTarget["line"] {
  return axis === "row"
    ? { x1: main, y1: crossLo, x2: main, y2: crossHi }
    : { x1: crossLo, y1: main, x2: crossHi, y2: main };
}

/** Pick the visual row nearest the pointer on the cross axis (0 distance = inside). */
function pickRow(rows: Item[][], pointer: { x: number; y: number }, axis: FlowAxis): Item[] | null {
  const pc = crossOf(pointer, axis);
  let best: Item[] | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const lo = Math.min(...row.map((it) => crossStart(it.rect, axis)));
    const hi = Math.max(...row.map((it) => crossEnd(it.rect, axis)));
    const dist = pc < lo ? lo - pc : pc > hi ? pc - hi : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  return best;
}

/**
 * Resolve the insertion target under the pointer, or null when there is nothing
 * to target (an empty container). Tries, in order: a gap between two same-row
 * siblings (within slop), the leading/trailing edge of the row, then splitting
 * the element under the pointer at its midpoint.
 */
export function resolveInsertTarget(
  pointer: { x: number; y: number },
  container: { computed: Record<string, string>; children: Rect[] },
  opts: HitOptions = {},
): InsertTarget | null {
  const axis = inferFlowAxis(container.computed);
  const slop = opts.slop ?? DEFAULTS.slop;
  const minOverlap = opts.minCrossOverlap ?? DEFAULTS.minCrossOverlap;
  const rowThreshold = opts.rowThreshold ?? DEFAULTS.rowThreshold;
  if (container.children.length === 0) return null;

  const rowIndexes = visualRows(container.children, axis, rowThreshold);
  const rows: Item[][] = rowIndexes.map((r) => r.map((index) => ({ index, rect: container.children[index] })));
  const row = pickRow(rows, pointer, axis);
  if (!row) return null;
  const pm = mainOf(pointer, axis);

  // 1) A gap between two same-row siblings that genuinely overlap on the cross axis.
  for (let i = 0; i < row.length - 1; i++) {
    const a = row[i];
    const b = row[i + 1];
    if (crossOverlap(a.rect, b.rect, axis) < minOverlap) continue; // nonsense gap across a wrap
    const gStart = mainEnd(a.rect, axis);
    const gEnd = mainStart(b.rect, axis);
    if (pm >= Math.min(gStart, gEnd) - slop && pm <= Math.max(gStart, gEnd) + slop) {
      const crossLo = Math.min(crossStart(a.rect, axis), crossStart(b.rect, axis));
      const crossHi = Math.max(crossEnd(a.rect, axis), crossEnd(b.rect, axis));
      return { anchorIndex: b.index, position: "before", axis, line: lineAt((gStart + gEnd) / 2, crossLo, crossHi, axis) };
    }
  }

  // 2) The leading / trailing edge of the row.
  const first = row[0];
  const last = row[row.length - 1];
  if (pm < mainStart(first.rect, axis) + slop) {
    return {
      anchorIndex: first.index,
      position: "before",
      axis,
      line: lineAt(mainStart(first.rect, axis), crossStart(first.rect, axis), crossEnd(first.rect, axis), axis),
    };
  }
  if (pm > mainEnd(last.rect, axis) - slop) {
    return {
      anchorIndex: last.index,
      position: "after",
      axis,
      line: lineAt(mainEnd(last.rect, axis), crossStart(last.rect, axis), crossEnd(last.rect, axis), axis),
    };
  }

  // 3) Fallback: split the element under the pointer at its midpoint. Past the
  //    midpoint inserts AFTER it (normalized to `before` the next sibling when one
  //    exists); before the midpoint inserts before it.
  const pos = row.findIndex((it) => pm >= mainStart(it.rect, axis) && pm <= mainEnd(it.rect, axis));
  if (pos >= 0) {
    const over = row[pos];
    const mid = (mainStart(over.rect, axis) + mainEnd(over.rect, axis)) / 2;
    if (pm >= mid) {
      const next = row[pos + 1];
      if (next) {
        return {
          anchorIndex: next.index,
          position: "before",
          axis,
          line: lineAt(mainStart(next.rect, axis), crossStart(next.rect, axis), crossEnd(next.rect, axis), axis),
        };
      }
      return {
        anchorIndex: over.index,
        position: "after",
        axis,
        line: lineAt(mainEnd(over.rect, axis), crossStart(over.rect, axis), crossEnd(over.rect, axis), axis),
      };
    }
    return {
      anchorIndex: over.index,
      position: "before",
      axis,
      line: lineAt(mainStart(over.rect, axis), crossStart(over.rect, axis), crossEnd(over.rect, axis), axis),
    };
  }

  return null;
}

/**
 * Implicit placeholder sizing (task 5.7): fill the track in a flex/grid row rather
 * than adopt a fixed pixel width, so inserting into a row doesn't inherit the
 * parent's full width and blow up the layout. Returned as inline style props.
 */
export function placeholderSizing(axis: FlowAxis): Record<string, string> {
  return axis === "row"
    ? { flex: "0 1 auto", "min-width": "48px", "min-height": "24px", "align-self": "stretch" }
    : { "align-self": "stretch", width: "100%", "min-height": "48px" };
}
