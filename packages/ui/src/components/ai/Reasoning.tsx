import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { Shimmer } from "./Shimmer";

/**
 * The shadcn/ai **Reasoning** — a collapsible block for Claude's extended
 * thinking (Opus / o1-style). Auto-expands while thinking streams in (before the
 * answer starts), collapses to a one-line summary once the answer arrives.
 */
export function Reasoning({ text, streaming = false }: { text: string; streaming?: boolean }): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const show = open || streaming;
  return (
    <div className="rounded-lg border border-vs-border-subtle bg-vs-bg-surface/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-vs-text-muted hover:text-vs-text-secondary"
      >
        <Brain size={12} />
        {streaming ? <Shimmer>Thinking…</Shimmer> : <span>Reasoning</span>}
        <ChevronDown size={12} className={cn("ml-auto transition-transform", show ? "" : "-rotate-90")} />
      </button>
      {show && (
        <div className="max-h-52 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-[11px] italic leading-relaxed text-vs-text-muted">
          {text}
        </div>
      )}
    </div>
  );
}
