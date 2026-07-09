import type { RunModel } from "@vortspec/ui/run-model";
import { cn } from "../../lib/cn";

/**
 * The Claude Code feature surface, callable from the composer like the official
 * extension: type `/` to open a menu of commands. Two kinds:
 *  - **meta** — informational panels rendered locally from the session's `init`
 *    data (models, MCP servers, context, skills, agents, tools, plugins). No
 *    round-trip; these mirror the CLI's `/mcp`, `/model`, `/context`, etc.
 *  - **prompt** — the session's real slash commands (`slashCommands` from init),
 *    inserted into the input so the user can add args and send them to Claude.
 */

export interface SlashCommand {
  name: string;
  summary: string;
  kind: "meta" | "prompt";
}

export const META_COMMANDS: SlashCommand[] = [
  { name: "model", summary: "Show or switch the model", kind: "meta" },
  { name: "mcp", summary: "MCP servers and their status", kind: "meta" },
  { name: "context", summary: "What the assistant currently sees", kind: "meta" },
  { name: "skills", summary: "Available skills", kind: "meta" },
  { name: "agents", summary: "Available subagents", kind: "meta" },
  { name: "tools", summary: "Enabled tools", kind: "meta" },
  { name: "plugins", summary: "Loaded plugins", kind: "meta" },
  { name: "status", summary: "Session status overview", kind: "meta" },
  { name: "help", summary: "List the available commands", kind: "meta" },
  { name: "clear", summary: "Clear this conversation", kind: "meta" },
];

/** Models the user can switch to (`--model <alias>`); the current one is marked. */
export const KNOWN_MODELS: { alias: string; label: string; hint: string }[] = [
  { alias: "opus", label: "Claude Opus 4.8", hint: "Most capable" },
  { alias: "sonnet", label: "Claude Sonnet 5", hint: "Balanced speed + depth" },
  { alias: "haiku", label: "Claude Haiku 4.5", hint: "Fastest" },
];

const META_NAMES = new Set(META_COMMANDS.map((c) => c.name));

/** The full command list for a session: meta commands + real slash commands. */
export function allCommands(session: RunModel["session"]): SlashCommand[] {
  const prompt = (session?.slashCommands ?? [])
    .filter((n) => !META_NAMES.has(n))
    .map<SlashCommand>((n) => ({ name: n, summary: "Claude Code command", kind: "prompt" }));
  return [...META_COMMANDS, ...prompt];
}

/** Filter commands by the text after a leading `/` (empty query → all). */
export function matchCommands(query: string, session: RunModel["session"]): SlashCommand[] {
  const q = query.replace(/^\//, "").toLowerCase();
  const list = allCommands(session);
  if (!q) return list.slice(0, 30);
  return list.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
}

export function isMeta(name: string): boolean {
  return META_NAMES.has(name);
}

// --- The `/` menu ------------------------------------------------------------

export function SlashMenu({
  commands,
  activeIndex,
  onPick,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (c: SlashCommand) => void;
}): React.JSX.Element {
  return (
    <div className="mb-2 max-h-56 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-lg">
      {commands.map((c, i) => (
        <button
          key={c.name}
          type="button"
          // Prevent the textarea from losing focus before the click registers.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
            i === activeIndex ? "bg-vs-accent-muted text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
          )}
        >
          <span className="font-mono text-vs-accent">/{c.name}</span>
          <span className="truncate text-[11px] text-vs-text-muted">{c.summary}</span>
          {c.kind === "prompt" && <span className="ml-auto text-[9px] uppercase text-vs-text-muted/70">cmd</span>}
        </button>
      ))}
    </div>
  );
}

// --- Meta-command cards ------------------------------------------------------

const MCP_STATUS_STYLE: Record<string, string> = {
  connected: "text-vs-success",
  pending: "text-vs-warning",
  failed: "text-vs-error",
  "needs-auth": "text-vs-warning",
};

function CardShell({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-vs-border-default bg-vs-bg-primary px-3 py-2.5 text-[11px]">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-vs-text-muted">{title}</div>
      <div className="space-y-1 text-vs-text-secondary">{children}</div>
    </div>
  );
}

function chips(items: string[], empty: string): React.JSX.Element {
  if (items.length === 0) return <span className="text-vs-text-muted">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it} className="rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-[10px]">
          {it}
        </span>
      ))}
    </div>
  );
}

/** Renders the panel for a meta command from the session + live context. */
export function SlashCard({
  name,
  session,
  context,
  selectedModel,
  onPickModel,
}: {
  name: string;
  session: RunModel["session"];
  context: { cwd: string; live: string; costUsd?: number };
  selectedModel?: string;
  onPickModel: (alias: string) => void;
}): React.JSX.Element {
  const s = session;
  switch (name) {
    case "mcp":
      return (
        <CardShell title="/mcp — MCP servers">
          {(s?.mcpStatuses ?? []).length === 0 ? (
            <span className="text-vs-text-muted">No MCP servers reported for this session.</span>
          ) : (
            s!.mcpStatuses.map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{m.name}</span>
                <span className={cn("font-mono text-[10px]", MCP_STATUS_STYLE[m.status] ?? "text-vs-text-muted")}>
                  {m.status}
                </span>
              </div>
            ))
          )}
        </CardShell>
      );
    case "model":
      return (
        <CardShell title="/model — model">
          <div className="mb-1.5 text-vs-text-muted">
            Active: <span className="font-mono text-vs-text-primary">{s?.model ?? "unknown"}</span>
          </div>
          <div className="space-y-1">
            {KNOWN_MODELS.map((m) => {
              const active = selectedModel === m.alias;
              return (
                <button
                  key={m.alias}
                  type="button"
                  onClick={() => onPickModel(m.alias)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                    active
                      ? "border-vs-accent bg-vs-accent-muted text-vs-text-primary"
                      : "border-vs-border-default hover:bg-vs-bg-hover",
                  )}
                >
                  <span className="font-mono text-[11px]">{m.label}</span>
                  <span className="text-[10px] text-vs-text-muted">{active ? "selected" : m.hint}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[10px] text-vs-text-muted">Applies to your next message.</div>
        </CardShell>
      );
    case "context":
      return (
        <CardShell title="/context — what the assistant sees">
          <div>
            cwd: <span className="font-mono text-vs-text-primary">{context.cwd}</span>
          </div>
          <div className="whitespace-pre-wrap font-mono text-[10px] text-vs-text-muted">
            {context.live || "No file or selection is being sent."}
          </div>
          {typeof context.costUsd === "number" && (
            <div className="text-vs-text-muted">Session cost: ${context.costUsd.toFixed(4)}</div>
          )}
          {s?.permissionMode && <div className="text-vs-text-muted">Permission mode: {s.permissionMode}</div>}
        </CardShell>
      );
    case "skills":
      return <CardShell title={`/skills — ${s?.skills.length ?? 0}`}>{chips(s?.skills ?? [], "No skills.")}</CardShell>;
    case "agents":
      return <CardShell title={`/agents — ${s?.agents.length ?? 0}`}>{chips(s?.agents ?? [], "No subagents.")}</CardShell>;
    case "tools":
      return <CardShell title={`/tools — ${s?.tools.length ?? 0}`}>{chips(s?.tools ?? [], "No tools.")}</CardShell>;
    case "plugins":
      return <CardShell title={`/plugins — ${s?.plugins.length ?? 0}`}>{chips(s?.plugins ?? [], "No plugins.")}</CardShell>;
    case "status":
      return (
        <CardShell title="/status — session">
          <div>
            Model: <span className="font-mono text-vs-text-primary">{s?.model ?? "unknown"}</span>
          </div>
          <div>Permission: {s?.permissionMode ?? "—"}</div>
          <div>
            Skills {s?.skills.length ?? 0} · Agents {s?.agents.length ?? 0} · Tools {s?.tools.length ?? 0} · Plugins{" "}
            {s?.plugins.length ?? 0}
          </div>
          <div>
            MCP: {(s?.mcpStatuses ?? []).length} server{(s?.mcpStatuses ?? []).length === 1 ? "" : "s"}
          </div>
        </CardShell>
      );
    case "help":
    default:
      return (
        <CardShell title="/help — commands">
          <div className="space-y-0.5">
            {META_COMMANDS.map((c) => (
              <div key={c.name} className="flex gap-2">
                <span className="w-16 shrink-0 font-mono text-vs-accent">/{c.name}</span>
                <span className="text-vs-text-muted">{c.summary}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-vs-text-muted">
              Plus {(s?.slashCommands ?? []).length} Claude commands — type “/” to search them.
            </div>
          </div>
        </CardShell>
      );
  }
}
