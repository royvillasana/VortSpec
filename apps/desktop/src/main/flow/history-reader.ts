import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { getFlow } from "./flow-manager";
import { runSummarySchema, type RunSummary, type StageStatus } from "../../shared/flow";
import type { RunHistoryResult } from "../../shared/flow";

/**
 * Run history (US-11). VortSpec does not yet persist past runs, so the primary
 * source is the current flow (its stages + decisions ARE a run timeline),
 * synthesized here. Any recorded runs under `.vortspec/runs/*.json` are read too,
 * so the screen lights up automatically once run recording lands.
 */

function stageStatus(s: StageStatus): "done" | "review" | "cancelled" | "pending" {
  if (s === "approved") return "done";
  if (s === "needs-review") return "review";
  if (s === "failed") return "cancelled";
  return "pending"; // running / pending
}

function decisionText(status: StageStatus, notes?: string): string {
  if (notes) return "changes requested";
  return {
    approved: "approved",
    "needs-review": "awaiting approval",
    running: "running",
    failed: "failed",
    pending: "not started",
  }[status];
}

async function currentFlowRun(projectPath: string): Promise<RunSummary> {
  const flow = await getFlow(projectPath);
  const stageOf = (id: string) => flow.state.stages.find((s) => s.id === id);
  const statuses = flow.state.stages.map((s) => s.status);
  const requiredDone = flow.definitions
    .filter((d) => !d.optional)
    .every((d) => stageOf(d.id)?.status === "approved");
  const outcome: RunSummary["outcome"] = statuses.includes("running")
    ? "running"
    : statuses.includes("failed")
      ? "failed"
      : statuses.includes("needs-review")
        ? "in-review"
        : requiredDone
          ? "passed"
          : "in-progress";

  const updatedAt = flow.state.stages
    .map((s) => s.updatedAt)
    .sort()
    .pop() ?? new Date(0).toISOString();

  const artifacts = [
    ...new Set(
      flow.definitions
        .map((d) => d.artifact ?? d.artifactGlob)
        .filter((a): a is string => Boolean(a))
        .map((a) => a.split("/").pop()!),
    ),
  ];

  return {
    id: "current",
    label: "Current",
    title: "Design system flow",
    outcome,
    updatedAt,
    stages: flow.definitions.map((d) => {
      const st = stageOf(d.id);
      return {
        name: d.title,
        decision: st ? decisionText(st.status, st.decisionNotes) : "not started",
        status: st ? stageStatus(st.status) : "pending",
      };
    }),
    artifacts,
  };
}

async function recordedRuns(projectPath: string): Promise<RunSummary[]> {
  const dir = join(projectPath, ".vortspec", "runs");
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const runs: RunSummary[] = [];
  for (const name of entries.filter((n) => n.endsWith(".json"))) {
    const raw = await readFile(join(dir, name), "utf8").catch(() => null);
    if (!raw) continue;
    try {
      const parsed = runSummarySchema.safeParse(JSON.parse(raw));
      if (parsed.success) runs.push(parsed.data);
    } catch {
      /* skip malformed run file */
    }
  }
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRunHistory(projectPath: string): Promise<RunHistoryResult> {
  const [current, recorded] = await Promise.all([
    currentFlowRun(projectPath),
    recordedRuns(projectPath),
  ]);
  return { runs: [current, ...recorded] };
}
