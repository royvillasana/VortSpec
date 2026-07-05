import { useEffect, useReducer, useRef } from "react";
import type { AgentRunOptions } from "../../../shared/ipc";
import { api } from "./api";
import { initialRun, reduceRun, type RunModel } from "./run-model";

/**
 * Drives a single wrapped Claude Code run: subscribes to the agent event/raw
 * push channels, accumulates the friendly model, and exposes start/cancel.
 * Reused by the ad-hoc run view and every agent stage in the guided flow.
 */
export function useAgentRun(): {
  model: RunModel;
  running: boolean;
  start: (opts: AgentRunOptions) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
} {
  const [model, dispatch] = useReducer(reduceRun, initialRun);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    const offEvent = api.onAgentEvent(({ runId, event }) => {
      if (runId === runIdRef.current) dispatch({ type: "event", event });
    });
    const offRaw = api.onAgentRaw(({ runId, line }) => {
      if (runId === runIdRef.current) dispatch({ type: "raw", line });
    });
    return () => {
      offEvent();
      offRaw();
    };
  }, []);

  async function start(opts: AgentRunOptions): Promise<void> {
    dispatch({ type: "start" });
    const { runId } = await api.startRun(opts);
    runIdRef.current = runId;
  }

  async function cancel(): Promise<void> {
    if (runIdRef.current) await api.cancelRun(runIdRef.current);
  }

  return {
    model,
    running: model.status === "running",
    start,
    cancel,
    reset: () => dispatch({ type: "reset" }),
  };
}
