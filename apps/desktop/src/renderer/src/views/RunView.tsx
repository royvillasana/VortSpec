import { useEffect, useReducer, useRef, useState } from "react";
import type { Project, RunEvent } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";

/**
 * The live run view (US-08). Streams a friendly picture of a wrapped Claude
 * Code step — current text, tool activity, files touched — with a toggle to the
 * raw terminal output and an always-available clean cancel.
 *
 * For D1 this runs a single SDD-DE step against the selected project. The full
 * guided stepper (D2) composes many of these.
 */

type RunStatus = "idle" | "running" | "done" | "error" | "canceled";

interface Activity {
  key: string;
  label: string;
  tone: "tool" | "notice" | "retry" | "error";
}

interface RunModel {
  status: RunStatus;
  model?: string;
  streamingText: string;
  activity: Activity[];
  files: string[];
  raw: string[];
  mcpErrors: string[];
  result?: { isError: boolean; text?: string; costUsd?: number };
}

const initial: RunModel = {
  status: "idle",
  streamingText: "",
  activity: [],
  files: [],
  raw: [],
  mcpErrors: [],
};

type Action =
  | { type: "start" }
  | { type: "event"; event: RunEvent }
  | { type: "raw"; line: string }
  | { type: "reset" };

let activitySeq = 0;

function reduce(state: RunModel, action: Action): RunModel {
  switch (action.type) {
    case "reset":
      return initial;
    case "start":
      return { ...initial, status: "running" };
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

const DEFAULT_PROMPT =
  "Run the SDD-DE intake and enrich-brief step for this project: read the intake answers, " +
  "and produce an enriched brief as a markdown file. Ask for nothing; work from the files present.";

export function RunView({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
}): React.JSX.Element {
  const [model, dispatch] = useReducer(reduce, initial);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [showRaw, setShowRaw] = useState(false);
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

  async function start(): Promise<void> {
    dispatch({ type: "start" });
    const { runId } = await api.startRun({
      prompt,
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit"],
    });
    runIdRef.current = runId;
  }

  async function cancel(): Promise<void> {
    if (runIdRef.current) await api.cancelRun(runIdRef.current);
  }

  const running = model.status === "running";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            ← Projects
          </Button>
          <div>
            <h2 className="text-sm font-semibold text-vs-text-primary">{project.name}</h2>
            <p className="text-xs text-vs-text-muted">Run a step</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowRaw((v) => !v)}
            title="Toggle the raw Claude Code output"
          >
            {showRaw ? "Friendly view" : "Terminal"}
          </Button>
          {running ? (
            <Button variant="default" onClick={() => void cancel()}>
              Cancel
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void start()}>
              {model.status === "idle" ? "Start" : "Run again"}
            </Button>
          )}
        </div>
      </header>

      {model.status === "idle" && (
        <Card className="p-3">
          <label className="mb-1 block text-xs text-vs-text-muted">Step prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
          />
        </Card>
      )}

      <StatusBar model={model} />

      {showRaw ? (
        <RawTerminal lines={model.raw} />
      ) : (
        <FriendlyView model={model} running={running} />
      )}
    </div>
  );
}

function StatusBar({ model }: { model: RunModel }): React.JSX.Element {
  const label: Record<RunStatus, string> = {
    idle: "Ready",
    running: "Running",
    done: "Completed",
    error: "Failed",
    canceled: "Canceled",
  };
  const tone: Record<RunStatus, string> = {
    idle: "text-vs-text-muted",
    running: "text-vs-warning",
    done: "text-vs-success",
    error: "text-vs-error",
    canceled: "text-vs-text-secondary",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      {model.status === "running" && <Spinner />}
      <span className={tone[model.status]}>{label[model.status]}</span>
      {model.model && <span className="text-vs-text-muted">· {model.model}</span>}
      {model.result?.costUsd !== undefined && (
        <span className="text-vs-text-muted">
          · ${model.result.costUsd.toFixed(4)}
        </span>
      )}
    </div>
  );
}

function FriendlyView({
  model,
  running,
}: {
  model: RunModel;
  running: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {model.mcpErrors.length > 0 && (
        <div className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2 text-xs text-vs-warning">
          MCP issue: {model.mcpErrors.join("; ")}
        </div>
      )}

      {model.files.length > 0 && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Files touched</p>
          <ul className="flex flex-col gap-0.5">
            {model.files.map((f) => (
              <li key={f} className="font-mono text-xs text-vs-text-primary">
                {f}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(model.streamingText || running) && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Assistant</p>
          <p className="whitespace-pre-wrap text-sm text-vs-text-primary">
            {model.streamingText}
            {running && <span className="text-vs-text-muted"> ▍</span>}
          </p>
        </Card>
      )}

      {model.activity.length > 0 && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Activity</p>
          <ul className="flex flex-col gap-1">
            {model.activity.map((a) => (
              <li key={a.key} className="text-xs text-vs-text-secondary">
                <span className={activityTone(a.tone)}>•</span> {a.label}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {model.result && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            model.result.isError
              ? "border-vs-error/40 bg-vs-error/10 text-vs-error"
              : "border-vs-success-border bg-vs-success-muted text-vs-success"
          }`}
        >
          {model.result.text ?? (model.result.isError ? "Run failed." : "Run complete.")}
        </div>
      )}
    </div>
  );
}

function activityTone(tone: Activity["tone"]): string {
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

function RawTerminal({ lines }: { lines: string[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);
  return (
    <div className="h-96 overflow-auto rounded-md border border-vs-border-default bg-black/40 p-3">
      <pre className="font-mono text-[11px] leading-relaxed text-vs-text-secondary">
        {lines.length === 0 ? "Raw Claude Code output will appear here…" : lines.join("\n")}
      </pre>
      <div ref={endRef} />
    </div>
  );
}
