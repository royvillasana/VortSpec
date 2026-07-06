import { join, basename } from "node:path";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import type { AgentRunOptions } from "../../shared/run-events";
import type { RunSummary } from "../../shared/flow";

/**
 * Persists each finished agent run to `.vortspec/runs/<id>.json` (US-11 — run
 * history as plain files in the project). The History screen reads these back;
 * until now the only entry was the synthesized current flow.
 */

export interface RunAccumulator {
  files: Set<string>;
  isError: boolean;
}

export function newAccumulator(): RunAccumulator {
  return { files: new Set(), isError: false };
}

/** A short, human title for the run from its prompt (slash command or first line). */
export function runTitle(prompt: string): string {
  const first = prompt.split("\n").find((l) => l.trim()) ?? "Run";
  const cmd = first.trim().match(/^\/([\w-]+)/);
  if (cmd) return cmd[1].replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return first.trim().slice(0, 60);
}

export async function recordRun(
  opts: AgentRunOptions,
  acc: RunAccumulator,
  exitCode: number | null,
): Promise<void> {
  const dir = join(opts.cwd, ".vortspec", "runs");
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    return;
  }

  let seq = 1;
  try {
    seq = (await readdir(dir)).filter((n) => n.endsWith(".json")).length + 1;
  } catch {
    /* first run */
  }

  const cancelled = exitCode === null;
  const failed = !cancelled && (acc.isError || exitCode !== 0);
  const title = runTitle(opts.prompt);

  const summary: RunSummary = {
    id: `run-${Date.now()}-${seq}`,
    label: `#${seq}`,
    title,
    outcome: cancelled ? "cancelled" : failed ? "failed" : "passed",
    updatedAt: new Date().toISOString(),
    stages: [
      {
        name: title,
        decision: cancelled ? "cancelled" : failed ? "failed" : "completed",
        status: cancelled ? "cancelled" : failed ? "cancelled" : "done",
      },
    ],
    artifacts: [...acc.files].map((f) => basename(f)),
  };

  await writeFile(join(dir, `${summary.id}.json`), JSON.stringify(summary, null, 2), "utf8").catch(
    () => undefined,
  );
}
