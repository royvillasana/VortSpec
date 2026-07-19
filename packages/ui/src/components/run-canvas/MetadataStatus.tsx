import type { JSX } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import type { MetadataPlan } from "@vortspec/core/ipc";

/**
 * AI-ready metadata coverage (Plan B6). Shows how many components have generated
 * metadata and offers a one-click gated run to fill the gap. Silent until a component
 * roster exists; a compact "complete" state once every component is covered.
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
  const complete = plan.missing.length === 0;
  return (
    <div
      data-testid="metadata-status"
      className="flex items-center gap-2 border-b border-vs-border-subtle bg-vs-bg-secondary px-4 py-1.5 text-[12px] text-vs-text-secondary"
    >
      <Sparkles size={13} className="flex-none text-vs-accent" />
      <span>
        AI metadata <span className="tabular-nums">{plan.withMetadata}/{plan.total}</span>
      </span>
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
            <>Generate for {plan.missing.length}</>
          )}
        </button>
      )}
    </div>
  );
}
