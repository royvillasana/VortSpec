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

/**
 * Owns the set of active agent runs and forwards their events to the renderer.
 * Every typed event is re-validated against the contract before it crosses the
 * IPC boundary, so a parser bug surfaces as a clear error, never a bad payload.
 */
const runs = new Map<string, AgentAdapter>();

export function startRun(
  sender: WebContents,
  opts: AgentRunOptions,
): { runId: string } {
  const runId = randomUUID();
  const adapter = new AgentAdapter();
  runs.set(runId, adapter);

  adapter.on("event", (raw: RunEvent) => {
    const parsed = runEventSchema.safeParse(raw);
    const event: RunEvent = parsed.success
      ? parsed.data
      : { kind: "error", message: "Invalid run event dropped at the boundary" };
    if (!sender.isDestroyed()) {
      sender.send(AGENT_EVENT_CHANNEL, { runId, event });
    }
    if (event.kind === "exit") {
      runs.delete(runId);
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
  runs.get(runId)?.cancel();
}
