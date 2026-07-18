import { useState } from "react";
import type { JSX } from "react";
import { Spinner } from "@vortspec/ui/ui";
import type { InspectorComponent } from "@vortspec/core/ipc";
import type { UseComposeRun } from "../../lib/useComposeRun";
import { ComponentPicker } from "./ComponentPicker";

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
  components,
  onExtract,
  onScreenUpdate,
  onClose,
  getStoryUrl,
}: {
  compose: UseComposeRun;
  /** The project roster, for the Components tab. */
  components: InspectorComponent[];
  /** Route a no-match into the existing extract-component flow. */
  onExtract: (suggestedName: string | null) => void;
  /** Run the owed SDD-DE Screen Creation update for the accepted screen. */
  onScreenUpdate: (file: string) => void;
  /** Cancel the insert: dismiss the placeholder and drop out of the flow. */
  onClose: () => void;
  /** A live Storybook iframe URL for a component's initial state, or null (hover preview). */
  getStoryUrl?: (name: string) => string | null;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"generate" | "components">("generate");
  // Components the user picked to build from — shared across both tabs, sent as the
  // composition's preferred set. Multi-select: clicking a component toggles it.
  const [selected, setSelected] = useState<InspectorComponent[]>([]);
  const toggleComponent = (c: InspectorComponent): void =>
    setSelected((cur) => (cur.some((x) => x.name === c.name) ? cur.filter((x) => x.name !== c.name) : [...cur, c]));
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel insert"
          title="Cancel — remove the placeholder"
          className="ml-auto rounded px-1 leading-none text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ✕
        </button>
      </div>

      {!compose.hasRoster ? (
        <p data-testid="compose-empty-roster">
          This project has no component roster yet, so there's nothing to compose from. Build or import components
          first, then try again — VortSpec won't hand-write markup for a slot.
        </p>
      ) : phase === "idle" || phase === "generating" ? (
        <>
          {/* Components the user picked to build from — context for the AI, shown in
              both tabs, each removable. Chosen in the Components tab, used by Generate. */}
          {selected.length > 0 && (
            <div data-testid="compose-context-chips" className="flex flex-wrap gap-1">
              {selected.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1 rounded border border-vs-accent-subtle bg-vs-accent-subtle/40 px-1.5 py-0.5 text-[10px] text-vs-text-secondary"
                >
                  <span className="font-mono">{c.name}</span>
                  {phase === "idle" && (
                    <button
                      type="button"
                      onClick={() => toggleComponent(c)}
                      aria-label={`Remove ${c.name}`}
                      className="rounded px-0.5 leading-none text-vs-text-muted hover:text-vs-text-primary"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Two ways to fill the slot: describe it (AI) or pick components to build with. */}
          {phase === "idle" && (
            <div role="tablist" aria-label="Insert mode" className="flex gap-1 border-b border-vs-border-subtle">
              <TabButton active={tab === "generate"} onClick={() => setTab("generate")}>
                Generate
              </TabButton>
              <TabButton active={tab === "components"} onClick={() => setTab("components")}>
                Components{selected.length > 0 ? ` (${selected.length})` : ""}
              </TabButton>
            </div>
          )}

          {tab === "components" && phase === "idle" ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-vs-text-muted">
                Pick the components to build with, then describe it in <b>Generate</b>.
              </p>
              <ComponentPicker
                components={components}
                actionLabel="select"
                getStoryUrl={getStoryUrl}
                selectedNames={selected.map((c) => c.name)}
                onPick={(c) => toggleComponent(c)}
                onExtract={() => onExtract(null)}
              />
            </div>
          ) : (
            // The prompt input with its action button inside the field; the thinking
            // spinner lives BELOW the input (not over the prompt text).
            <div className="flex flex-col gap-1.5">
              <div className="relative rounded border border-vs-border-default bg-vs-bg-primary focus-within:ring-2 focus-within:ring-vs-accent-subtle">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={phase === "generating"}
                  placeholder={
                    selected.length > 0
                      ? `Describe what to build with ${selected.map((c) => c.name).join(", ")}…`
                      : "Describe what belongs here…"
                  }
                  className="min-h-[72px] w-full resize-none bg-transparent px-2 pb-9 pt-1.5 text-vs-text-primary focus:outline-none disabled:opacity-70"
                />
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end">
                  {phase === "generating" ? (
                    <button
                      type="button"
                      onClick={() => void compose.cancel()}
                      title="Stop composing"
                      className="flex items-center gap-1 rounded-md bg-vs-bg-hover px-2.5 py-1 text-xs font-medium text-vs-text-primary ring-1 ring-vs-border-default hover:bg-vs-bg-elevated"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!draft.trim()}
                      title={draft.trim() ? "Compose options for this slot" : "Describe what belongs here first"}
                      onClick={() => void compose.generate(draft, selected.map((c) => c.name))}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium text-white ${
                        draft.trim() ? "bg-vs-accent hover:opacity-90" : "cursor-not-allowed bg-vs-accent/40"
                      }`}
                    >
                      Generate
                    </button>
                  )}
                </div>
              </div>
              {phase === "generating" && (
                <div data-testid="compose-progress" className="flex min-w-0 items-center gap-1.5 text-[11px] text-vs-text-muted">
                  <Spinner />
                  <span className="min-w-0 flex-1 truncate">{compose.progress ?? "Composing options…"}</span>
                </div>
              )}
            </div>
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
                <div className="font-medium text-vs-text-primary">
                  {result.options[activeOption].title || `Option ${activeOption + 1}`}
                </div>
                {result.options[activeOption].axis && (
                  <div className="text-vs-text-muted">axis: {result.options[activeOption].axis}</div>
                )}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-2 py-1 text-[11px] ${
        active
          ? "border-vs-accent font-medium text-vs-text-primary"
          : "border-transparent text-vs-text-secondary hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
