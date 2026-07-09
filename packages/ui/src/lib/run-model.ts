import type { RunEvent } from "@vortspec/core/ipc";

/** The renderer-side accumulated view of a wrapped Claude Code run. */
export type RunStatus = "idle" | "running" | "done" | "error" | "canceled";

export interface Activity {
  key: string;
  label: string;
  tone: "tool" | "notice" | "retry" | "error";
}

/** One turn in the Chat tab's transcript. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface RunModel {
  status: RunStatus;
  model?: string;
  /** Claude Code session id, captured from init/result — reused to resume for chat. */
  sessionId?: string;
  /** Committed conversation turns (assistant prose + the user's replies). */
  messages: ChatMessage[];
  streamingText: string;
  activity: Activity[];
  files: string[];
  raw: string[];
  mcpErrors: string[];
  /** Extended session status from the init event (Claude Code parity). */
  session?: {
    model?: string;
    skills: string[];
    agents: string[];
    tools: string[];
    plugins: string[];
    slashCommands: string[];
    permissionMode?: string;
    mcpStatuses: { name: string; status: string }[];
  };
  result?: { isError: boolean; text?: string; costUsd?: number };
}

export const initialRun: RunModel = {
  status: "idle",
  messages: [],
  streamingText: "",
  activity: [],
  files: [],
  raw: [],
  mcpErrors: [],
};

export type RunAction =
  | { type: "start" }
  | { type: "send"; text: string }
  | { type: "event"; event: RunEvent }
  | { type: "raw"; line: string }
  | { type: "reset" };

let activitySeq = 0;
let messageSeq = 0;

export function reduceRun(state: RunModel, action: RunAction): RunModel {
  switch (action.type) {
    case "reset":
      return initialRun;
    case "start":
      // Fresh stage run — wipe the transcript and start a new session.
      return { ...initialRun, status: "running" };
    case "send":
      // Chat follow-up — keep the transcript + session, append the user turn.
      return {
        ...state,
        status: "running",
        streamingText: "",
        result: undefined,
        messages: [
          ...state.messages,
          { id: `m${messageSeq++}`, role: "user", text: action.text },
        ],
      };
    case "raw":
      return { ...state, raw: [...state.raw, action.line] };
    case "event":
      return applyEvent(state, action.event);
  }
}

/** Move any streamed assistant prose into a committed transcript turn. */
function commitStreaming(state: RunModel): ChatMessage[] {
  if (!state.streamingText.trim()) return state.messages;
  return [
    ...state.messages,
    { id: `m${messageSeq++}`, role: "assistant", text: state.streamingText },
  ];
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
      return {
        ...state,
        model: event.model,
        mcpErrors: event.mcpErrors,
        sessionId: event.sessionId ?? state.sessionId,
        session: {
          model: event.model,
          skills: event.skills ?? [],
          agents: event.agents ?? [],
          tools: event.tools,
          plugins: event.plugins ?? [],
          slashCommands: event.slashCommands ?? [],
          permissionMode: event.permissionMode,
          mcpStatuses: event.mcpStatuses ?? [],
        },
      };
    case "text-delta":
      // Live preview of the message currently being generated.
      return { ...state, streamingText: state.streamingText + event.text };
    case "assistant-text":
      // A finalized assistant message → its own bubble. Supersedes the streamed
      // preview (which was the same text), so clear it to avoid duplication.
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `m${messageSeq++}`, role: "assistant", text: event.text },
        ],
        streamingText: "",
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
        messages: commitStreaming(state),
        streamingText: "",
        sessionId: event.sessionId ?? state.sessionId,
        result: { isError: event.isError, text: event.text, costUsd: event.costUsd },
      };
    case "error":
      return pushActivity({ ...state, status: "error" }, event.message, "error");
    case "exit":
      // Terminal fallback if no `result` arrived (e.g. crash/cancel): still commit prose.
      return state.status === "running"
        ? {
            ...state,
            status: event.code === null ? "canceled" : "done",
            messages: commitStreaming(state),
            streamingText: "",
          }
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
