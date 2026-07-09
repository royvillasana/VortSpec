import { useEffect, useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { useAgentRun } from "../lib/useAgentRun";
import { Spinner } from "@vortspec/ui/ui";

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
  liveContext,
  allowModify = false,
  onClose,
  userName,
  fill = false,
  showSession = false,
  mcpConfigPath,
  extraAllowedTools,
}: {
  project: Project;
  /** Optional one-line context the dock mentions to Claude on the first message. */
  seedContext?: string;
  /** Fresh, per-turn grounding (active file / selection) prepended to EVERY
   *  message — the Claude Code extension's active-context behaviour. Recomputed
   *  by the host as focus/selection changes; empty string means nothing to add. */
  liveContext?: string;
  /** A Claude `--mcp-config` file to load (e.g. the VortSpec IDE control server),
   *  enabling the assistant to open/clone/switch the workspace + read editor state. */
  mcpConfigPath?: string;
  /** Extra tool allow-list groups to enable for the run (e.g. `mcp__vortspec-ide`). */
  extraAllowedTools?: string[];
  /** When true, the assistant may edit files (component changes), not just read. */
  allowModify?: boolean;
  /** When provided, a close button is shown; omit for a permanent panel. */
  onClose?: () => void;
  /** The user's profile name — the assistant addresses them by it, if set. */
  userName?: string;
  /** Fill the parent (the host owns width + border) instead of the fixed 360px
   *  panel. Use in a resizable host like the IDE's right sidebar. */
  fill?: boolean;
  /** Show the model chip + expandable session panel (skills/agents/MCP status). */
  showSession?: boolean;
}): React.JSX.Element {
  const run = useAgentRun();
  const [draft, setDraft] = useState("");
  const [firstPrompt, setFirstPrompt] = useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
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
    // The live grounding (open file / selection) rides on every message so the
    // assistant always sees what the user is looking at right now.
    const withLive = liveContext ? `${liveContext}\n\n${text}` : text;
    if (!started) {
      setFirstPrompt(text);
      const prompt = seedContext ? `${seedContext}\n\n${withLive}` : withLive;
      void run.start({
        prompt,
        cwd: project.path,
        allowedTools: [...(allowModify ? MODIFY_TOOLS : READ_TOOLS), ...(extraAllowedTools ?? [])],
        bypassPermissions: true,
        mcpConfigPath,
        // Persisted across the whole session (send() spreads the base opts), so
        // the assistant addresses the user by name for every turn.
        appendSystemPrompt: userName
          ? `The user's name is ${userName}. Address them as ${userName} when appropriate.`
          : undefined,
      });
    } else {
      // Send the grounded prompt but show only the user's own text in the bubble.
      void run.send(withLive, text);
    }
  }

  return (
    <aside
      className={`flex h-full min-w-0 flex-col bg-vs-bg-surface ${
        fill ? "w-full" : "w-[360px] shrink-0 border-l border-vs-border-default"
      }`}
    >
      <div className="flex flex-none items-center gap-2 border-b border-vs-border-default px-4 py-3">
        <span className="text-sm font-semibold">{allowModify ? "Modify with Claude" : "Assistant"}</span>
        <span className="font-mono text-[10px] text-vs-text-muted">· {project.name}</span>
        <div className="flex-1" />
        {showSession && run.model.session?.model && (
          <button
            type="button"
            aria-pressed={sessionOpen}
            onClick={() => setSessionOpen((v) => !v)}
            title="Session: model, skills, MCP servers"
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
              sessionOpen
                ? "border-vs-accent text-vs-text-primary"
                : "border-vs-border-default text-vs-text-muted hover:text-vs-text-secondary"
            }`}
          >
            {shortModel(run.model.session.model)}
          </button>
        )}
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
      {showSession && sessionOpen && run.model.session && (
        <SessionPanel session={run.model.session} />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!started ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-vs-text-secondary">
              {allowModify ? "Change a component" : "Ask about this project"}
            </p>
            <p className="max-w-[46ch] text-xs leading-relaxed text-vs-text-muted">
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

/** Trim a model id like "claude-opus-4-8[1m]" to a compact chip label. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

const MCP_STATUS_STYLE: Record<string, string> = {
  connected: "text-vs-success",
  pending: "text-vs-warning",
  failed: "text-vs-error",
  "needs-auth": "text-vs-warning",
};

function SessionPanel({
  session,
}: {
  session: NonNullable<import("@vortspec/ui/run-model").RunModel["session"]>;
}): React.JSX.Element {
  return (
    <div className="flex-none space-y-2 border-b border-vs-border-subtle bg-vs-bg-primary px-4 py-2.5 text-[11px] text-vs-text-muted">
      {session.model && (
        <Row label="Model">
          <span className="font-mono text-vs-text-secondary">{session.model}</span>
          {session.permissionMode && <span className="text-vs-text-muted"> · {session.permissionMode}</span>}
        </Row>
      )}
      {session.mcpStatuses.length > 0 && (
        <Row label="MCP">
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {session.mcpStatuses.map((m) => (
              <span key={m.name} className="font-mono">
                {m.name}
                <span className={MCP_STATUS_STYLE[m.status] ?? "text-vs-text-muted"}> ·{m.status}</span>
              </span>
            ))}
          </span>
        </Row>
      )}
      {session.skills.length > 0 && <Row label={`Skills (${session.skills.length})`}>{preview(session.skills)}</Row>}
      {session.agents.length > 0 && <Row label={`Agents (${session.agents.length})`}>{preview(session.agents)}</Row>}
      {session.tools.length > 0 && <Row label={`Tools (${session.tools.length})`}>{preview(session.tools)}</Row>}
      {session.plugins.length > 0 && <Row label={`Plugins (${session.plugins.length})`}>{preview(session.plugins)}</Row>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <span className="w-[92px] shrink-0 font-semibold uppercase tracking-wide text-vs-text-muted/80">{label}</span>
      <span className="min-w-0 flex-1 text-vs-text-secondary">{children}</span>
    </div>
  );
}

function preview(items: string[]): string {
  return items.slice(0, 12).join(", ") + (items.length > 12 ? ` +${items.length - 12}` : "");
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }): React.JSX.Element {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs leading-relaxed ${
          // Assistant replies (which carry code) fill the panel so they reflow to
          // whatever width the sidebar is dragged to; user prompts stay compact.
          isUser
            ? "max-w-[85%] bg-vs-accent text-white"
            : "w-full border border-vs-border-default bg-vs-bg-primary text-vs-text-secondary"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
