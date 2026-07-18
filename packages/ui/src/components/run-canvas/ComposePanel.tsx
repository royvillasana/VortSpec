import { useState } from "react";
import type { JSX } from "react";
import type { UseComposeRun } from "../../lib/useComposeRun";

/**
 * The composition panel over an insert placeholder (§6.5–6.15).
 *
 * One surface that walks the run: describe the intent → generate → watch progress
 * (with cancel) → cycle the roster-composed options in place → accept one or
 * discard. A "no component matches" result routes into extract-component; an
 * accept surfaces the owed Screen Creation update without blocking.
 */
export function ComposePanel({
  compose,
  onExtract,
  onScreenUpdate,
}: {
  compose: UseComposeRun;
  /** Route a no-match into the existing extract-component flow. */
  onExtract: (suggestedName: string | null) => void;
  /** Run the owed SDD-DE Screen Creation update for the accepted screen. */
  onScreenUpdate: (file: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const { phase, result, activeOption } = compose;

  return (
    <div
      data-testid="compose-panel"
      data-vs-overlay
      className="pointer-events-auto absolute right-3 top-3 z-40 flex w-72 flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 text-[12px] text-vs-text-secondary shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>🎯</span>
        <span className="font-semibold text-vs-text-primary">Compose here</span>
      </div>

      {!compose.hasRoster ? (
        <p data-testid="compose-empty-roster">
          This project has no component roster yet, so there's nothing to compose from. Build or import components
          first, then try again — VortSpec won't hand-write markup for a slot.
        </p>
      ) : phase === "idle" || phase === "generating" ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={phase === "generating"}
            placeholder="Describe what belongs here…"
            className="min-h-[64px] resize-none rounded border border-vs-border-default bg-vs-bg-primary px-2 py-1.5 text-vs-text-primary focus:outline-none focus:ring-2 focus:ring-vs-accent-subtle"
          />
          {phase === "generating" ? (
            <div className="flex items-center justify-between gap-2">
              <span data-testid="compose-progress" className="truncate text-vs-text-muted">
                {compose.progress ?? "Composing options…"}
              </span>
              <button
                type="button"
                onClick={() => void compose.cancel()}
                className="rounded border border-vs-border-default px-2 py-0.5 text-vs-text-primary hover:bg-vs-bg-hover"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!draft.trim()}
              title={draft.trim() ? "Compose options for this slot" : "Describe what belongs here first"}
              onClick={() => void compose.generate(draft)}
              className={`rounded px-2 py-1 text-white ${
                draft.trim() ? "bg-vs-accent hover:opacity-90" : "cursor-not-allowed bg-vs-accent/40"
              }`}
            >
              Generate
            </button>
          )}
        </>
      ) : phase === "no-match" ? (
        <>
          <p data-testid="compose-no-match">{result?.noMatch?.reason}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onExtract(result?.noMatch?.suggestedName ?? null)}
              className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90"
            >
              Extract a new component
            </button>
            <button
              type="button"
              onClick={() => void compose.discard()}
              className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
            >
              Discard
            </button>
          </div>
        </>
      ) : phase === "error" ? (
        <>
          <p data-testid="compose-error" className="text-vs-text-primary">
            {compose.error}
          </p>
          <button
            type="button"
            onClick={() => void compose.discard()}
            className="self-start rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
          >
            Discard
          </button>
        </>
      ) : (
        // phase === "options"
        result && (
          <>
            <div className="flex items-center justify-between">
              <span data-testid="compose-option-index" className="text-vs-text-primary">
                Option {activeOption + 1} of {result.options.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous option"
                  disabled={result.options.length < 2}
                  onClick={() => compose.selectOption((activeOption - 1 + result.options.length) % result.options.length)}
                  className="rounded px-1.5 hover:bg-vs-bg-hover disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next option"
                  disabled={result.options.length < 2}
                  onClick={() => compose.selectOption((activeOption + 1) % result.options.length)}
                  className="rounded px-1.5 hover:bg-vs-bg-hover disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>

            {result.options[activeOption] && (
              <div className="rounded border border-vs-border-subtle bg-vs-bg-primary px-2 py-1.5">
                <div className="font-medium text-vs-text-primary">{result.options[activeOption].title}</div>
                <div className="text-vs-text-muted">axis: {result.options[activeOption].axis}</div>
                {result.options[activeOption].note && <div className="mt-0.5">{result.options[activeOption].note}</div>}
                <div data-testid="compose-provenance" className="mt-1 text-[11px] text-vs-text-muted">
                  Uses: {result.options[activeOption].componentsUsed.join(", ") || "—"}
                </div>
              </div>
            )}

            {result.fewerReason && (
              <p data-testid="compose-fewer-reason" className="text-[11px] italic text-vs-text-muted">
                {result.fewerReason}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void compose.accept()}
                className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => void compose.discard()}
                className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
              >
                Discard
              </button>
            </div>
          </>
        )
      )}

      {compose.screenUpdateOwed && (
        <div data-testid="compose-screen-update" className="mt-1 rounded border border-vs-border-subtle bg-vs-bg-primary px-2 py-1.5">
          <p>
            The <span className="font-mono text-vs-text-primary">{compose.screenUpdateOwed}</span> screen's spec now
            needs a Screen Creation update to match what you inserted.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onScreenUpdate(compose.screenUpdateOwed as string);
                compose.clearScreenUpdate();
              }}
              className="rounded bg-vs-accent px-2 py-0.5 text-white hover:opacity-90"
            >
              Update the screen spec
            </button>
            <button
              type="button"
              onClick={() => compose.clearScreenUpdate()}
              className="rounded px-1.5 hover:bg-vs-bg-hover"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
