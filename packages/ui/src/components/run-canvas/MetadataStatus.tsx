import type { JSX } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import type { MetadataPlan } from "@vortspec/core/ipc";

/**
 * AI-ready metadata coverage. Shows how many components carry a record an agent can actually use,
 * and offers a one-click gated run to fill the gap. Silent until a component roster exists.
 *
 * Counts COMPLETE records, not files (OpenSpec change: agentic-design-system, task 1.5). A legacy
 * record migrated on read has a file and still cannot tell a model when to reach for its component,
 * so counting it as covered would report a design system as ready while what reaches the model is
 * hollow — and the "complete" state would appear with the real gap untouched. Incomplete records
 * join the missing ones in the generate action, because regenerating is the fix for both.
 */
export function MetadataStatus({
  plan,
  running,
  onGenerate,
}: {
  plan: MetadataPlan | null;
  running: boolean;
  onGenerate: () => void;
}): JSX.Element | null {
  if (!plan || plan.total === 0) return null;
  const needsWork = plan.missing.length + plan.incomplete.length;
  const complete = needsWork === 0;
  return (
    <div
      data-testid="metadata-status"
      className="flex items-center gap-2 border-b border-vs-border-subtle bg-vs-bg-secondary px-4 py-1.5 text-[12px] text-vs-text-secondary"
    >
      <Sparkles size={13} className="flex-none text-vs-accent" />
      <span>
        AI metadata <span className="tabular-nums">{plan.complete}/{plan.total}</span>
      </span>
      {plan.incomplete.length > 0 && (
        <span data-testid="metadata-incomplete" className="text-vs-text-muted">
          {plan.incomplete.length} incomplete
        </span>
      )}
      {complete ? (
        <span className="flex items-center gap-1 text-vs-text-muted">
          <Check size={12} /> complete
        </span>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={running}
          data-testid="generate-metadata"
          className="ml-auto flex items-center gap-1.5 rounded border border-vs-border-subtle px-2 py-0.5 text-vs-accent hover:bg-vs-bg-hover disabled:opacity-60"
        >
          {running ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Generating…
            </>
          ) : (
            <>Generate for {needsWork}</>
          )}
        </button>
      )}
    </div>
  );
}
