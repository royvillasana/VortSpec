import { useState } from "react";
import type { JSX } from "react";
import { Spinner } from "@vortspec/ui/ui";
import type { InspectorComponent } from "@vortspec/core/ipc";
import type { UseComposeRun } from "../../lib/useComposeRun";
import { ComponentPicker } from "./ComponentPicker";
import { useDraggable } from "../../lib/useDraggable";

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
  onScreenLater,
  onClose,
  getStoryUrl,
  defaultAxis,
  onInsertSpecChange,
}: {
  compose: UseComposeRun;
  /** The project roster, for the Components tab. */
  components: InspectorComponent[];
  /** Route a no-match into the existing extract-component flow. */
  onExtract: (suggestedName: string | null) => void;
  /** Run the owed SDD-DE Screen Creation update for the accepted screen. */
  onScreenUpdate: (file: string) => void;
  /** Defer the owed Screen Creation update — surface it as a Save-changes bar in the sidebar. */
  onScreenLater?: (file: string) => void;
  /** Cancel the insert: dismiss the placeholder and drop out of the flow. */
  onClose: () => void;
  /** A live Storybook iframe URL for a component's initial state, or null (hover preview). */
  getStoryUrl?: (name: string) => string | null;
  /** The axis inferred from the container — pre-sets the Row/Column toggle. */
  defaultAxis?: "row" | "column";
  /** Notify the host when placement/axis/slot-count changes, so the placeholder re-renders. */
  onInsertSpecChange?: (spec: {
    placement: "into-existing" | "new-row" | "new-column";
    axis: "row" | "column";
    slotCount: number;
  }) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"generate" | "components">("generate");
  const [placement, setPlacement] = useState<"into-existing" | "new-row" | "new-column">("into-existing");
  const [axis, setAxis] = useState<"row" | "column">(defaultAxis ?? "row");
  const [slotCount, setSlotCount] = useState(1);
  // A new row/column container fixes the axis; only "into gap" uses the axis toggle.
  const effectiveAxis: "row" | "column" = placement === "new-row" ? "row" : placement === "new-column" ? "column" : axis;
  const spec = { placement, axis: effectiveAxis, slotCount };
  const isNewContainer = placement !== "into-existing";
  const notify = (over: Partial<typeof spec>): void =>
    onInsertSpecChange?.({ placement, axis: effectiveAxis, slotCount, ...over });
  const setPlacementAndNotify = (p: typeof placement): void => {
    setPlacement(p);
    const a = p === "new-row" ? "row" : p === "new-column" ? "column" : axis;
    onInsertSpecChange?.({ placement: p, axis: a, slotCount });
  };
  const setAxisAndNotify = (a: "row" | "column"): void => {
    setAxis(a);
    notify({ axis: a });
  };
  const setSlotCountAndNotify = (n: number): void => {
    const c = Math.max(1, Math.min(6, n));
    setSlotCount(c);
    notify({ slotCount: c });
  };
  // Components the user picked to build from — shared across both tabs, sent as the
  // composition's preferred set. Multi-select: clicking a component toggles it.
  const [selected, setSelected] = useState<InspectorComponent[]>([]);
  const toggleComponent = (c: InspectorComponent): void =>
    setSelected((cur) => (cur.some((x) => x.name === c.name) ? cur.filter((x) => x.name !== c.name) : [...cur, c]));
  const { phase, result, activeOption } = compose;

  // The insert is a two-step flow: pick the layout FIRST (placement + how many
  // rows/columns), then compose into it. Discarding a build returns to step 1.
  const [step, setStep] = useState<"layout" | "compose">("layout");
  const backToLayout = (): void => setStep("layout");
  const discardAndRestep = (): void => {
    void compose.discard();
    setStep("layout");
  };
  const unit = placement === "new-column" ? "row" : placement === "new-row" ? "column" : effectiveAxis === "column" ? "row" : "item";
  const summaryLabel =
    placement === "into-existing"
      ? `Into gap · ${slotCount} ${unit}${slotCount > 1 ? "s" : ""}`
      : `New ${slotCount} ${unit}${slotCount > 1 ? "s" : ""}`;

  const drag = useDraggable();
  return (
    <div
      data-testid="compose-panel"
      data-vs-overlay
      style={drag.style}
      className="pointer-events-auto absolute right-3 top-3 z-40 flex w-72 flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 text-[12px] text-vs-text-secondary shadow-2xl backdrop-blur"
    >
      <div {...drag.handleProps} data-testid="dialog-drag-handle" className="flex items-center gap-2 select-none">
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

      {phase === "idle" && step === "layout" ? (
        // ── STEP 1: choose the layout first (placement + how many rows/columns) ──
        <div data-testid="compose-layout" className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide text-vs-text-muted">Layout</span>
          <div role="group" aria-label="Placement" className="grid grid-cols-3 gap-1">
            <PlacementCard active={placement === "into-existing"} onClick={() => setPlacementAndNotify("into-existing")}>
              Into gap
            </PlacementCard>
            <PlacementCard active={placement === "new-row"} onClick={() => setPlacementAndNotify("new-row")}>
              Columns
            </PlacementCard>
            <PlacementCard active={placement === "new-column"} onClick={() => setPlacementAndNotify("new-column")}>
              Rows
            </PlacementCard>
          </div>
          {placement === "into-existing" && (
            <div className="flex items-center gap-2 text-[10px] text-vs-text-muted">
              <span>Insert as</span>
              <div role="group" aria-label="Insert axis" className="flex overflow-hidden rounded border border-vs-border-default">
                <LayoutBtn active={axis === "row"} onClick={() => setAxisAndNotify("row")}>
                  Row
                </LayoutBtn>
                <LayoutBtn active={axis === "column"} onClick={() => setAxisAndNotify("column")}>
                  Column
                </LayoutBtn>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-vs-text-muted">
              {placement === "new-row"
                ? "How many columns?"
                : placement === "new-column"
                  ? "How many rows?"
                  : "How many slots?"}{" "}
              <span data-testid="compose-slot-count" className="font-medium text-vs-text-primary">
                {slotCount}
              </span>
            </span>
            <SlotStrip
              orientation={effectiveAxis === "row" ? "horizontal" : "vertical"}
              count={slotCount}
              onChange={setSlotCountAndNotify}
            />
          </div>
          <button
            type="button"
            onClick={() => setStep("compose")}
            className="self-end rounded-md bg-vs-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            Continue →
          </button>
        </div>
      ) : phase === "idle" || phase === "generating" ? (
        <>
          {/* The chosen layout, carried as a label; edit jumps back to step 1. */}
          {phase === "idle" && (
            <div className="flex items-center gap-2 rounded bg-vs-bg-primary px-2 py-1 text-[10px]">
              <span data-testid="compose-summary" className="text-vs-text-secondary">
                {summaryLabel}
              </span>
              <button
                type="button"
                onClick={backToLayout}
                className="ml-auto rounded px-1 text-vs-accent hover:bg-vs-bg-hover"
              >
                Edit
              </button>
            </div>
          )}

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

          {/* A new container needs no roster; filling an existing gap does. */}
          {!compose.hasRoster && placement === "into-existing" ? (
            <p data-testid="compose-empty-roster">
              This project has no component roster yet, so there's nothing to compose into this gap. Build or import
              components first — or go back and create empty rows/columns.
            </p>
          ) : (
            <>
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
                      disabled={!isNewContainer && !draft.trim()}
                      title={
                        isNewContainer || draft.trim()
                          ? "Compose options for this slot"
                          : "Describe what belongs here first"
                      }
                      onClick={() => void compose.generate(draft, selected.map((c) => c.name), spec)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium text-white ${
                        isNewContainer || draft.trim() ? "bg-vs-accent hover:opacity-90" : "cursor-not-allowed bg-vs-accent/40"
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
              onClick={discardAndRestep}
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
            onClick={discardAndRestep}
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
                onClick={discardAndRestep}
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
              onClick={() => {
                // Don't drop the owed update — hand it to the sidebar Save-changes bar.
                if (compose.screenUpdateOwed) onScreenLater?.(compose.screenUpdateOwed);
                compose.clearScreenUpdate();
              }}
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

function LayoutBtn({
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
      aria-pressed={active}
      onClick={onClick}
      className={`px-1.5 py-0.5 text-[10px] ${
        active ? "bg-vs-accent text-white" : "text-vs-text-secondary hover:bg-vs-bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

/** A larger placement tile for the step-1 layout picker (Into gap / Columns / Rows). */
function PlacementCard({
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
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-vs-accent bg-vs-accent/10 text-vs-text-primary"
          : "border-vs-border-default text-vs-text-secondary hover:bg-vs-bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A Figma-like cell strip for picking how many rows/columns a new container gets:
 * click the Nth cell to set the count to N. Lays the cells along the container's
 * flow axis (horizontal for columns, vertical for rows). Bounded 1–6.
 */
function SlotStrip({
  orientation,
  count,
  onChange,
  max = 6,
}: {
  orientation: "horizontal" | "vertical";
  count: number;
  onChange: (n: number) => void;
  max?: number;
}): JSX.Element {
  const cells = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div
      role="group"
      aria-label="Slot count"
      className={`flex gap-1 ${orientation === "vertical" ? "w-16 flex-col" : "h-16"}`}
    >
      {cells.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} slot${n > 1 ? "s" : ""}`}
          aria-pressed={n === count}
          onClick={() => onChange(n)}
          className={`flex-1 rounded border text-[10px] transition-colors ${
            n <= count
              ? "border-vs-accent bg-vs-accent/20 text-vs-text-primary"
              : "border-vs-border-subtle text-vs-text-muted hover:border-vs-border-default"
          }`}
        >
          {n === count ? n : ""}
        </button>
      ))}
    </div>
  );
}
