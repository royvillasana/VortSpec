import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../shared/ipc";
import { useAgentRun } from "../lib/useAgentRun";
import { Spinner } from "./ui";

/**
 * A persistent, project-scoped assistant chat. It talks to the user's own Claude
 * Code with the active project as cwd. By default it uses a read-oriented toolset
 * (Read / Grep / Glob) so it advises without mutating — spec-first gates own all
 * writes. With `allowModify`, it may also edit files (Write / Edit / Bash) so the
 * user can request component changes (Storybook reloads live). The session starts
 * only on the first user message (no usage on mount) and resets on project change.
 */
const READ_TOOLS = ["Read", "Grep", "Glob"];
const MODIFY_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

export function AssistantDock({
  project,
  seedContext,
  allowModify = false,
  onClose,
  userName,
}: {
  project: Project;
  /** Optional one-line context the dock mentions to Claude on the first message. */
  seedContext?: string;
  /** When true, the assistant may edit files (component changes), not just read. */
  allowModify?: boolean;
  /** When provided, a close button is shown; omit for a permanent panel. */
  onClose?: () => void;
  /** The user's profile name — the assistant addresses them by it, if set. */
  userName?: string;
}): React.JSX.Element {
  const run = useAgentRun();
  const [draft, setDraft] = useState("");
  const [firstPrompt, setFirstPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // New project → fresh session.
  useEffect(() => {
    run.reset();
    setFirstPrompt(null);
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // Keep the transcript scrolled to the latest.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [run.model.messages, run.model.streamingText]);

  const started = firstPrompt !== null || run.model.messages.length > 0 || Boolean(run.model.sessionId);

  function submit(): void {
    const text = draft.trim();
    if (!text || run.running) return;
    setDraft("");
    if (!started) {
      setFirstPrompt(text);
      const prompt = seedContext ? `${seedContext}\n\n${text}` : text;
      void run.start({
        prompt,
        cwd: project.path,
        allowedTools: allowModify ? MODIFY_TOOLS : READ_TOOLS,
        bypassPermissions: true,
        // Persisted across the whole session (send() spreads the base opts), so
        // the assistant addresses the user by name for every turn.
        appendSystemPrompt: userName
          ? `The user's name is ${userName}. Address them as ${userName} when appropriate.`
          : undefined,
      });
    } else {
      void run.send(text);
    }
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-vs-border-default bg-vs-bg-surface">
      <div className="flex flex-none items-center gap-2 border-b border-vs-border-default px-4 py-3">
        <span className="text-sm font-semibold">{allowModify ? "Modify with Claude" : "Assistant"}</span>
        <span className="font-mono text-[10px] text-vs-text-muted">· {project.name}</span>
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            title="Close assistant"
            className="rounded px-1.5 py-1 leading-none text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary"
          >
            ×
          </button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!started ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-vs-text-secondary">
              {allowModify ? "Change a component" : "Ask about this project"}
            </p>
            <p className="max-w-[240px] text-xs leading-relaxed text-vs-text-muted">
              {allowModify
                ? "Describe a change to a component you see in Storybook — Claude Code edits it and Storybook reloads live. No usage until you send."
                : "Claude Code reads your project (read-only) to answer. It spends no usage until you send a message."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {firstPrompt && <Bubble role="user" text={firstPrompt} />}
            {run.model.messages.map((m) => (
              <Bubble key={m.id} role={m.role} text={m.text} />
            ))}
            {run.model.streamingText && <Bubble role="assistant" text={run.model.streamingText} />}
            {run.running && (
              <div className="flex items-center gap-2 text-xs text-vs-text-muted">
                <Spinner /> Thinking…
              </div>
            )}
            {run.model.mcpErrors.length > 0 && (
              <div className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-2.5 py-1.5 text-[11px] text-vs-warning">
                MCP issue: {run.model.mcpErrors.join("; ")}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-vs-border-default p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            run.running
              ? "Claude is working…"
              : allowModify
                ? "e.g. tighten Button's padding, add a loading state…"
                : "Ask about tokens, components, the spec…"
          }
          disabled={run.running}
          className="w-full resize-none rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle disabled:opacity-60"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="flex-1 text-[10px] text-vs-text-muted">Enter to send · Shift+Enter for a new line</span>
          <button
            onClick={submit}
            disabled={run.running || draft.trim().length === 0}
            className="rounded-md bg-vs-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }): React.JSX.Element {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-vs-accent text-white"
            : "border border-vs-border-default bg-vs-bg-primary text-vs-text-secondary"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
