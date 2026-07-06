import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { getFlow } from "./flow-manager";
import { getInspectorComponents } from "../inspector/component-reader";
import { getInspectorTokens } from "../inspector/token-parser";
import { getManifest } from "../manifest/manifest-reader";
import { runSummarySchema, type RunSummary } from "../../shared/flow";
import type { RunHistoryResult } from "../../shared/flow";

/**
 * Run history (US-11). The "current" entry reflects the live state of the design
 * system — derived from files (tokens, the component roster, the manifest), not a
 * linear "N of M stages complete" checklist. A design system grows, so this entry
 * is always in progress; it never reports a terminal "passed/complete". Recorded
 * runs under `.vortspec/runs/*.json` are read too.
 */

type RunStageStatus = "done" | "review" | "cancelled" | "pending";

async function currentFlowRun(projectPath: string): Promise<RunSummary> {
  const [comps, toks, manifest, flow] = await Promise.all([
    getInspectorComponents(projectPath),
    getInspectorTokens(projectPath),
    getManifest(projectPath),
    getFlow(projectPath),
  ]);

  const total = comps.components.length;
  const built = comps.components.filter((c) => c.status !== "unknown").length;
  const verified = comps.components.filter((c) => c.status === "verified").length;
  const tokenCount = toks.tokens.length;
  const foundationReady = tokenCount > 0 || total > 0;
  const manifestApproved =
    flow.state.stages.find((s) => s.id === "design-manifest")?.status === "approved";

  // Living status — a design system is never "done", so the current entry is
  // always in progress. Outcome reflects activity, not completion.
  const outcome: RunSummary["outcome"] = "in-progress";

  const stage = (
    name: string,
    decision: string,
    status: RunStageStatus,
  ): { name: string; decision: string; status: RunStageStatus } => ({ name, decision, status });

  const stages = [
    stage(
      "Foundation",
      foundationReady ? `${tokenCount} tokens · ${total} detected` : "not set up",
      foundationReady ? "done" : "pending",
    ),
    stage(
      "Components",
      total > 0 ? `${built}/${total} built` : "none yet",
      built === 0 ? "pending" : built < total ? "review" : "done",
    ),
    stage(
      "Verification",
      built > 0 ? `${verified}/${built} verified` : "none yet",
      verified === 0 ? "pending" : verified < built ? "review" : "done",
    ),
    stage(
      "Design manifest",
      manifestApproved ? "approved" : manifest.exists ? "generated" : "not generated",
      manifestApproved ? "done" : manifest.exists ? "review" : "pending",
    ),
  ];

  const updatedAt =
    flow.state.stages
      .map((s) => s.updatedAt)
      .sort()
      .pop() ?? new Date(0).toISOString();

  const artifacts = [
    toks.tokenFile,
    total > 0 ? ".sdd-de/components.json" : null,
    manifest.exists ? manifest.path : null,
  ]
    .filter((a): a is string => Boolean(a))
    .map((a) => a.split("/").pop()!);

  return {
    id: "current",
    label: "Current",
    title: "Design system",
    outcome,
    updatedAt,
    stages,
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
