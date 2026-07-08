import { join, basename } from "node:path";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import type { AgentRunOptions, LastRun } from "@vortspec/core/run-events";
import { lastRunSchema } from "@vortspec/core/run-events";
import type { RunSummary } from "@vortspec/core/flow";

/**
 * Persists each finished agent run to `.vortspec/runs/<id>.json` (US-11 — run
 * history as plain files in the project). The History screen reads these back;
 * until now the only entry was the synthesized current flow.
 */

export interface RunAccumulator {
  files: Set<string>;
  isError: boolean;
  /** Captured from the run's system-init / result events; enables `--resume`. */
  sessionId?: string;
}

export function newAccumulator(): RunAccumulator {
  return { files: new Set(), isError: false };
}

// ── Last-run pointer (resume support) ────────────────────────────────
// A single `.vortspec/last-run.json` per project records the most recent run so
// the app can offer "resume where it left off" after a cancel, failure, or crash.

function lastRunPath(cwd: string): string {
  return join(cwd, ".vortspec", "last-run.json");
}

export async function readLastRun(cwd: string): Promise<LastRun | null> {
  const raw = await readFile(lastRunPath(cwd), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = lastRunSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeLastRun(cwd: string, run: LastRun): Promise<void> {
  const dir = join(cwd, ".vortspec");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(lastRunPath(cwd), JSON.stringify(run, null, 2), "utf8");
  } catch {
    /* best-effort; resume is an optimization over the file-derived path */
  }
}

/** Merge a patch into the existing last-run record (or seed a new one). */
export async function patchLastRun(cwd: string, patch: Partial<LastRun>): Promise<void> {
  const prev = await readLastRun(cwd);
  const next: LastRun = {
    sessionId: patch.sessionId ?? prev?.sessionId ?? null,
    title: patch.title ?? prev?.title ?? "Run",
    kind: patch.kind ?? prev?.kind,
    label: patch.label ?? prev?.label,
    total: patch.total ?? prev?.total ?? null,
    status: patch.status ?? prev?.status ?? "running",
    updatedAt: new Date().toISOString(),
  };
  await writeLastRun(cwd, next);
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
