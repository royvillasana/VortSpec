import { useEffect, useState } from "react";
import type { JSX, ComponentType } from "react";
import { Wand2, LayoutGrid, PenLine, Minus, Plus } from "lucide-react";
import { Spinner } from "@vortspec/ui/ui";
import type { InspectorComponent } from "@vortspec/core/ipc";
import type { UseComposeRun } from "../../lib/useComposeRun";
import { ComponentPicker } from "./ComponentPicker";
import { useDraggable } from "../../lib/useDraggable";
import { HoverTip } from "../HoverTip";
import { api } from "../../lib/api";

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
  onSaveAsComponent,
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
  /** Promote the accepted composition into a real framework component + a Storybook story. */
  onSaveAsComponent?: (opts: { sourceFile: string | null; suggestedName: string | null }) => void;
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
  const [selected, setSelected] = useState<InspectorComponent[]>([]);
  // A sketch handed back from the Draw window — attached to the Generate input (not composed yet), so
  // the user can add text context before generating.
  const [pendingSketch, setPendingSketch] = useState<{ pngPath: string; dataUrl?: string } | null>(null);
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

  const generate = (): void => {
    void compose.generate(draft, selected.map((c) => c.name), spec, pendingSketch?.pngPath);
    setPendingSketch(null);
  };

  // When the separate Draw window hands back a sketch, ATTACH it to the Generate input (don't compose
  // yet) — the user adds any extra context, then hits Generate. Switch to the Generate tab so it shows.
  useEffect(() => {
    const off = api.onDrawSketchReady((p) => {
      if (p.projectPath !== projectPath) return;
      setPendingSketch({ pngPath: p.pngPath, dataUrl: p.dataUrl });
      setTab("generate");
    });
    return off;
  }, [projectPath]);

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
              <p className="text-[10px] text-vs-text-muted">
                Opens a separate, movable drawing window. Sketch there, hit <b>Use this drawing</b>, and it composes into
                this slot on the current screen.
              </p>
              <button
                type="button"
                onClick={() => void api.drawOpen(projectPath)}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-vs-accent bg-vs-accent/10 px-2.5 py-1.5 text-xs font-medium text-vs-text-primary hover:bg-vs-accent/20"
              >
                <PenLine size={13} /> Open drawing window →
              </button>
            </div>
          ) : (
            // Generate tab (and the generating state) — prompt input + action.
            <div className="flex flex-col gap-1.5">
              {/* A sketch handed over from the Draw window, attached like a pasted image. Add context below. */}
              {pendingSketch && phase === "idle" && (
                <div className="flex items-center gap-2 rounded border border-vs-accent-subtle bg-vs-accent-subtle/30 px-1.5 py-1">
                  {pendingSketch.dataUrl ? (
                    <img src={pendingSketch.dataUrl} alt="attached sketch" className="h-10 w-10 flex-none rounded border border-vs-border-subtle object-contain" />
                  ) : (
                    <span className="text-[16px]">🖼</span>
                  )}
                  <span className="text-[11px] text-vs-text-secondary">Sketch attached — add any context, then Generate.</span>
                  <button
                    type="button"
                    onClick={() => setPendingSketch(null)}
                    aria-label="Remove sketch"
                    className="ml-auto rounded px-1 leading-none text-vs-text-muted hover:text-vs-text-primary"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="relative rounded border border-vs-border-default bg-vs-bg-primary focus-within:ring-2 focus-within:ring-vs-accent-subtle">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={phase === "generating"}
                  placeholder={
                    pendingSketch
                      ? "Add any extra context for the sketch (optional)…"
                      : selected.length > 0
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
                      disabled={!draft.trim() && !pendingSketch}
                      title={draft.trim() || pendingSketch ? "Compose into this slot" : "Describe what belongs here (or attach a sketch) first"}
                      onClick={generate}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium text-white ${
                        draft.trim() || pendingSketch ? "bg-vs-accent hover:opacity-90" : "cursor-not-allowed bg-vs-accent/40"
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

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void compose.accept()} className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90">
                Accept
              </button>
              {onSaveAsComponent && (
                <button
                  type="button"
                  title="Accept, then extract it into a reusable framework component + a Storybook story"
                  onClick={() => {
                    void compose.accept();
                    onSaveAsComponent({
                      sourceFile: result.writtenFile,
                      suggestedName: result.options[activeOption]?.title || result.options[activeOption]?.componentsUsed[0] || null,
                    });
                  }}
                  className="rounded border border-vs-accent bg-vs-accent/10 px-2 py-1 text-vs-text-primary hover:bg-vs-accent/20"
                >
                  Save as component
                </button>
              )}
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
        {badge ? <span className="rounded-full bg-vs-accent px-1 text-[10px] font-medium text-white">{badge}</span> : null}
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
