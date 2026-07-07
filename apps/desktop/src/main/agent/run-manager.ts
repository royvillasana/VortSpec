import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { AgentAdapter } from "./adapter";
import {
  AGENT_EVENT_CHANNEL,
  AGENT_RAW_CHANNEL,
  runEventSchema,
  type AgentRunOptions,
  type RunEvent,
} from "../../shared/run-events";
import { newAccumulator, recordRun, patchLastRun, readLastRun, runTitle } from "./run-recorder";
import type { LastRun } from "../../shared/run-events";

/**
 * Owns the set of active agent runs and forwards their events to the renderer.
 * Every typed event is re-validated against the contract before it crosses the
 * IPC boundary, so a parser bug surfaces as a clear error, never a bad payload.
 * We track each run's `cwd` so the UI can tell whether a project already has a
 * run in flight (reconnect after navigating away; prevent duplicate concurrent
 * runs on the same files).
 */
const runs = new Map<string, { adapter: AgentAdapter; cwd: string }>();

/** Whether the given project folder currently has an agent run in flight. */
export function hasActiveRun(projectPath: string): boolean {
  for (const { cwd } of runs.values()) if (cwd === projectPath) return true;
  return false;
}

export function startRun(
  sender: WebContents,
  opts: AgentRunOptions,
): { runId: string } {
  const runId = randomUUID();
  const adapter = new AgentAdapter();
  runs.set(runId, { adapter, cwd: opts.cwd });
  const acc = newAccumulator();

  // Seed the last-run pointer as "running" so an app crash/close mid-run is
  // detectable next launch (status "running" with no live process = interrupted).
  void patchLastRun(opts.cwd, {
    sessionId: opts.resumeSessionId ?? null,
    title: opts.meta?.label ?? runTitle(opts.prompt),
    kind: opts.meta?.kind,
    label: opts.meta?.label,
    total: opts.meta?.total ?? null,
    status: "running",
  });

  adapter.on("event", (raw: RunEvent) => {
    const parsed = runEventSchema.safeParse(raw);
    const event: RunEvent = parsed.success
      ? parsed.data
      : { kind: "error", message: "Invalid run event dropped at the boundary" };

    // Accumulate what happened, for the run-history record.
    if (event.kind === "tool-use" && event.path) acc.files.add(event.path);
    if ((event.kind === "result" && event.isError) || event.kind === "error") acc.isError = true;
    // Capture the session id so an interrupted run can be `--resume`d.
    if ((event.kind === "system-init" || event.kind === "result") && event.sessionId) {
      if (acc.sessionId !== event.sessionId) {
        acc.sessionId = event.sessionId;
        void patchLastRun(opts.cwd, { sessionId: event.sessionId });
      }
    }

    if (!sender.isDestroyed()) {
      sender.send(AGENT_EVENT_CHANNEL, { runId, event });
    }
    if (event.kind === "exit") {
      runs.delete(runId);
      const status: LastRun["status"] =
        event.code === null ? "cancelled" : acc.isError || event.code !== 0 ? "failed" : "passed";
      void patchLastRun(opts.cwd, { status });
      void recordRun(opts, acc, event.code);
    }
  });

  adapter.on("raw", (line: string) => {
    if (!sender.isDestroyed()) {
      sender.send(AGENT_RAW_CHANNEL, { runId, line });
    }
  });

  adapter.start(opts);
  return { runId };
}

export function cancelRun(runId: string): void {
  runs.get(runId)?.adapter.cancel();
}

/**
 * The last run for a project, if one can be resumed. Returns null when the last
 * run completed successfully or none was recorded. A persisted "running" status
 * with no live process (e.g. after an app restart) counts as interrupted.
 */
export async function getLastRun(projectPath: string): Promise<LastRun | null> {
  const last = await readLastRun(projectPath);
  if (!last) return null;
  if (last.status === "passed") return null;
  // Still genuinely running here — the in-flight banner covers that, not resume.
  if (last.status === "running" && hasActiveRun(projectPath)) return null;
  return last;
}
