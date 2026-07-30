import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import type { JSX, ComponentType } from "react";
import { Wand2, LayoutGrid, PenLine, Minus, Plus } from "lucide-react";
import { Spinner } from "@vortspec/ui/ui";
import type { InspectorComponent } from "@vortspec/core/ipc";
import type { UseComposeRun } from "../../lib/useComposeRun";
import { ComponentPicker } from "./ComponentPicker";
import { useDraggable } from "../../lib/useDraggable";
import { HoverTip } from "../HoverTip";
import { api } from "../../lib/api";

// Excalidraw is heavy — lazy so it only loads when the Draw tab is opened (never in the main bundle).
const InlineSketch = lazy(() => import("./InlineSketch"));

type Tab = "generate" | "components" | "draw";

/**
 * The composition dialog over an insert placeholder — ONE surface (no separate layout step): pick the
 * rows × columns for the spot, then compose into it three ways (Generate / Components / Draw). The Draw
 * tab sketches inline and attaches the drawing so the AI builds it INTO this exact slot. Non-idle
 * phases (generating / options / no-match / error) walk the run to accept or discard.
 */
export function ComposePanel({
  compose,
  components,
  projectPath,
  onExtract,
  onScreenUpdate,
  onScreenLater,
  onClose,
  getStoryUrl,
  onInsertSpecChange,
}: {
  compose: UseComposeRun;
  components: InspectorComponent[];
  /** Project path — used to persist the Draw-tab sketch PNG before composing. */
  projectPath: string;
  onExtract: (suggestedName: string | null) => void;
  onScreenUpdate: (file: string) => void;
  onScreenLater?: (file: string) => void;
  onClose: () => void;
  getStoryUrl?: (name: string) => string | null;
  /** Notify the host when rows/columns change, so the placeholder re-renders (mapped to axis+count). */
  onInsertSpecChange?: (spec: {
    placement: "into-existing" | "new-row" | "new-column";
    axis: "row" | "column";
    slotCount: number;
  }) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("generate");
  const [rows, setRows] = useState(1);
  const [columns, setColumns] = useState(1);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [selected, setSelected] = useState<InspectorComponent[]>([]);
  const { phase, result, activeOption } = compose;

  const clamp = (n: number): number => Math.max(1, Math.min(6, Math.round(n) || 1));
  // A single-axis grid (1×N or N×1) IS "into the gap" — placement is always into-existing now; the
  // rows × columns become the AI's layout. The placeholder shows a hint along the dominant axis.
  const axis: "row" | "column" = columns > 1 ? "row" : "column";
  const slotCount = columns > 1 ? columns : rows;
  const spec = { placement: "into-existing" as const, axis, slotCount, rows, columns };
  const notify = (r: number, c: number): void =>
    onInsertSpecChange?.({ placement: "into-existing", axis: c > 1 ? "row" : "column", slotCount: c > 1 ? c : r });
  const setRowsN = (n: number): void => {
    const v = clamp(n);
    setRows(v);
    notify(v, columns);
  };
  const setColsN = (n: number): void => {
    const v = clamp(n);
    setColumns(v);
    notify(rows, v);
  };

  const toggleComponent = (c: InspectorComponent): void =>
    setSelected((cur) => (cur.some((x) => x.name === c.name) ? cur.filter((x) => x.name !== c.name) : [...cur, c]));

  const generate = (): void => void compose.generate(draft, selected.map((c) => c.name), spec);
  const generateFromSketch = async (dataUrl: string): Promise<void> => {
    setDrawModalOpen(false);
    const pngPath = await api.canvasExportSketch(projectPath, `compose-${Date.now()}`, dataUrl).catch(() => "");
    if (!pngPath) return;
    await compose.generate(draft, selected.map((c) => c.name), spec, pngPath);
  };

  const discard = (): void => void compose.discard();

  const drag = useDraggable();
  return (
    <div
      data-testid="compose-panel"
      data-vs-overlay
      style={drag.style}
      className={`pointer-events-auto absolute right-3 top-3 z-40 flex flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 text-[12px] text-vs-text-secondary shadow-2xl backdrop-blur ${
        tab === "draw" && phase === "idle" ? "w-96" : "w-72"
      }`}
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

      {phase === "idle" || phase === "generating" ? (
        <>
          {/* Layout — rows × columns for this spot (no separate step, no gap concept). */}
          {phase === "idle" && (
            <div data-testid="compose-layout" className="flex items-center gap-4">
              <Stepper label="Rows" value={rows} onChange={setRowsN} />
              <Stepper label="Columns" value={columns} onChange={setColsN} />
            </div>
          )}

          {/* Picked components — context shared across tabs (chosen in Components, used by Generate/Draw). */}
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

          {/* Icon tabs: Generate (describe) · Components (pick) · Draw (sketch). */}
          {phase === "idle" && (
            <div role="tablist" aria-label="Compose mode" className="flex gap-1 border-b border-vs-border-subtle pb-1">
              <IconTab active={tab === "generate"} onClick={() => setTab("generate")} label="Generate — describe it" icon={Wand2} />
              <IconTab
                active={tab === "components"}
                onClick={() => setTab("components")}
                label="Components — pick what to build with"
                icon={LayoutGrid}
                badge={selected.length || undefined}
              />
              <IconTab active={tab === "draw"} onClick={() => setTab("draw")} label="Draw — sketch it" icon={PenLine} />
            </div>
          )}

          {tab === "components" && phase === "idle" ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-vs-text-muted">Pick components to build with, then describe it in Generate or Draw it.</p>
              <ComponentPicker
                components={components}
                actionLabel="select"
                getStoryUrl={getStoryUrl}
                selectedNames={selected.map((c) => c.name)}
                onPick={(c) => toggleComponent(c)}
                onExtract={() => onExtract(null)}
              />
            </div>
          ) : tab === "draw" && phase === "idle" ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-vs-text-muted">Sketch what belongs here — it composes into this slot on the current screen.</p>
              <button
                type="button"
                onClick={() => setDrawModalOpen(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-vs-accent bg-vs-accent/10 px-2.5 py-1.5 text-xs font-medium text-vs-text-primary hover:bg-vs-accent/20"
              >
                <PenLine size={13} /> Open drawing canvas →
              </button>
            </div>
          ) : (
            // Generate tab (and the generating state) — prompt input + action.
            <div className="flex flex-col gap-1.5">
              <div className="relative rounded border border-vs-border-default bg-vs-bg-primary focus-within:ring-2 focus-within:ring-vs-accent-subtle">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={phase === "generating"}
                  placeholder={
                    selected.length > 0 ? `Describe what to build with ${selected.map((c) => c.name).join(", ")}…` : "Describe what belongs here…"
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
                      onClick={generate}
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
            <button type="button" onClick={discard} className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover">
              Discard
            </button>
          </div>
        </>
      ) : phase === "error" ? (
        <>
          <p data-testid="compose-error" className="text-vs-text-primary">
            {compose.error}
          </p>
          <button type="button" onClick={discard} className="self-start rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover">
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
                <div className="font-medium text-vs-text-primary">{result.options[activeOption].title || `Option ${activeOption + 1}`}</div>
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
              <button type="button" onClick={() => void compose.accept()} className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90">
                Accept
              </button>
              <button type="button" onClick={discard} className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover">
                Discard
              </button>
            </div>
          </>
        )
      )}

      {compose.screenUpdateOwed && (
        <div data-testid="compose-screen-update" className="mt-1 rounded border border-vs-border-subtle bg-vs-bg-primary px-2 py-1.5">
          <p>
            The <span className="font-mono text-vs-text-primary">{compose.screenUpdateOwed}</span> screen's spec now needs a Screen Creation
            update to match what you inserted.
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

      {/* Big drawing pop-up (portaled to body so the panel's backdrop-blur doesn't trap `fixed`).
          "Generate from drawing" composes the sketch INTO this dialog's slot on the current screen. */}
      {drawModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
            onClick={() => setDrawModalOpen(false)}
          >
            <div
              className="flex h-[82vh] w-[84vw] max-w-6xl flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated p-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-none items-center gap-2 text-[12px]">
                <span className="font-semibold text-vs-text-primary">Draw the component</span>
                <span className="text-vs-text-muted">— it composes into the selected slot</span>
                <button
                  type="button"
                  onClick={() => setDrawModalOpen(false)}
                  aria-label="Close"
                  className="ml-auto rounded px-1 text-vs-text-muted hover:text-vs-text-primary"
                >
                  ✕
                </button>
              </div>
              <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[11px] text-vs-text-muted">Loading canvas…</div>}>
                <InlineSketch onGenerate={(url) => void generateFromSketch(url)} generating={false} />
              </Suspense>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** An icon tab with a hover tooltip (the compose modes read as icons, not text). */
function IconTab({
  active,
  onClick,
  label,
  icon: Icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ComponentType<{ size?: number }>;
  badge?: number;
}): JSX.Element {
  return (
    <HoverTip label={label}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={label}
        onClick={onClick}
        className={`relative -mb-px flex items-center gap-1 rounded-t border-b-2 px-2.5 py-1.5 ${
          active ? "border-vs-accent text-vs-text-primary" : "border-transparent text-vs-text-muted hover:text-vs-text-primary"
        }`}
      >
        <Icon size={14} />
        {badge ? <span className="rounded-full bg-vs-accent px-1 text-[9px] font-medium text-white">{badge}</span> : null}
      </button>
    </HoverTip>
  );
}

/** A compact −N+ stepper for rows / columns (bounded 1–6). */
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-vs-text-muted">{label}</span>
      <div className="flex items-center overflow-hidden rounded border border-vs-border-default">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          onClick={() => onChange(value - 1)}
          className="px-1.5 py-0.5 text-vs-text-secondary hover:bg-vs-bg-hover"
        >
          <Minus size={11} />
        </button>
        <span className="min-w-[18px] text-center text-[12px] font-medium text-vs-text-primary">{value}</span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
          className="px-1.5 py-0.5 text-vs-text-secondary hover:bg-vs-bg-hover"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
