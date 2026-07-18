import { useEffect, useRef, useState } from "react";
import type { Project, FsEntry } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { useAgentRun } from "../lib/useAgentRun";
import type { ChatMessage } from "@vortspec/ui/run-model";
import { Spinner } from "@vortspec/ui/ui";
import { Response } from "./ai/Response";
import { RunLimitNotice } from "./RunLimitNotice";
import { Shimmer } from "./ai/Shimmer";
import { ToolSteps } from "./ai/Tool";
import { Reasoning } from "./ai/Reasoning";
import { ModelSelector } from "./ai/ModelSelector";
import { Plan } from "./ai/Plan";
import {
  AttachmentChips,
  MentionMenu,
  expandAttachments,
  type ChatAttachment,
  type PendingSelectionRef,
  type ConversationRegistry,
  type MentionOption,
} from "./ai/attachments";
import { CanvasSelectionChip } from "./ai/CanvasSelectionChip";
import { useCanvasSelection } from "../lib/canvas-selection";

export type { PendingSelectionRef } from "./ai/attachments";
import {
  SlashMenu,
  SlashCard,
  matchCommands,
  isMeta,
  type SlashCommand,
} from "./ai/slash-commands";
import { AgentPicker } from "./ai/AgentPicker";
import { READ_TOOLS, MODIFY_TOOLS, buildAgentList, type Agent } from "./ai/agents";

/**
 * A persistent, project-scoped assistant **conversation**. It talks to the user's
 * own Claude Code with the active project as cwd. By default it uses a read-only
 * toolset (Read / Grep / Glob); with `allowModify` it may also edit files. When an
 * `agent` is supplied (by `ConversationTabs`), the agent's system prompt / model /
 * toolset shape the run instead. The session starts only on the first user message
 * (no usage on mount) and resets on project change. Used both standalone (the
 * cockpit's single dock) and as each tab inside `ConversationTabs`.
 */

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
  pendingRef,
  agent,
  onAgentChange,
  presets,
  conversations,
  onTranscript,
  incomingText,
  onSendSelection,
  autoStart,
  taskReturn,
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
  /** An editor selection to attach as context ("Open in Chat"); re-adds on nonce. */
  pendingRef?: PendingSelectionRef;
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
  /** The agent shaping this conversation's runs (system prompt / model / tools). */
  agent?: Agent;
  /** When provided (with `presets`), an agent picker shows in the header. */
  onAgentChange?: (agent: Agent) => void;
  /** Preset agents available to pick (defaults + user); enables the agent picker. */
  presets?: Agent[];
  /** Other open conversations — enables `@`-references + their transcript injection. */
  conversations?: ConversationRegistry;
  /** Report this conversation's committed transcript up (for cross-references). */
  onTranscript?: (messages: ChatMessage[]) => void;
  /** A highlighted selection handed in from another conversation ("Send to"). */
  incomingText?: { text: string; from: string; nonce: number };
  /** Called when the user sends a highlighted message selection to a conversation. */
  onSendSelection?: (targetConvId: string, text: string) => void;
  /** A handed-off task ("Fix in Assistant") that auto-starts this conversation's
   *  first run with `prompt` — the user watches it here and can leave the screen
   *  it came from. Re-fires on `nonce` change. */
  autoStart?: { prompt: string; nonce: number };
  /** When set, a "resume where you were" banner appears once the run finishes,
   *  linking back to the screen the task was dispatched from. */
  taskReturn?: { origin: string; onReturn: () => void };
}): React.JSX.Element {
  const run = useAgentRun();
  const [draft, setDraft] = useState("");
  const [firstPrompt, setFirstPrompt] = useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  // Opt-in auto-resume when a usage-limit pause resets (per pause).
  const [autoResumePaused, setAutoResumePaused] = useState(false);
  // Meta-command result cards (/mcp, /model, /context…) shown inline.
  const [cards, setCards] = useState<{ id: number; name: string }[]>([]);
  const cardSeq = useRef(0);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  // `/`-command menu state.
  const [menuIndex, setMenuIndex] = useState(0);
  // Context attachments (@-mentions, dragged files, "Open in Chat" selections).
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  // Ambient canvas selection — live context published by the canvas, shown as a
  // persistent chip. Not in `attachments`, so submitting never clears it; it goes
  // only when the selection itself changes or clears.
  const ambientSelection = useCanvasSelection();
  // The selection the user detached for the current selection instance. Keyed on
  // the selection's identity so a re-select (new key) surfaces the chip again.
  const [detachedKey, setDetachedKey] = useState<string | null>(null);
  const activeSelection =
    ambientSelection && ambientSelection.key !== detachedKey ? ambientSelection : null;
  const [mentionResults, setMentionResults] = useState<FsEntry[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const attachSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // A highlighted range in the transcript → the "Send to another conversation" control.
  const [sendSel, setSendSel] = useState<{ text: string; top: number; left: number } | null>(null);

  // New project → fresh session.
  useEffect(() => {
    run.reset();
    setFirstPrompt(null);
    setDraft("");
    setCards([]);
    setSelectedModel(undefined);
    setAttachments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // Keep the transcript scrolled to the latest.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [run.model.messages, run.model.streamingText, cards]);

  const started = firstPrompt !== null || run.model.messages.length > 0 || Boolean(run.model.sessionId);

  // The `/` command menu is open when the draft is a lone slash-token.
  const slashQuery = /^\/\S*$/.test(draft) ? draft : null;
  const menuMatches = slashQuery !== null ? matchCommands(slashQuery, run.model.session) : [];
  const menuOpen = menuMatches.length > 0;

  // The `@`-mention menu is open when the draft ends with an `@token`.
  const mentionMatch = draft.match(/(?:^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const mentionOpen = mentionQuery !== null;

  // Look up workspace files for the current @-query (lightly debounced).
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void api
        .searchFiles(project.path, mentionQuery, 30)
        .then((r) => alive && setMentionResults(r))
        .catch(() => alive && setMentionResults([]));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mentionQuery, project.path]);

  function addAttachment(att: Omit<ChatAttachment, "id">): void {
    setAttachments((cur) => {
      // De-dupe identical file/dir refs; always add distinct selections (each
      // editor range or canvas instruction is its own thing, even without a path).
      const alwaysAdd = att.kind === "selection" || att.kind === "canvas-selection";
      if (!alwaysAdd && cur.some((a) => a.kind === att.kind && a.path === att.path)) return cur;
      return [...cur, { ...att, id: `att-${attachSeq.current++}` }];
    });
  }

  // "Open in Chat" (editor selection) or "Send to chat" (canvas element) → attach.
  // A canvas selection has no honest line range, so it rides as its own kind
  // carrying label + prose rather than a fabricated file range.
  useEffect(() => {
    if (!pendingRef) return;
    if (pendingRef.source === "canvas") {
      addAttachment({ kind: "canvas-selection", text: pendingRef.text, label: pendingRef.label ?? "canvas selection" });
    } else {
      addAttachment({
        path: pendingRef.path,
        kind: "selection",
        startLine: pendingRef.startLine,
        endLine: pendingRef.endLine,
        text: pendingRef.text,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRef?.nonce]);

  // A re-selection surfaces the ambient chip again; a full deselect resets the
  // detach so the same element re-selected later isn't stuck hidden.
  useEffect(() => {
    if (!ambientSelection) setDetachedKey(null);
  }, [ambientSelection]);

  // Report the transcript up (first prompt + committed turns) so other
  // conversations can @-reference it.
  useEffect(() => {
    const full: ChatMessage[] = firstPrompt
      ? [{ id: "first", role: "user", text: firstPrompt }, ...run.model.messages]
      : run.model.messages;
    onTranscript?.(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.messages, firstPrompt]);

  // A highlighted selection handed in from another conversation → attach it here.
  useEffect(() => {
    if (!incomingText) return;
    addAttachment({ kind: "text", text: incomingText.text, label: incomingText.from });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingText?.nonce]);

  // `@`-menu items: other conversations (by label) first, then workspace files.
  const mentionItems: MentionOption[] =
    mentionQuery === null
      ? []
      : [
          ...(conversations?.list() ?? [])
            .filter((c) => c.label.toLowerCase().includes(mentionQuery.toLowerCase()))
            .map((c) => ({ kind: "conversation" as const, id: c.id, label: c.label })),
          ...mentionResults.map((e) => ({ kind: "file" as const, entry: e })),
        ];

  // Highlighting text in the transcript surfaces a "Send to" control (if there
  // are other conversations to send it to).
  function onTranscriptMouseUp(): void {
    if (!onSendSelection || !conversations || conversations.list().length === 0) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    const anchor = sel?.anchorNode;
    if (!text || !anchor || !scrollRef.current?.contains(anchor)) {
      setSendSel(null);
      return;
    }
    const rect = sel!.getRangeAt(0).getBoundingClientRect();
    setSendSel({ text, top: rect.bottom + 4, left: rect.left });
  }

  function pickMention(option: MentionOption): void {
    // Strip the trailing `@query` from the draft, then attach.
    setDraft((d) => d.replace(/(?:^|\s)@[^\s@]*$/, (m) => (m.startsWith(" ") ? " " : "")));
    if (option.kind === "conversation") {
      addAttachment({ kind: "conversation", convId: option.id, label: option.label });
    } else {
      addAttachment({ path: option.entry.path, kind: option.entry.type === "dir" ? "dir" : "file" });
    }
    setMentionIndex(0);
    textareaRef.current?.focus();
  }

  /** Attach an OS-dropped absolute path (relative if inside the workspace). */
  function attachOsPath(abs: string): void {
    const rel = abs.startsWith(`${project.path}/`) ? abs.slice(project.path.length + 1) : abs;
    const isImage = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(rel);
    addAttachment(isImage ? { kind: "image", path: rel, label: rel.split("/").pop() } : { path: rel, kind: "file" });
  }

  // Drag a file/folder into the chat → attach it. Handles both an Explorer entry
  // (internal transfer) and files dragged in from the OS (Finder).
  function onDrop(e: React.DragEvent): void {
    const internal = e.dataTransfer.getData("application/vortspec-path");
    if (internal) {
      e.preventDefault();
      try {
        const { path, type } = JSON.parse(internal) as { path: string; type: "file" | "dir" };
        addAttachment({ path, kind: type === "dir" ? "dir" : "file" });
      } catch {
        addAttachment({ path: internal, kind: "file" });
      }
      return;
    }
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      e.preventDefault();
      for (const f of Array.from(files)) {
        try {
          const abs = api.getPathForFile(f);
          if (abs) attachOsPath(abs);
        } catch {
          /* ignore files we can't resolve a path for */
        }
      }
    }
  }

  function runMeta(name: string): void {
    if (name === "clear") {
      run.reset();
      setFirstPrompt(null);
      setCards([]);
      return;
    }
    setCards((cs) => [...cs, { id: cardSeq.current++, name }]);
  }

  function pickCommand(c: SlashCommand): void {
    if (c.kind === "meta") {
      runMeta(c.name);
      setDraft("");
    } else {
      // Real Claude command → insert it so the user can add args, then send.
      setDraft(`/${c.name} `);
    }
    setMenuIndex(0);
    textareaRef.current?.focus();
  }

  /** The agent-resolved run options (toolset, model, system prompt) shared by
   *  a first message, a follow-up, and an auto-started task. */
  function buildRunOpts(): { allowedTools: string[]; model: string | undefined; appendSystemPrompt: string | undefined } {
    const baseTools = agent?.allowedTools ?? (allowModify ? MODIFY_TOOLS : READ_TOOLS);
    const appendSystemPrompt =
      [
        userName ? `The user's name is ${userName}. Address them as ${userName} when appropriate.` : null,
        agent?.systemPrompt ?? null,
      ]
        .filter(Boolean)
        .join("\n\n") || undefined;
    return {
      allowedTools: [...baseTools, ...(extraAllowedTools ?? [])],
      model: selectedModel ?? agent?.model,
      appendSystemPrompt,
    };
  }

  /** Start this conversation's first run with `text` (a handed-off task). Shows
   *  the text as the opening user bubble; no attachments/live grounding. */
  function startTask(text: string): void {
    const t = text.trim();
    if (!t || started || run.running) return;
    setFirstPrompt(t);
    const prompt = seedContext ? `${seedContext}\n\n${t}` : t;
    void run.start({ prompt, cwd: project.path, bypassPermissions: true, mcpConfigPath, ...buildRunOpts() });
  }

  // A handed-off task ("Fix in Assistant") auto-starts as this conversation's
  // first run. Guarded by nonce so a re-render / strict-mode remount can't
  // double-fire, and only when the conversation hasn't started yet.
  const lastAutoNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!autoStart || lastAutoNonce.current === autoStart.nonce) return;
    lastAutoNonce.current = autoStart.nonce;
    startTask(autoStart.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart?.nonce]);

  function submit(): void {
    const text = draft.trim();
    if (!text || run.running) return;
    // A bare meta command (e.g. "/mcp") renders a local panel instead of a run.
    const metaName = text.startsWith("/") ? text.slice(1).split(/\s+/)[0] : null;
    if (metaName && isMeta(metaName) && text.split(/\s+/).length === 1) {
      runMeta(metaName);
      setDraft("");
      return;
    }
    setDraft("");
    // Referenced attachments (@-mentions, dragged files, selections) + the ambient
    // canvas selection + the live grounding (open file / selection) ride along so
    // the assistant sees them. The ambient selection is appended (not stored in
    // `attachments`) so submitting never consumes it — it persists across turns.
    const grounded = activeSelection
      ? [
          ...attachments,
          { id: "canvas-selection", kind: "canvas-selection" as const, text: activeSelection.payload, label: activeSelection.label },
        ]
      : attachments;
    const grounding = [expandAttachments(grounded, conversations), liveContext].filter(Boolean).join("\n\n");
    const withLive = grounding ? `${grounding}\n\n${text}` : text;
    setAttachments([]);
    const runOpts = buildRunOpts();
    if (!started) {
      setFirstPrompt(text);
      const prompt = seedContext ? `${seedContext}\n\n${withLive}` : withLive;
      void run.start({
        prompt,
        cwd: project.path,
        bypassPermissions: true,
        mcpConfigPath,
        ...runOpts,
      });
    } else {
      // Send the grounded prompt but show only the user's own text in the bubble;
      // re-apply the agent options so a switched agent takes effect on follow-ups.
      void run.send(withLive, text, runOpts);
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
            title="Session: model, skills, MCP servers · type /mcp, /model, /context…"
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
              sessionOpen
                ? "border-vs-accent text-vs-text-primary"
                : "border-vs-border-default text-vs-text-muted hover:text-vs-text-secondary"
            }`}
          >
            {selectedModel ?? shortModel(run.model.session.model)}
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

      <div ref={scrollRef} onMouseUp={onTranscriptMouseUp} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!started && cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-vs-text-secondary">
              {allowModify ? "Change a component" : "Ask about this project"}
            </p>
            <p className="max-w-[46ch] text-xs leading-relaxed text-vs-text-muted">
              {allowModify
                ? "Describe a change to a component you see in Storybook — Claude Code edits it and Storybook reloads live. No usage until you send."
                : "Claude Code reads your project (read-only) to answer. It spends no usage until you send a message."}
            </p>
            <p className="text-[10px] text-vs-text-muted/80">
              Type <span className="font-mono text-vs-accent">/</span> for models, MCP, context, skills…
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {firstPrompt && <Bubble role="user" text={firstPrompt} />}
            {run.model.messages.map((m) => (
              <Bubble key={m.id} role={m.role} text={m.text} />
            ))}
            {run.model.plan.length > 0 && <Plan items={run.model.plan} />}
            {run.model.reasoning && (
              <Reasoning text={run.model.reasoning} streaming={run.running && !run.model.streamingText} />
            )}
            {run.model.steps.length > 0 && <ToolSteps steps={run.model.steps} />}
            {run.model.streamingText && <Bubble role="assistant" text={run.model.streamingText} />}
            {run.running && !run.model.streamingText && !run.model.reasoning && (
              <div className="flex items-center gap-2 text-xs">
                <Spinner />
                <Shimmer>Thinking…</Shimmer>
              </div>
            )}
            {run.model.mcpErrors.length > 0 && (
              <div className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-2.5 py-1.5 text-[11px] text-vs-warning">
                MCP issue: {run.model.mcpErrors.join("; ")}
              </div>
            )}
            {cards.map((card) => (
              <div key={card.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setCards((cs) => cs.filter((c) => c.id !== card.id))}
                  title="Dismiss"
                  className="absolute right-1.5 top-1.5 z-10 hidden rounded px-1 text-vs-text-muted hover:text-vs-text-primary group-hover:block"
                >
                  ×
                </button>
                <SlashCard
                  name={card.name}
                  session={run.model.session}
                  context={{
                    cwd: project.path,
                    live: liveContext ?? "",
                    costUsd: run.model.result?.costUsd,
                  }}
                  selectedModel={selectedModel}
                  onPickModel={(alias) =>
                    setSelectedModel((cur) => (cur === alias ? undefined : alias))
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {run.model.status === "paused" && run.model.limit && (
        <div className="flex-none border-t border-vs-border-default px-3 py-2.5">
          <RunLimitNotice
            limit={run.model.limit}
            onResume={() =>
              void run.send("Continue where you left off and finish the remaining work.", "↻ Resumed after the usage limit")
            }
            resumeLabel="Resume"
            busy={run.running}
            autoResume={autoResumePaused}
            onAutoResumeChange={setAutoResumePaused}
          />
        </div>
      )}

      {taskReturn && (run.model.status === "done" || run.model.status === "error") && (
        <button
          type="button"
          onClick={taskReturn.onReturn}
          aria-label={`Resume ${taskReturn.origin}`}
          className={`flex flex-none items-center gap-2 border-t px-4 py-2.5 text-left text-[12px] ${
            run.model.status === "error"
              ? "border-vs-border-default bg-vs-bg-surface text-vs-text-secondary hover:bg-vs-bg-hover"
              : "border-vs-success-border bg-vs-success-muted text-vs-success hover:brightness-105"
          }`}
        >
          <span className="text-sm leading-none">{run.model.status === "error" ? "•" : "✓"}</span>
          <span className="min-w-0 flex-1">
            {run.model.status === "error"
              ? `Stopped before finishing. Review here, or go back to ${taskReturn.origin}.`
              : `Done — you can head back to ${taskReturn.origin} and pick up where you left off.`}
          </span>
          <span aria-hidden className="font-medium">Resume {taskReturn.origin} →</span>
        </button>
      )}

      <div
        className="flex-none border-t border-vs-border-default p-3"
        onDragOver={(e) => {
          const t = e.dataTransfer.types;
          if (t.includes("application/vortspec-path") || t.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onDrop}
      >
        {menuOpen && (
          <SlashMenu
            commands={menuMatches}
            activeIndex={Math.min(menuIndex, menuMatches.length - 1)}
            onPick={pickCommand}
          />
        )}
        {mentionOpen && (
          <MentionMenu
            items={mentionItems}
            activeIndex={Math.min(mentionIndex, Math.max(0, mentionItems.length - 1))}
            onPick={pickMention}
          />
        )}
        {/* A shadcn/ai PromptInput-style shell: attachments + textarea in one box. */}
        <div className="rounded-lg border border-vs-border-default bg-vs-bg-primary p-2 focus-within:ring-2 focus-within:ring-vs-accent-subtle">
          {activeSelection && (
            <CanvasSelectionChip selection={activeSelection} onDetach={() => setDetachedKey(activeSelection.key)} />
          )}
          <AttachmentChips
            attachments={attachments}
            onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))}
            onAdd={addAttachment}
            loadDir={(p) => api.listDir(project.path, p)}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMenuIndex(0);
              setMentionIndex(0);
            }}
            onPaste={() => {
              // Always ask the main process for a clipboard image — macOS screenshots
              // don't reliably show up in `clipboardData.items`, so we can't gate on
              // that. Returns null for text/empty clipboards (text pastes natively).
              void api
                .clipboardImage()
                .then((img) => {
                  if (img) addAttachment({ kind: "image", path: img.path, dataUrl: img.dataUrl, label: "pasted image" });
                })
                .catch(() => undefined);
            }}
            onKeyDown={(e) => {
              if (mentionOpen && mentionItems.length > 0) {
                const len = mentionItems.length;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (Math.min(i, len - 1) + 1) % len);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (Math.min(i, len - 1) - 1 + len) % len);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(mentionItems[Math.min(mentionIndex, len - 1)]);
                  return;
                }
              }
              if (menuOpen) {
                const len = menuMatches.length;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMenuIndex((i) => (Math.min(i, len - 1) + 1) % len);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMenuIndex((i) => (Math.min(i, len - 1) - 1 + len) % len);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickCommand(menuMatches[Math.min(menuIndex, len - 1)]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft("");
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={run.running ? "Claude is working…" : "Ask, or @ a file…  ( / for commands )"}
            disabled={run.running}
            className="w-full resize-none bg-transparent px-1 py-1 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {agent && onAgentChange && presets && (
            <AgentPicker
              agents={buildAgentList(run.model.session?.agents, presets)}
              selected={agent}
              onSelect={onAgentChange}
            />
          )}
          <ModelSelector
            active={run.model.session?.model}
            selected={selectedModel}
            onSelect={setSelectedModel}
          />
          <span className="min-w-0 flex-1 truncate text-[10px] text-vs-text-muted">
            {mentionOpen ? "↑↓ attach" : menuOpen ? "↑↓ pick" : "Enter · / · @"}
          </span>
          <button
            onClick={submit}
            disabled={run.running || draft.trim().length === 0}
            className="rounded-md bg-vs-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
      {sendSel && conversations && onSendSelection && (
        <SendToControl
          top={sendSel.top}
          left={sendSel.left}
          targets={conversations.list()}
          onPick={(id) => {
            onSendSelection(id, sendSel.text);
            setSendSel(null);
            window.getSelection()?.removeAllRanges();
          }}
          onDismiss={() => setSendSel(null)}
        />
      )}
    </aside>
  );
}

/** Trim a model id like "claude-opus-4-8[1m]" to a compact chip label. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

/** Floating "Send to ▾" control for a highlighted transcript selection. */
function SendToControl({
  top,
  left,
  targets,
  onPick,
  onDismiss,
}: {
  top: number;
  left: number;
  targets: { id: string; label: string }[];
  onPick: (id: string) => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onDismiss} />
      <div data-testid="send-to" style={{ position: "fixed", top, left }} className="z-50 rounded-md border border-vs-border-strong bg-vs-bg-elevated text-[11px] shadow-lg">
        {!open ? (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)} className="px-2 py-1 text-vs-text-primary hover:bg-vs-bg-hover">
            ⧉ Send to ▾
          </button>
        ) : (
          <div className="min-w-[150px] py-1">
            <div className="px-3 pb-1 text-[9px] uppercase tracking-wide text-vs-text-muted/70">Send selection to</div>
            {targets.map((t) => (
              <button key={t.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(t.id)} className="block w-full truncate px-3 py-1 text-left text-vs-text-secondary hover:bg-vs-bg-hover">
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
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
        className={`min-w-0 break-words rounded-lg px-3 py-2 text-xs leading-relaxed ${
          // Assistant replies (which carry code/markdown) fill the panel so they
          // reflow to whatever width the sidebar is dragged to and render via
          // Streamdown; user prompts stay compact and plain.
          isUser
            ? "max-w-[85%] whitespace-pre-wrap bg-vs-accent text-white"
            : "w-full border border-vs-border-default bg-vs-bg-primary text-vs-text-secondary"
        }`}
      >
        {isUser ? text : <Response>{text}</Response>}
      </div>
    </div>
  );
}
