import { useEffect, useReducer, useRef } from "react";
import type { AgentRunOptions } from "@vortspec/core/ipc";
import { api } from "./api";
import { initialRun, reduceRun, type RunModel } from "@vortspec/ui/run-model";

/**
 * Drives a single wrapped Claude Code run: subscribes to the agent event/raw
 * push channels, accumulates the friendly model, and exposes start/cancel.
 * Reused by the ad-hoc run view and every agent stage in the guided flow.
 */
export function useAgentRun(): {
  model: RunModel;
  running: boolean;
  /** True once a session exists and no run is in flight — the Chat tab can reply. */
  canChat: boolean;
  start: (opts: AgentRunOptions) => Promise<void>;
  /** Send a chat follow-up: a new run resuming the captured session. `display`
   *  overrides the text shown in the user bubble (when the prompt carries hidden
   *  grounding the user shouldn't see echoed back). `override` patches the run
   *  options (e.g. a switched `model`). */
  send: (text: string, display?: string, override?: Partial<AgentRunOptions>) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
} {
  const [model, dispatch] = useReducer(reduceRun, initialRun);
  const runIdRef = useRef<string | null>(null);
  const baseOptsRef = useRef<AgentRunOptions | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Mirror the latest session id into a ref so `send` reads it without stale closure.
  useEffect(() => {
    sessionIdRef.current = model.sessionId;
  }, [model.sessionId]);

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
    baseOptsRef.current = opts;
    dispatch({ type: "start" });
    const { runId } = await api.startRun(opts);
    runIdRef.current = runId;
  }

  async function send(text: string, display?: string, override?: Partial<AgentRunOptions>): Promise<void> {
    const base = baseOptsRef.current;
    const sessionId = sessionIdRef.current;
    const trimmed = text.trim();
    if (!base || !sessionId || !trimmed || model.status === "running") return;
    dispatch({ type: "send", text: (display ?? text).trim() });
    // Persist an override (e.g. a switched model) onto the base opts so it sticks
    // for later turns too.
    const merged = override ? { ...base, ...override } : base;
    baseOptsRef.current = merged;
    const { runId } = await api.startRun({
      ...merged,
      prompt: trimmed,
      resumeSessionId: sessionId,
    });
    runIdRef.current = runId;
  }

  async function cancel(): Promise<void> {
    if (runIdRef.current) await api.cancelRun(runIdRef.current);
  }

  return {
    model,
    running: model.status === "running",
    canChat: model.status !== "running" && Boolean(model.sessionId),
    start,
    send,
    cancel,
    reset: () => dispatch({ type: "reset" }),
  };
}

/**
 * A read-only observer that follows whichever run is currently active — it
 * adopts the run id of each new run (on `system-init`) and mirrors its events.
 * Used by the full-screen Run View, which isn't the one that started the run.
 */
export function useLatestRun(): {
  model: RunModel;
  running: boolean;
  hasRun: boolean;
  cancel: () => Promise<void>;
} {
  const [model, dispatch] = useReducer(reduceRun, initialRun);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    const offEvent = api.onAgentEvent(({ runId, event }) => {
      // A new run starts: adopt its id and reset the mirror.
      if (event.kind === "system-init" && runId !== runIdRef.current) {
        runIdRef.current = runId;
        dispatch({ type: "reset" });
      } else if (runIdRef.current === null) {
        runIdRef.current = runId;
      }
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

  return {
    model,
    running: model.status === "running",
    hasRun: runIdRef.current !== null,
    cancel: async () => {
      if (runIdRef.current) await api.cancelRun(runIdRef.current);
    },
  };
}
