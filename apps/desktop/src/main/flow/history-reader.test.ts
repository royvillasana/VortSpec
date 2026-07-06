import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRunHistory } from "./history-reader";

describe("history-reader", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-hist-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("synthesizes the current flow as a run entry for a fresh project", async () => {
    const { runs } = await getRunHistory(dir);
    expect(runs).toHaveLength(1);
    const current = runs[0];
    expect(current.id).toBe("current");
    expect(current.outcome).toBe("in-progress");
    expect(current.stages.length).toBeGreaterThan(0);
    expect(current.stages.every((s) => s.status === "pending")).toBe(true);
  });

  it("includes valid recorded runs from .vortspec/runs and skips malformed ones", async () => {
    await mkdir(join(dir, ".vortspec", "runs"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec", "runs", "r1.json"),
      JSON.stringify({
        id: "r1",
        label: "#1",
        title: "Prior run",
        outcome: "passed",
        updatedAt: "2026-01-01T00:00:00.000Z",
        stages: [{ name: "Spec", decision: "approved", status: "done" }],
        artifacts: ["component-spec.md"],
      }),
      "utf8",
    );
    await writeFile(join(dir, ".vortspec", "runs", "bad.json"), "{ not json", "utf8");

    const { runs } = await getRunHistory(dir);
    // current flow + one valid recorded run (malformed skipped)
    expect(runs.map((r) => r.id)).toEqual(["current", "r1"]);
    expect(runs[1].title).toBe("Prior run");
  });
});
