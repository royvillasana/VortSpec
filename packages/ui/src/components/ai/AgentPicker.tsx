import { useState } from "react";
import { Bot, ChevronsUpDown, Check } from "lucide-react";
import type { Agent } from "./agents";
import { cn } from "../../lib/cn";

/**
 * The per-conversation **agent** picker (shadcn/ai-style dropdown). Lists the
 * custom presets and, grouped below, the session's Claude Code subagents.
 */
export function AgentPicker({
  agents,
  selected,
  onSelect,
}: {
  agents: Agent[];
  selected: Agent;
  onSelect: (agent: Agent) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const presets = agents.filter((a) => a.source === "preset");
  const subagents = agents.filter((a) => a.source === "subagent");
  const item = (a: Agent): React.JSX.Element => {
    const on = a.id === selected.id;
    return (
      <button
        key={a.id}
        type="button"
        role="option"
        aria-selected={on}
        onClick={() => {
          onSelect(a);
          setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
          on ? "text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
        )}
      >
        <Check size={12} className={cn(on ? "text-vs-accent" : "opacity-0")} />
        <span className="flex-1 truncate">{a.label}</span>
        {a.description && <span className="truncate text-[10px] text-vs-text-muted">{a.description}</span>}
      </button>
    );
  };
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Agent for this conversation"
        className="flex items-center gap-1 rounded-md border border-vs-border-default px-2 py-0.5 text-[11px] text-vs-text-secondary hover:text-vs-text-primary"
      >
        <Bot size={12} />
        <span className="max-w-[10rem] truncate">{selected.label}</span>
        <ChevronsUpDown size={11} className="text-vs-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute bottom-full left-0 z-50 mb-1 max-h-72 min-w-[220px] overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-xl">
            <div className="px-3 py-1 text-[9px] uppercase tracking-wide text-vs-text-muted/70">Presets</div>
            {presets.map(item)}
            {subagents.length > 0 && (
              <>
                <div className="mt-1 border-t border-vs-border-subtle px-3 pb-1 pt-1.5 text-[9px] uppercase tracking-wide text-vs-text-muted/70">
                  Subagents
                </div>
                {subagents.map(item)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
