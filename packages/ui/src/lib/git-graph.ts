import type { GitGraphCommit } from "@vortspec/core/ipc";

/**
 * Commit-graph lane layout (change: source-control-commit-graph).
 *
 * A GitLens/Git-Graph-style lane algorithm: given commits in date/topological
 * order, assign each a column ("lane") and the line segments that connect it to
 * its parents, so branches, merges, and forks render as a bifurcating graph.
 * Pure (no DOM) so it is unit-testable.
 */

export interface GraphLine {
  /** Lane indices + vertical fraction (0 = top edge, 0.5 = commit dot, 1 = bottom edge). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface GraphRow {
  commit: GitGraphCommit;
  lane: number;
  color: string;
  lines: GraphLine[];
}

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#8b5cf6",
  "#eab308",
  "#06b6d4",
];

export function computeGraph(commits: GitGraphCommit[]): { rows: GraphRow[]; maxLanes: number } {
  const rows: GraphRow[] = [];
  const lanes: (string | null)[] = []; // hash each lane expects next (or null = free)
  const laneColors: string[] = [];
  let colorCounter = 0;
  const nextColor = (): string => COLORS[colorCounter++ % COLORS.length];
  const freeLane = (): number => {
    const i = lanes.indexOf(null);
    return i === -1 ? lanes.length : i;
  };
  let maxLanes = 0;

  for (const commit of commits) {
    const topLanes = lanes.slice();
    const topColors = laneColors.slice();
    const incoming: number[] = [];
    topLanes.forEach((h, i) => {
      if (h === commit.hash) incoming.push(i);
    });

    let lane: number;
    let color: string;
    if (incoming.length > 0) {
      lane = incoming[0];
      color = laneColors[lane];
    } else {
      lane = freeLane();
      color = nextColor();
      laneColors[lane] = color;
    }

    // This commit consumes every lane that expected it; reassign `lane` to a parent.
    for (const i of incoming) lanes[i] = null;
    lanes[lane] = null;

    const parentLanes: number[] = [];
    commit.parents.forEach((p, idx) => {
      let pl = lanes.indexOf(p);
      if (pl === -1) {
        if (idx === 0) {
          pl = lane; // first parent continues in the commit's lane
          lanes[lane] = p;
          laneColors[lane] = color;
        } else {
          pl = freeLane(); // extra parent of a merge → a new incoming line
          lanes[pl] = p;
          laneColors[pl] = nextColor();
        }
      }
      parentLanes.push(pl);
    });

    const lines: GraphLine[] = [];
    // Lanes that pass straight through (unrelated branches above and below).
    const len = Math.max(topLanes.length, lanes.length);
    for (let i = 0; i < len; i++) {
      const h = topLanes[i];
      if (!h || incoming.includes(i) || i === lane) continue;
      if (lanes[i] === h) {
        lines.push({ x1: i, y1: 0, x2: i, y2: 1, color: topColors[i] });
      } else {
        const now = lanes.indexOf(h);
        if (now !== -1) {
          lines.push({ x1: i, y1: 0, x2: i, y2: 0.5, color: topColors[i] });
          lines.push({ x1: i, y1: 0.5, x2: now, y2: 1, color: topColors[i] });
        }
      }
    }
    // Incoming lanes converge into the commit dot.
    for (const i of incoming) lines.push({ x1: i, y1: 0, x2: lane, y2: 0.5, color: topColors[i] ?? color });
    // The commit forks out to its parents.
    for (const pl of parentLanes) lines.push({ x1: lane, y1: 0.5, x2: pl, y2: 1, color: laneColors[pl] });

    rows.push({ commit, lane, color, lines });
    maxLanes = Math.max(maxLanes, lanes.filter(Boolean).length, lane + 1, ...parentLanes.map((p) => p + 1));
  }
  return { rows, maxLanes: Math.max(1, maxLanes) };
}

/** Classify a decoration ref for badge styling. */
export function refKind(ref: string): { kind: "head" | "local" | "remote" | "tag"; label: string } {
  if (ref.startsWith("tag: ")) return { kind: "tag", label: ref.slice(5) };
  if (ref.startsWith("HEAD -> ")) return { kind: "head", label: ref.slice(8) };
  if (ref === "HEAD") return { kind: "head", label: "HEAD" };
  if (ref.startsWith("origin/") || ref.includes("/")) return { kind: "remote", label: ref };
  return { kind: "local", label: ref };
}
