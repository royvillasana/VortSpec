import { FileText, Pencil, TerminalSquare, Search, Plug, Wrench, Check, X, Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ToolStep } from "@vortspec/ui/run-model";
import { cn } from "../../lib/cn";

/**
 * The shadcn/ai **Tool** — a compact card for a tool call Claude made (Read,
 * Edit, Bash, Grep, an MCP tool…), with a per-tool icon, the target detail, and
 * a live status (running / ok / error). Surfaces what the assistant is *doing*,
 * which was previously invisible in the chat.
 */
function iconFor(name: string): typeof FileText {
  const n = name.toLowerCase();
  if (n.startsWith("mcp__")) return Plug;
  if (n === "read" || n === "glob") return FileText;
  if (n === "grep" || n === "search") return Search;
  if (n === "edit" || n === "write" || n === "multiedit") return Pencil;
  if (n === "bash" || n === "terminal") return TerminalSquare;
  return Wrench;
}

/** Trim `mcp__server__tool` to `server/tool` for display. */
function prettyName(name: string): string {
  if (name.startsWith("mcp__")) {
    const [, server, ...rest] = name.split("__");
    return `${server}/${rest.join("__")}`;
  }
  return name;
}

export function Tool({ step }: { step: ToolStep }): React.JSX.Element {
  const Icon = iconFor(step.name);
  return (
    <div className="flex items-center gap-2 rounded-md border border-vs-border-subtle bg-vs-bg-primary px-2 py-1 text-[11px]">
      <Icon size={13} className="shrink-0 text-vs-text-muted" />
      <span className="font-mono text-vs-text-secondary">{prettyName(step.name)}</span>
      {step.detail && <span className="truncate font-mono text-vs-text-muted">{step.detail}</span>}
      <span className="ml-auto shrink-0">
        {step.status === "running" ? (
          <Loader2 size={12} className="animate-spin text-vs-text-muted" />
        ) : step.status === "error" ? (
          <X size={12} className="text-vs-error" />
        ) : (
          <Check size={12} className="text-vs-success" />
        )}
      </span>
    </div>
  );
}

/**
 * A collapsible group of Tool cards (shadcn/ai Task-style) — "Worked · N steps".
 * Auto-expanded while a step is running so the user sees live progress.
 */
export function ToolSteps({ steps }: { steps: ToolStep[] }): React.JSX.Element | null {
  const running = steps.some((s) => s.status === "running");
  const [open, setOpen] = useState(true);
  const expanded = open || running;
  if (steps.length === 0) return null;
  return (
    <div className="rounded-lg border border-vs-border-default bg-vs-bg-surface/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-vs-text-muted hover:text-vs-text-secondary"
      >
        <ChevronDown size={12} className={cn("transition-transform", expanded ? "" : "-rotate-90")} />
        <span>
          {running ? "Working" : "Worked"} · {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        {running && <Loader2 size={11} className="animate-spin" />}
      </button>
      {expanded && (
        <div className="space-y-1 px-2 pb-2">
          {steps.map((s) => (
            <Tool key={s.id} step={s} />
          ))}
        </div>
      )}
    </div>
  );
}
