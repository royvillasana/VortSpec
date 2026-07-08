import { useEffect, useRef, useState } from "react";
import { activityTone, type RunModel, type RunStatus } from "../lib/run-model";
import { Button, Card, Spinner } from "./ui";

/**
 * Presentational view of a run model, split into two tabs:
 *  - **Chat** — the assistant's prose transcript plus a reply box to talk back
 *    (each reply resumes the same Claude Code session via `onSend`).
 *  - **Backend Work** — the mechanics: status, files touched, tool activity, and
 *    the raw stream-json terminal. No conversation.
 * Stateless except the active-tab toggle and the local draft reply.
 */
export function RunPanel({
  model,
  onSend,
  canChat = false,
}: {
  model: RunModel;
  onSend?: (text: string) => void;
  canChat?: boolean;
}): React.JSX.Element {
  const [tab, setTab] = useState<"chat" | "backend">("chat");
  const running = model.status === "running";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-0.5 text-xs">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton active={tab === "backend"} onClick={() => setTab("backend")}>
            Backend Work
          </TabButton>
        </div>
        <StatusBar model={model} />
      </div>
      {tab === "chat" ? (
        <ChatView model={model} running={running} onSend={onSend} canChat={canChat} />
      ) : (
        <BackendView model={model} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 transition-colors ${
        active
          ? "bg-vs-bg-elevated text-vs-text-primary"
          : "text-vs-text-muted hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
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
        <span className="text-vs-text-muted">· ${model.result.costUsd.toFixed(4)}</span>
      )}
    </div>
  );
}

// ── Tab 1: Chat ──────────────────────────────────────────────────────

function ChatView({
  model,
  running,
  onSend,
  canChat,
}: {
  model: RunModel;
  running: boolean;
  onSend?: (text: string) => void;
  canChat: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const idle = model.status === "idle";
  const empty = model.messages.length === 0 && !model.streamingText;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [model.messages.length, model.streamingText]);

  function submit(): void {
    const text = draft.trim();
    if (!text || !onSend || !canChat) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-96 flex-col gap-3 overflow-auto">
        {empty && (
          <p className="text-xs text-vs-text-muted">
            {idle
              ? "Start the step to stream the assistant’s replies here."
              : "Waiting for the assistant…"}
          </p>
        )}
        {model.messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
        {running && (
          <Bubble role="assistant" text={model.streamingText} streaming />
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={!canChat}
            placeholder={
              canChat
                ? "Reply to the assistant… (Enter to send, Shift+Enter for a new line)"
                : running
                  ? "The assistant is working — you can reply once it pauses."
                  : "Run the step first — replies resume that session."
            }
            className="flex-1 resize-y rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle disabled:opacity-50"
          />
          <Button variant="primary" disabled={!canChat || draft.trim().length === 0} onClick={submit}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  streaming = false,
}: {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}): React.JSX.Element {
  const isUser = role === "user";
  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <span className="text-[10px] uppercase tracking-wide text-vs-text-muted">
        {isUser ? "You" : "Assistant"}
      </span>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${
          isUser
            ? "bg-vs-accent-subtle text-vs-text-primary"
            : "border border-vs-border-default bg-vs-bg-surface text-vs-text-primary"
        }`}
      >
        {text}
        {streaming && <span className="text-vs-text-muted"> ▍</span>}
      </div>
    </div>
  );
}

// ── Tab 2: Backend Work ──────────────────────────────────────────────

function BackendView({ model }: { model: RunModel }): React.JSX.Element {
  const [showRaw, setShowRaw] = useState(false);
  if (model.status === "idle") {
    return (
      <p className="text-xs text-vs-text-muted">
        Backend activity — tool calls, files touched, and raw output — appears here once the step
        runs.
      </p>
    );
  }
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-vs-text-secondary">Raw output</p>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-vs-text-secondary hover:text-vs-text-primary"
          title="Toggle the raw Claude Code stream-json output"
        >
          {showRaw ? "Hide" : "Show"}
        </button>
      </div>
      {showRaw && <RawTerminal lines={model.raw} />}
    </div>
  );
}

function RawTerminal({ lines }: { lines: string[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);
  return (
    <div className="h-80 overflow-auto rounded-md border border-vs-border-default bg-vs-bg-code p-3">
      <pre className="font-mono text-[11px] leading-relaxed text-vs-text-secondary">
        {lines.length === 0 ? "Raw Claude Code output will appear here…" : lines.join("\n")}
      </pre>
      <div ref={endRef} />
    </div>
  );
}
