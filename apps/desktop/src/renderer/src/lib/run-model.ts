import type { RunEvent } from "../../../shared/ipc";

/** The renderer-side accumulated view of a wrapped Claude Code run. */
export type RunStatus = "idle" | "running" | "done" | "error" | "canceled";

export interface Activity {
  key: string;
  label: string;
  tone: "tool" | "notice" | "retry" | "error";
}

export interface RunModel {
  status: RunStatus;
  model?: string;
  streamingText: string;
  activity: Activity[];
  files: string[];
  raw: string[];
  mcpErrors: string[];
  result?: { isError: boolean; text?: string; costUsd?: number };
}

export const initialRun: RunModel = {
  status: "idle",
  streamingText: "",
  activity: [],
  files: [],
  raw: [],
  mcpErrors: [],
};

export type RunAction =
  | { type: "start" }
  | { type: "event"; event: RunEvent }
  | { type: "raw"; line: string }
  | { type: "reset" };

let activitySeq = 0;

export function reduceRun(state: RunModel, action: RunAction): RunModel {
  switch (action.type) {
    case "reset":
      return initialRun;
    case "start":
      return { ...initialRun, status: "running" };
    case "raw":
      return { ...state, raw: [...state.raw, action.line] };
    case "event":
      return applyEvent(state, action.event);
  }
}

function pushActivity(state: RunModel, label: string, tone: Activity["tone"]): RunModel {
  return {
    ...state,
    activity: [...state.activity, { key: `a${activitySeq++}`, label, tone }],
  };
}

function applyEvent(state: RunModel, event: RunEvent): RunModel {
  switch (event.kind) {
    case "system-init":
      return { ...state, model: event.model, mcpErrors: event.mcpErrors };
    case "text-delta":
      return { ...state, streamingText: state.streamingText + event.text };
    case "assistant-text":
      return {
        ...state,
        streamingText:
          state.streamingText + (state.streamingText ? "\n" : "") + event.text,
      };
    case "tool-use": {
      const label = event.path ? `${event.name} · ${event.path}` : event.name;
      const files =
        event.path && !state.files.includes(event.path)
          ? [...state.files, event.path]
          : state.files;
      return pushActivity({ ...state, files }, label, "tool");
    }
    case "tool-result":
      return event.isError
        ? pushActivity(state, "Tool reported an error", "error")
        : state;
    case "api-retry":
      return pushActivity(
        state,
        `Retrying (${event.errorCategory}) — attempt ${event.attempt}/${event.maxRetries}`,
        "retry",
      );
    case "notice":
      return pushActivity(state, event.text, "notice");
    case "result":
      return {
        ...state,
        status: event.isError ? "error" : "done",
        result: { isError: event.isError, text: event.text, costUsd: event.costUsd },
      };
    case "error":
      return pushActivity({ ...state, status: "error" }, event.message, "error");
    case "exit":
      return state.status === "running"
        ? { ...state, status: event.code === null ? "canceled" : "done" }
        : state;
  }
}

export function activityTone(tone: Activity["tone"]): string {
  switch (tone) {
    case "tool":
      return "text-vs-accent";
    case "retry":
      return "text-vs-warning";
    case "error":
      return "text-vs-error";
    default:
      return "text-vs-text-muted";
  }
}
