import { describe, it, expect } from "vitest";
import { computeGraph, refKind } from "./git-graph";
import type { GitGraphCommit } from "@vortspec/core/ipc";

function commit(hash: string, parents: string[]): GitGraphCommit {
  return { hash, shortHash: hash, parents, author: "dev", date: "now", subject: hash, refs: [] };
}

describe("computeGraph", () => {
  it("keeps a linear history in a single lane", () => {
    const { rows, maxLanes } = computeGraph([
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(maxLanes).toBe(1);
  });

  it("lays a branch + merge across two lanes", () => {
    // m is a merge of c and d; c and d both come off b.
    const { rows, maxLanes } = computeGraph([
      commit("m", ["c", "d"]),
      commit("d", ["b"]),
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    const laneOf = (h: string): number => rows.find((r) => r.commit.hash === h)!.lane;
    expect(laneOf("m")).toBe(0);
    expect(laneOf("d")).toBe(1); // the forked branch gets its own lane
    expect(laneOf("c")).toBe(0);
    expect(maxLanes).toBe(2);
    // The merge commit forks out to two parents (two outgoing lines from its dot).
    const mOut = rows[0].lines.filter((l) => l.y1 === 0.5);
    expect(mOut.length).toBe(2);
  });

  it("frees the lane at a root commit", () => {
    const { rows } = computeGraph([commit("a", [])]);
    // No outgoing lines from a parentless commit.
    expect(rows[0].lines.filter((l) => l.y2 === 1).length).toBe(0);
  });
});

describe("refKind", () => {
  it("classifies decorations", () => {
    expect(refKind("HEAD -> main")).toEqual({ kind: "head", label: "main" });
    expect(refKind("origin/main")).toEqual({ kind: "remote", label: "origin/main" });
    expect(refKind("tag: v1.0")).toEqual({ kind: "tag", label: "v1.0" });
    expect(refKind("feature")).toEqual({ kind: "local", label: "feature" });
  });
});
