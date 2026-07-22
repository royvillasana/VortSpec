import type { RunEvent, RunLimit } from "@vortspec/core/ipc";

/** The renderer-side accumulated view of a wrapped Claude Code run.
 *  `paused` = stopped on the Claude usage limit; resumable once it resets. */
export type RunStatus = "idle" | "running" | "done" | "error" | "canceled" | "paused";

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
  /** Monotonic order across messages AND tool steps, so the two can be interleaved
   *  chronologically in the chat (text → the files it worked on → the next text …). */
  seq?: number;
}

/** One item of Claude's plan (its TodoWrite checklist). */
export interface PlanItem {
  content: string;
  status: string;
}

/** A tool call Claude made, paired with its result — rendered as a Tool card. */
export interface ToolStep {
  id: string;
  name: string;
  detail?: string;
  /** The tool's output text (from its result), shown when the card expands. */
  output?: string;
  status: "running" | "ok" | "error";
  /** Shared order with ChatMessage (see ChatMessage.seq) for chronological interleaving. */
  seq?: number;
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
  steps: ToolStep[];
  /** Accumulated extended-thinking text for the current turn (Reasoning block). */
  reasoning: string;
  /** Claude's latest plan checklist (from TodoWrite), if any. */
  plan: PlanItem[];
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
  result?: {
    isError: boolean;
    text?: string;
    costUsd?: number;
    usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number };
  };
  /** Set when status is "paused" — the usage-limit reason + reset time. */
  limit?: RunLimit;
}

export const initialRun: RunModel = {
  status: "idle",
  messages: [],
  streamingText: "",
  activity: [],
  steps: [],
  reasoning: "",
  plan: [],
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
// Shared monotonic order across messages AND tool steps so the chat can interleave them.
let orderSeq = 0;

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
        reasoning: "",
        result: undefined,
        messages: [
          ...state.messages,
          { id: `m${messageSeq++}`, role: "user", text: action.text, seq: orderSeq++ },
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
    { id: `m${messageSeq++}`, role: "assistant", text: state.streamingText, seq: orderSeq++ },
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
    case "thinking-delta":
      // Extended-thinking preview → the collapsible Reasoning block.
      return { ...state, reasoning: state.reasoning + event.text };
    case "plan":
      // TodoWrite → the latest plan checklist (each call replaces the prior state).
      return { ...state, plan: event.items };
    case "assistant-text":
      // A finalized assistant message → its own bubble. Supersedes the streamed
      // preview (which was the same text), so clear it to avoid duplication.
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `m${messageSeq++}`, role: "assistant", text: event.text, seq: orderSeq++ },
        ],
        streamingText: "",
      };
    case "tool-use": {
      const label = event.path ? `${event.name} · ${event.path}` : event.name;
      const files =
        event.path && !state.files.includes(event.path)
          ? [...state.files, event.path]
          : state.files;
      const step: ToolStep = { id: `s${activitySeq}`, name: event.name, detail: event.path ?? event.input, status: "running", seq: orderSeq++ };
      return pushActivity({ ...state, files, steps: [...state.steps, step] }, label, "tool");
    }
    case "tool-result": {
      // Resolve the most recent still-running step.
      const steps = [...state.steps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].status === "running") {
          steps[i] = { ...steps[i], status: event.isError ? "error" : "ok", output: event.text };
          break;
        }
      }
      const next = { ...state, steps };
      return event.isError ? pushActivity(next, "Tool reported an error", "error") : next;
    }
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
        result: { isError: event.isError, text: event.text, costUsd: event.costUsd, usage: event.usage },
      };
    case "error":
      return pushActivity({ ...state, status: "error" }, event.message, "error");
    case "limit-reached":
      // A pause, not an error — arrives after the `result`, so it wins the status.
      return {
        ...state,
        status: "paused",
        messages: commitStreaming(state),
        streamingText: "",
        sessionId: event.sessionId ?? state.sessionId,
        limit: { scope: event.scope, resetLabel: event.resetLabel, resetsAt: event.resetsAt },
      };
    case "exit":
      // Terminal fallback if no `result` arrived (e.g. crash/cancel): still commit
      // prose. A paused run keeps its paused status through the process exit.
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
