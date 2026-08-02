import { memo, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type {
  Selection,
  BridgeTree,
  DesignSection,
  SectionField,
  VariantControl,
  InspectorToken,
} from "@vortspec/core/ipc";
import { Link2, Unlink2, Search } from "lucide-react";
import { NodeTree } from "./NodeTree";
import type { PendingEdit } from "./pending";
import { matchTokenName, tokenNameFromVar, tokensForField } from "./compose";
import { ColorTokenField, type ColorToken } from "./ColorPicker";
import { CreateVariableRow } from "./CreateVariableRow";
import { ScopeSelector } from "./ScopeSelector";
import { scopeReach, scopeTargets } from "./scope-reach";
import {
  availableScopes,
  deriveScope,
  type ScopeReach,
  type ScopeTarget,
  type StyleScope,
} from "@vortspec/core/style-scope";

/**
 * The Run-section Design panel (change: run-canvas-visual-editor).
 *
 * Docked where the file Explorer lives, this replicates Figma's Design tab: a
 * collapsible Layers node tree on top, then the current selection's property
 * sections in Figma's order — Current variant, Position, Layout, Appearance,
 * Stroke, Fill, Effects, Colors, Layout guide (design D8). It is a pure view of
 * a `Selection` view-model; edits are reported up as ephemeral changes (the host
 * applies them as live guest overrides and gates the eventual commit).
 */
/** The tree's default height — what the panel showed before it became resizable, so nothing jumps. */
const DEFAULT_TREE_H = 176;
const MIN_TREE_H = 80;
const MAX_TREE_H = 560;

/**
 * State that survives a remount and a restart, namespaced per project. Layout choices the user makes with
 * the mouse (how tall the tree is, which tab they were on) are worth remembering — re-making them on every
 * visit is exactly the kind of friction that makes a panel feel unfinished.
 */
function usePersisted<T extends string | number>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(`vs:${key}`);
      if (raw === null) return fallback;
      return (typeof fallback === "number" ? (Number(raw) as T) : (raw as T));
    } catch {
      return fallback; // storage unavailable (private mode, tests) — behave as if unset
    }
  });
  const set = (v: T): void => {
    setValue(v);
    try {
      window.localStorage.setItem(`vs:${key}`, String(v));
    } catch {
      /* not persisting is survivable; failing to render is not */
    }
  };
  return [value, set];
}

/** The drag handle between the layer tree and the detail region below it. */
function TreeResizer({ height, onHeight }: { height: number; onHeight: (h: number) => void }): JSX.Element {
  const start = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    function move(e: MouseEvent): void {
      if (!start.current) return;
      const next = Math.min(MAX_TREE_H, Math.max(MIN_TREE_H, start.current.h + (e.clientY - start.current.y)));
      onHeight(next);
    }
    function up(): void {
      start.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onHeight]);
  return (
    <div
      role="separator"
      aria-label="Resize the layer tree"
      aria-orientation="horizontal"
      onMouseDown={(e) => {
        start.current = { y: e.clientY, h: height };
      }}
      className="group flex h-2 flex-none cursor-row-resize items-center justify-center border-b border-vs-border-subtle bg-vs-bg-primary"
    >
      <span className="h-px w-8 rounded bg-vs-border-default transition-colors group-hover:bg-vs-accent" />
    </div>
  );
}

export function DesignPanel({
  selection,
  tree,
  hoveredId,
  onSelectNode,
  selectedIds,
  onHoverNode,
  onReorderNode,
  onFieldChange,
  onVariantChange,
  onDelete,
  pending = [],
  applying = false,
  applyStatus = null,
  review = false,
  onApply,
  onDiscard,
  onRemovePending,
  onKeep,
  onRevert,
  colorTokens = [],
  tokens = [],
  onCreateToken,
  onAssign,
  owedScreenUpdates = [],
  onSaveScreenUpdates,
  onDismissScreenUpdate,
  move,
  storageKey,
  libraryPanel,
}: {
  selection: Selection | null;
  /** Every selected node, focused member included. Omitted → the focused member alone. */
  selectedIds?: string[];
  tree: BridgeTree | null;
  hoveredId?: string | null;
  onSelectNode: (id: string, additive?: boolean) => void;
  onHoverNode?: (id: string | null) => void;
  /** Drag-to-reorder a layer: move `nodeId` before/after `targetId` — the page rearranges to match. */
  onReorderNode?: (nodeId: string, targetId: string, position: "before" | "after" | "inside") => void;
  /** An ephemeral property edit (section field key → new value). */
  onFieldChange?: (key: string, value: string, scope?: StyleScope, scopeKey?: string) => void;
  /** A variant switch (variant prop key → new option). */
  onVariantChange?: (key: string, value: string) => void;
  /** Delete the selected element (hidden live, removed from source on Apply). */
  onDelete?: () => void;
  /** Uncommitted edits (ephemeral overrides), surfaced in the Apply bar. */
  pending?: PendingEdit[];
  /** An apply is in flight (gated Claude run). */
  applying?: boolean;
  /** The gated run's current activity label, shown live under the progress bar. */
  applyStatus?: string | null;
  /** Post-apply review of a structural (gated) change — offer Keep / Revert. */
  review?: boolean;
  onApply?: () => void;
  onDiscard?: () => void;
  /** Remove one pending edit before applying (the per-item trash button). */
  onRemovePending?: (key: string) => void;
  onKeep?: () => void;
  onRevert?: () => void;
  /** Project color tokens for the Figma-style color picker (Libraries tab). */
  colorTokens?: ColorToken[];
  /** All project tokens — length fields offer/recognize spacing/radius/typography ones. */
  tokens?: InspectorToken[];
  /** Create a new design token from a field's current value, then bind the field to it. Bootstraps
   *  the token file if the project has none yet. Throws with a human message on a bad name/dupe. */
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
  /** Open the assign/replace-component dialog for the current selection (on demand). */
  onAssign?: () => void;
  /** Screen files whose spec owes a Screen Creation update (deferred from an insert). */
  owedScreenUpdates?: string[];
  /** Run the owed Screen Creation update for every deferred screen. */
  onSaveScreenUpdates?: () => void;
  /** Drop one owed screen update without running it. */
  onDismissScreenUpdate?: (file: string) => void;
  /** An in-flight drag-move's Keep/Revert gate — surfaced here instead of a floating dialog. */
  move?: {
    phase: "moved" | "reconciling" | "error";
    error?: string | null;
    progress?: string | null;
    onKeep: () => void;
    onRevert: () => void;
    onStop: () => void;
  } | null;
  /** Namespaces the persisted tree height + active tab (the project path). */
  storageKey?: string;
  /**
   * The design-system editor, rendered as the **Library** tab beside Design Attributes. When absent there
   * is no tab bar at all — so this panel is never left showing a tab that leads nowhere.
   */
  libraryPanel?: React.ReactNode;
}): JSX.Element {
  const [treeH, setTreeH] = usePersisted<number>(`${storageKey ?? ""}:layersHeight`, DEFAULT_TREE_H);
  const [tab, setTab] = usePersisted<"attributes" | "library">(`${storageKey ?? ""}:designTab`, "attributes");
  const active = libraryPanel ? tab : "attributes";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-vs-bg-primary text-vs-text-primary">
      {/* Layers — just the node tree. The mode toggle and zoom controls moved to
          the canvas toolbar (change: canvas-compose-and-preview-bar), so they no
          longer disappear with this region and are no longer duplicated by the
          Comments panel that replaces this one in comment mode. */}
      <LayersRegion
        tree={tree}
        selectedId={selection?.nodeId ?? null}
        selectedIds={selectedIds}
        hoveredId={hoveredId}
        onSelectNode={onSelectNode}
        onHoverNode={onHoverNode}
        onReorderNode={onReorderNode}
        height={treeH}
      />

      {/* The boundary between the tree and the detail region — drag to trade one's height for the
          other's (change: design-system-style-panel). */}
      <TreeResizer height={treeH} onHeight={setTreeH} />

      {libraryPanel && (
        <div className="flex flex-none items-stretch gap-1 border-b border-vs-border-subtle px-2 text-[12px]">
          {([
            ["attributes", "Design Attributes"],
            ["library", "Library"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={active === id}
              className={`border-b-2 px-2 py-1.5 font-medium transition-colors ${
                active === id
                  ? "border-vs-accent text-vs-text-primary"
                  : "border-transparent text-vs-text-muted hover:text-vs-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {active === "library" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{libraryPanel}</div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selection ? (
          <p className="px-3 py-6 text-center text-[11px] text-vs-text-muted">
            Select an element on the canvas to edit its properties.
          </p>
        ) : (
          <>
            <SelectionHeader selection={selection} onAssign={onAssign} onDelete={onDelete} />
            {/* Assigning / reusing / extracting a component moved to the inspect
                AssignDialog (change: canvas-compose-and-preview-bar) — this panel is
                now just identity + editable properties. */}
            {selection.variants.length > 0 && (
              <VariantSection variants={selection.variants} onChange={onVariantChange} />
            )}
            {selection.sections.map((section) => (
              <PropertySection
                onCreateToken={onCreateToken}
                key={section.id}
                section={section}
                onFieldChange={onFieldChange}
                colorTokens={colorTokens}
                tokens={tokens}
                targets={scopeTargets(selection)}
                reach={scopeReach(tree, tokens)}
              />
            ))}
          </>
        )}
      </div>
      )}

      <ChangesBar
        pending={pending}
        applying={applying}
        applyStatus={applyStatus}
        review={review}
        onApply={onApply}
        onDiscard={onDiscard}
        onRemovePending={onRemovePending}
        onKeep={onKeep}
        onRevert={onRevert}
        owedScreenUpdates={owedScreenUpdates}
        onSaveScreenUpdates={onSaveScreenUpdates}
        onDismissScreenUpdate={onDismissScreenUpdate}
        move={move}
      />
    </div>
  );
}

/**
 * The persistent "changes" footer for the Run sidebar (change: unified pending
 * changes). Renders exactly ONE bar at the bottom, never stacked, by priority:
 * an in-flight move → a post-apply review → pending inspect edits → owed screen
 * updates. Rendered in EVERY canvas mode (inspect/insert/comment/interact) so
 * un-saved work is always visible and one save/discard away, regardless of what
 * the panel above it shows.
 */
export function ChangesBar({
  pending = [],
  applying = false,
  applyStatus = null,
  review = false,
  onApply,
  onDiscard,
  onRemovePending,
  onKeep,
  onRevert,
  owedScreenUpdates = [],
  onSaveScreenUpdates,
  onDismissScreenUpdate,
  move,
}: {
  pending?: PendingEdit[];
  applying?: boolean;
  applyStatus?: string | null;
  review?: boolean;
  onApply?: () => void;
  onDiscard?: () => void;
  onRemovePending?: (key: string) => void;
  onKeep?: () => void;
  onRevert?: () => void;
  owedScreenUpdates?: string[];
  onSaveScreenUpdates?: () => void;
  onDismissScreenUpdate?: (file: string) => void;
  move?: {
    phase: "moved" | "reconciling" | "error";
    error?: string | null;
    progress?: string | null;
    onKeep: () => void;
    onRevert: () => void;
    onStop: () => void;
  } | null;
}): JSX.Element | null {
  if (move) return <MoveBar {...move} />;
  if (review) return <ReviewBar onKeep={onKeep} onRevert={onRevert} />;
  if (pending.length > 0)
    return (
      <ApplyBar
        pending={pending}
        applying={applying}
        applyStatus={applyStatus}
        onApply={onApply}
        onDiscard={onDiscard}
        onRemove={onRemovePending}
      />
    );
  if (owedScreenUpdates.length > 0)
    return <SaveChangesBar files={owedScreenUpdates} onSave={onSaveScreenUpdates} onDismiss={onDismissScreenUpdate} />;
  return null;
}

/** The drag-move gate, docked in the sidebar (no floating dialog): Keep / Revert,
 *  with an in-flight reconcile shown as progress, and a stop-with-reason on error. */
function MoveBar({
  phase,
  error,
  progress,
  onKeep,
  onRevert,
  onStop,
}: {
  phase: "moved" | "reconciling" | "error";
  error?: string | null;
  progress?: string | null;
  onKeep: () => void;
  onRevert: () => void;
  onStop: () => void;
}): JSX.Element {
  return (
    <div data-testid="move-bar" className="flex-none border-t border-vs-border-default bg-vs-bg-surface p-2.5">
      {phase === "moved" ? (
        <>
          <p data-testid="move-review" className="mb-2 text-[11px] text-vs-text-secondary">
            Moved here. Keep it to save the change to source, or revert.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onKeep}
              className="flex-1 rounded-md bg-vs-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={onRevert}
              className="rounded-md border border-vs-border-default px-3 py-1.5 text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover"
            >
              Revert
            </button>
          </div>
        </>
      ) : phase === "reconciling" ? (
        <>
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-vs-bg-hover">
            <div className="h-full w-full animate-pulse rounded-full bg-vs-accent" />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-vs-text-muted">
            <span data-testid="move-progress" className="min-w-0 flex-1 truncate">
              {progress ?? "Saving the move to source…"}
            </span>
            <button
              type="button"
              onClick={onStop}
              className="flex-none rounded border border-vs-border-default px-2 py-0.5 text-vs-text-secondary hover:bg-vs-bg-hover"
            >
              Stop
            </button>
          </div>
        </>
      ) : (
        <>
          <p data-testid="move-error" className="mb-2 text-[11px] text-vs-text-primary">
            {error}
          </p>
          <button
            type="button"
            onClick={onRevert}
            className="rounded-md border border-vs-border-default px-3 py-1.5 text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover"
          >
            Revert
          </button>
        </>
      )}
    </div>
  );
}

/** Owed Screen Creation updates deferred from an insert — the sidebar save-changes gate. */
function SaveChangesBar({
  files,
  onSave,
  onDismiss,
}: {
  files: string[];
  onSave?: () => void;
  onDismiss?: (file: string) => void;
}): JSX.Element {
  return (
    <div
      data-testid="screen-update-bar"
      className="flex-none border-t border-vs-border-default bg-vs-bg-surface p-2.5"
    >
      <div className="mb-2 flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-vs-text-primary">
          {files.length} screen spec{files.length === 1 ? "" : "s"} to update
        </span>
        <ul className="flex flex-col gap-0.5">
          {files.map((f) => (
            <li key={f} className="group flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
              <span className="min-w-0 flex-1 truncate font-mono">{f}</span>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(f)}
                  aria-label={`Dismiss ${f} spec update`}
                  title="Dismiss without updating the spec"
                  className="flex-none rounded p-0.5 text-vs-text-muted opacity-60 hover:bg-vs-bg-hover hover:text-vs-error hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-vs-text-muted">
          An inserted composition changed these screens — update each spec to match.
        </p>
      </div>
      <button
        type="button"
        onClick={onSave}
        className="w-full rounded-md bg-vs-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
      >
        Save changes
      </button>
    </div>
  );
}

/** The gated-commit bar: the only path to disk (spec-first gate). */
function ApplyBar({
  pending,
  applying,
  applyStatus,
  onApply,
  onDiscard,
  onRemove,
}: {
  pending: PendingEdit[];
  applying: boolean;
  applyStatus?: string | null;
  onApply?: () => void;
  onDiscard?: () => void;
  onRemove?: (key: string) => void;
}): JSX.Element {
  const shared = pending.filter((p) => p.shared);
  const structural = pending.filter((p) => p.kind !== "token");
  return (
    <div className="flex-none border-t border-vs-border-default bg-vs-bg-surface p-2.5">
      <div className="mb-2 flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-vs-text-primary">
          {pending.length} pending change{pending.length === 1 ? "" : "s"}
        </span>
        <ul className="flex flex-col gap-0.5">
          {pending.map((p) => (
            <li key={p.id} className="group flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
              <span className="min-w-0 flex-1 truncate">
                {p.elementLabel && (
                  <span className="text-vs-text-muted">{p.elementLabel} · </span>
                )}
                {p.label} → <span className="font-mono">{p.value}</span>
              </span>
              {p.shared && (
                <span className="flex-none rounded bg-vs-warning/20 px-1 text-[9px] text-vs-warning">shared token</span>
              )}
              {p.kind !== "token" && (
                <span className="flex-none rounded bg-vs-accent-subtle px-1 text-[9px] text-vs-accent">source edit</span>
              )}
              {onRemove && !applying && (
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={`Remove ${p.elementLabel ? `${p.elementLabel} ` : ""}${p.label} change`}
                  title="Remove this change"
                  className="flex-none rounded p-0.5 text-vs-text-muted opacity-60 hover:bg-vs-bg-hover hover:text-vs-error hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
        {shared.length > 0 && (
          <p className="text-[10px] text-vs-warning">
            Editing a shared token changes every element bound to it.
          </p>
        )}
        {structural.length > 0 && !applying && (
          <p className="text-[10px] text-vs-text-muted">
            Source edits run through Claude Code and can be reverted.
          </p>
        )}
      </div>
      {applying && <ApplyProgress status={applyStatus} structural={structural.length > 0} />}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="flex-1 rounded-md bg-vs-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying ? "Applying…" : "Apply changes"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={applying}
          className="rounded-md border border-vs-border-default px-3 py-1.5 text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * Live progress for an in-flight apply. A source (gated) edit runs a Claude Code
 * session that can take a minute+, so show an indeterminate bar, the run's current
 * activity, and an elapsed timer rather than a frozen "Applying…".
 */
function ApplyProgress({ status, structural }: { status?: string | null; structural: boolean }): JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const time = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-vs-bg-hover">
        <div className="h-full w-full animate-pulse rounded-full bg-vs-accent" />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-vs-text-muted">
        <span className="min-w-0 flex-1 truncate">
          {status ?? (structural ? "Claude Code is editing the source…" : "Applying…")}
        </span>
        <span className="flex-none font-mono">{time}</span>
      </div>
    </div>
  );
}

/** After a structural apply: keep the applied change, or revert to the snapshot. */
function ReviewBar({ onKeep, onRevert }: { onKeep?: () => void; onRevert?: () => void }): JSX.Element {
  return (
    <div className="flex-none border-t border-vs-border-default bg-vs-bg-surface p-2.5">
      <p className="mb-2 text-[11px] text-vs-text-secondary">Applied. Keep the change or revert it.</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 rounded-md bg-vs-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
        >
          Keep
        </button>
        <button
          type="button"
          onClick={onRevert}
          className="rounded-md border border-vs-border-default px-3 py-1.5 text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover"
        >
          Revert
        </button>
      </div>
    </div>
  );
}

/**
 * The Layers region: header (title · search) over the node tree, at a caller-controlled height.
 *
 * The search is what makes a real screen's tree usable — the tree runs to dozens of nodes, and hunting
 * for one by scrolling and expanding is the slowest part of editing it. Type `footer`, get the footer.
 */
function LayersRegion({
  tree,
  selectedId,
  selectedIds,
  hoveredId,
  onSelectNode,
  onHoverNode,
  onReorderNode,
  height,
}: {
  tree: BridgeTree | null;
  selectedId: string | null;
  selectedIds?: string[];
  hoveredId?: string | null;
  onSelectNode: (id: string, additive?: boolean) => void;
  onHoverNode?: (id: string | null) => void;
  onReorderNode?: (nodeId: string, targetId: string, position: "before" | "after" | "inside") => void;
  /** Pixel height of the tree body — the user drags the boundary below it to change this. */
  height: number;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  return (
    <section className="flex flex-none flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary">
          Layers tree
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {searching && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setSearching(false);
                }
              }}
              placeholder="Find a layer…"
              aria-label="Find a layer by name"
              className="w-32 rounded border border-vs-border-default bg-vs-bg-elevated px-1.5 py-0.5 text-[11px] text-vs-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-vs-accent"
            />
          )}
          <button
            type="button"
            aria-label={searching ? "Close layer search" : "Search layers"}
            title="Find a layer by name"
            onClick={() => {
              // Closing the search clears it, so the tree is never left silently filtered.
              if (searching) setQuery("");
              setSearching((v) => !v);
            }}
            className="rounded p-0.5 text-vs-text-muted transition-colors hover:bg-vs-bg-hover hover:text-vs-text-primary"
          >
            <Search size={12} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto" style={{ height }}>
        <NodeTree
          tree={tree}
          selectedId={selectedId}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          onSelect={onSelectNode}
          onHover={onHoverNode}
          onReorder={onReorderNode}
          filter={query}
        />
      </div>
    </section>
  );
}

function SelectionHeader({
  selection,
  onAssign,
  onDelete,
}: {
  selection: Selection;
  onAssign?: () => void;
  onDelete?: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-vs-border-subtle px-3 py-2">
      <span className="truncate text-[13px] font-semibold">{selection.label}</span>
      {/* Size beside the name — the selection's most-asked-for fact, and free from the rect we already
          have (change: design-system-style-panel). */}
      <span className="shrink-0 font-mono text-[10px] text-vs-text-muted">
        {Math.round(selection.rect.width)} × {Math.round(selection.rect.height)}
      </span>
      {selection.component && (
        <span className="rounded border border-vs-border-default px-1 py-px text-[9px] uppercase tracking-wide text-vs-text-muted">
          component
        </span>
      )}
      {onAssign && (
        <button
          type="button"
          onClick={onAssign}
          title={selection.component ? "Replace with another component" : "Assign a component to this element"}
          className="rounded border border-vs-border-default px-1.5 py-px text-[10px] text-vs-text-secondary hover:bg-vs-bg-hover"
        >
          {selection.component ? "Replace" : "Assign"}
        </button>
      )}
      <span className="ml-auto font-mono text-[10px] text-vs-text-muted">
        {Math.round(selection.rect.width)}×{Math.round(selection.rect.height)}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Delete element (⌫) — removed from source on Apply"
          aria-label="Delete element"
          className="flex-none rounded p-1 text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-error"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

/** Current variant — one dropdown per variant prop (Figma's variant picker). */
const VariantSection = memo(function VariantSection({
  variants,
  onChange,
}: {
  variants: VariantControl[];
  onChange?: (key: string, value: string) => void;
}): JSX.Element {
  return (
    <Collapsible title="Current variant" defaultOpen>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {variants.map((v) => (
          <Row key={v.key} label={cap(v.key)}>
            {v.kind === "boolean" ? (
              <SelectField
                value={v.current ?? v.defaultValue ?? "false"}
                options={["true", "false"]}
                onChange={(val) => onChange?.(v.key, val)}
              />
            ) : v.kind === "enum" ? (
              <SelectField
                value={v.current ?? v.defaultValue ?? v.options[0] ?? ""}
                options={v.options}
                onChange={(val) => onChange?.(v.key, val)}
              />
            ) : (
              <TextField
                value={v.current ?? v.defaultValue ?? ""}
                onChange={(val) => onChange?.(v.key, val)}
              />
            )}
          </Row>
        ))}
      </div>
    </Collapsible>
  );
});

const PropertySection = memo(function PropertySection({
  section,
  onFieldChange,
  colorTokens = [],
  tokens = [],
  onCreateToken,
  targets = [],
  reach = {},
}: {
  section: DesignSection;
  onFieldChange?: (key: string, value: string, scope?: StyleScope, scopeKey?: string) => void;
  colorTokens?: ColorToken[];
  tokens?: InspectorToken[];
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
  targets?: ScopeTarget[];
  reach?: ScopeReach;
}): JSX.Element | null {
  if (section.fields.length === 0) return null;
  return (
    <Collapsible title={section.title} defaultOpen>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {section.fields.map((f) => (
          <ScopedField
            key={f.key}
            field={f}
            colorTokens={colorTokens}
            tokens={tokens}
            onCreateToken={onCreateToken}
            targets={targets}
            reach={reach}
            onChange={(val, scope, scopeKey) => onFieldChange?.(f.key, val, scope, scopeKey)}
          />
        ))}
      </div>
    </Collapsible>
  );
});

/**
 * One field plus the scope its edit will apply at (change: scoped-style-edits).
 *
 * The scope row appears when the field takes focus — before a value can be typed, which is the moment the
 * spec requires it to be visible, and not a moment earlier: rendering a scope row under every field at
 * rest would bury the panel in chrome the user is not using.
 *
 * The scope resets to its derived default whenever focus returns. A scope that persisted from the last
 * edit would be a mode, and a mode is invisible exactly when it matters — the failure this whole change
 * exists to prevent.
 */
function ScopedField({
  field,
  colorTokens,
  tokens,
  onChange,
  onCreateToken,
  targets,
  reach,
}: {
  field: SectionField;
  colorTokens: ColorToken[];
  tokens: InspectorToken[];
  onChange: (value: string, scope: StyleScope, scopeKey?: string) => void;
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
  targets: ScopeTarget[];
  reach: ScopeReach;
}): JSX.Element {
  const options = availableScopes(targets, field.key, reach);
  const derived = deriveScope(targets, field.key);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ scope: StyleScope; key?: string } | null>(null);
  const active = picked ?? derived;

  return (
    <div
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Only close when focus leaves the whole row — moving from the input to a scope chip must not
        // dismiss the control the user is reaching for.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setPicked(null);
        }
      }}
    >
      <Row label={field.label}>
        <Field
          field={field}
          colorTokens={colorTokens}
          tokens={tokens}
          onChange={(val) => onChange(val, active.scope, active.key)}
          onCreateToken={onCreateToken}
        />
      </Row>
      {open && (
        <div className="pl-[72px]">
          <ScopeSelector
            options={options}
            value={active.scope}
            onChange={(scope, key) => setPicked({ scope, key })}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  field,
  colorTokens,
  tokens,
  onChange,
  onCreateToken,
}: {
  field: SectionField;
  colorTokens: ColorToken[];
  tokens: InspectorToken[];
  onChange: (value: string) => void;
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
}): JSX.Element {
  const control =
    field.kind === "resize" ? (
      <ResizeField value={field.value} mode={field.mode ?? "fixed"} onChange={onChange} />
    ) : field.kind === "align" ? (
      <AlignGrid value={field.value} onChange={onChange} />
    ) : field.kind === "box" ? (
      <BoxField value={field.value} tokens={tokens} tokenType={field.tokenType} onChange={onChange} onCreateToken={onCreateToken} />
    ) : field.kind === "segment" ? (
      <SegmentedField
        value={field.value}
        options={field.options}
        onChange={onChange}
        icons={field.key === "flow" ? FLOW_ICONS : undefined}
      />
    ) : field.kind === "select" ? (
      <SelectField value={field.value} options={field.options} onChange={onChange} />
    ) : field.kind === "toggle" ? (
      <SelectField value={field.value} options={["true", "false"]} onChange={onChange} />
    ) : field.kind === "color" ? (
      <ColorTokenField value={field.value} token={field.token} colorTokens={colorTokens} onChange={onChange} onCreateToken={onCreateToken} />
    ) : field.kind === "length" ? (
      <LengthTokenField
        value={field.value}
        token={field.token}
        tokenType={field.tokenType}
        tokens={tokens}
        onChange={onChange}
        onCreateToken={onCreateToken}
      />
    ) : field.key === "content" ? (
      <ContentTextarea value={field.value} onChange={onChange} />
    ) : (
      <TextField value={field.value} onChange={onChange} mono />
    );
  // Color + length fields carry their own token indicator; other token-backed
  // fields get a badge underneath.
  const ownIndicator = field.kind === "color" || field.kind === "length";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {control}
      {field.token && !ownIndicator && <TokenBadge name={field.token} />}
    </div>
  );
}

/** Width that hugs a monospace value (digits are 1ch), with a little breathing room. */
const hugWidth = (draft: string): React.CSSProperties => ({ width: `${Math.max(2, draft.length) + 0.6}ch` });

/**
 * The value control for any token-capable field, in one of two states:
 *  - BOUND — the value sits in a rounded accent box (a variable chip) whose WHOLE
 *    area is a button: clicking it anywhere opens the picker (change the variable or
 *    switch to a raw value). It is not directly editable — that's the point of a
 *    bound value.
 *  - RAW — an editable input where the user types the value. `showDot` fields expose
 *    a ◆ button to bind a variable (length fields bind via their left name-pill, so
 *    they pass showDot=false).
 * A transparent border in the raw state holds the size so binding/detaching never
 * shifts the layout, and `ml-auto` keeps the chip flush right. `hugWidth` keeps both
 * states sized to the value, never filling the input.
 */
function TokenValueChip({
  draft,
  matched,
  showDot,
  inputRef,
  onOpen,
  onInput,
  onCommit,
}: {
  draft: string;
  matched: string | null;
  showDot: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onOpen: () => void;
  onInput: (v: string) => void;
  onCommit: () => void;
}): JSX.Element {
  if (matched) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={`Variable: ${matched} — click to change or enter a raw value`}
        aria-label={`Variable: ${matched}`}
        className="ml-auto inline-flex items-center gap-1 rounded border border-vs-accent/50 bg-vs-accent-subtle px-1 py-0.5 font-mono text-[12px] text-vs-text-primary hover:border-vs-accent"
      >
        <span>{draft}</span>
        {showDot && <span className="text-[10px] leading-none text-vs-accent">◆</span>}
      </button>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded border border-transparent px-1 py-0.5">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => onInput(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        style={hugWidth(draft)}
        className="bg-transparent text-right font-mono text-[12px] text-vs-text-primary outline-none"
      />
      {showDot && (
        <button
          type="button"
          onClick={onOpen}
          title="Bind a variable"
          aria-label="Bind a variable"
          className="flex-none rounded-full text-[10px] leading-none text-vs-text-muted hover:text-vs-text-secondary"
        >
          ◆
        </button>
      )}
    </span>
  );
}

/**
 * Figma-style length field: bind the attribute to one of the project's design
 * tokens **or** type a raw value. When bound, the token name sits on the left (a
 * pill that opens the variable list for this field's type — spacing / radius /
 * typography), and the px value on the right. Picking a token emits `var(--name)`
 * as the ephemeral override so the live preview uses the real token value; editing
 * the px detaches to a raw literal. The picker lists each token's name with its
 * resolved value beside it.
 */
function LengthTokenField({
  value,
  token,
  tokenType,
  tokens,
  onChange,
  onCreateToken,
}: {
  value: string;
  token?: string | null;
  tokenType?: string;
  tokens: InspectorToken[];
  onChange: (v: string) => void;
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
}): JSX.Element {
  const opts = tokensForField(tokens, tokenType);
  // The picker is available when there are tokens to bind OR we can create one (bootstrapping the
  // token file). This is what lets a user "put a token" on a field that has only a literal today.
  const canPick = opts.length > 0 || !!onCreateToken;
  const [draft, setDraft] = useState(value);
  // The just-picked binding, reflected immediately so the field shows the new token
  // + its value BEFORE the (gated) apply refreshes the readout. `null` = detached to
  // a literal; `undefined` = follow the selection's recognized token.
  const [localToken, setLocalToken] = useState<string | null | undefined>(undefined);
  // Whether the user has typed a raw value into the input (so blur commits it — a
  // pick that merely repopulates the input must not be mistaken for a raw edit).
  const editedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusRawRef = useRef(false); // focus the input right after detaching to raw
  // A fresh readout (new selection, or the kept change after apply) re-syncs the view.
  useEffect(() => {
    setDraft(value);
    setLocalToken(undefined);
    editedRef.current = false;
  }, [value, token]);
  const [open, setOpen] = useState(false);
  // The local pick wins; else the selection's recognized token / a var() binding;
  // else a raw literal that happens to equal a token's value.
  const matched =
    localToken !== undefined
      ? localToken
      : (token ?? tokenNameFromVar(value) ?? (tokenType ? matchTokenName(draft, opts, tokenType) : null));
  // After "Raw value" flips the chip to an editable input, focus it so the user can type.
  useEffect(() => {
    if (!matched && focusRawRef.current) {
      focusRawRef.current = false;
      inputRef.current?.focus();
    }
  });

  const bindToken = (name: string): void => {
    // Reflect the new token name + its resolved value in the field right away.
    setDraft(opts.find((t) => t.name === name)?.resolvedValue ?? draft);
    setLocalToken(name);
    editedRef.current = false;
    onChange(`var(--${name})`); // emit the binding — the guest resolves the real value
    setOpen(false);
  };
  // A just-created token — its value IS the current draft, so bind straight to it.
  const bindCreated = (name: string): void => {
    setLocalToken(name);
    editedRef.current = false;
    onChange(`var(--${name})`);
    setOpen(false);
  };
  const detach = (): void => {
    // Fall back to a raw literal — the current resolved value (or the bound token's).
    const raw = opts.find((t) => t.name === matched)?.resolvedValue ?? draft;
    setDraft(raw);
    focusRawRef.current = true; // becomes an editable input — focus it
    setLocalToken(null);
    editedRef.current = false;
    onChange(raw);
    setOpen(false);
  };
  const commitRaw = (): void => {
    if (!editedRef.current) return; // a pick repopulated the input — not a raw edit
    editedRef.current = false;
    setLocalToken(null); // typing a literal detaches any binding
    onChange(draft);
  };
  return (
    <div className="relative w-full">
      <div className="flex w-full items-center rounded border border-vs-border-default bg-vs-bg-surface pr-1 focus-within:border-vs-accent">
        {canPick && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={matched ? `Variable: ${matched} — pick another or detach` : "Bind a variable"}
            className={`m-0.5 flex max-w-[58%] flex-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${
              matched
                ? "bg-vs-accent-subtle text-vs-accent"
                : "text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-secondary"
            }`}
          >
            <span className="text-[8px]">◆</span>
            {matched && <span className="truncate">{matched}</span>}
          </button>
        )}
        <TokenValueChip
          draft={draft}
          matched={matched}
          showDot={false}
          inputRef={inputRef}
          onOpen={() => setOpen((o) => !o)}
          onInput={(v) => {
            editedRef.current = true;
            setDraft(v);
          }}
          onCommit={commitRaw}
        />
      </div>
      {open && canPick && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl">
            <CreateVariableRow value={draft} tokenType={tokenType} onCreateToken={onCreateToken} onCreated={bindCreated} />
            {opts.length === 0 && !onCreateToken && (
              <p className="px-2.5 py-1.5 text-[11px] text-vs-text-muted">No matching tokens in this project.</p>
            )}
            {matched && (
              <button
                type="button"
                onClick={detach}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-vs-text-muted hover:bg-vs-bg-hover"
              >
                <span className="text-[8px]">◇</span>
                <span className="truncate">Raw value</span>
              </button>
            )}
            {opts.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => bindToken(t.name)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] hover:bg-vs-bg-hover ${
                  t.name === matched ? "text-vs-accent" : "text-vs-text-secondary"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-[8px] text-vs-accent">◆</span>
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="flex-none font-mono text-vs-text-muted">{t.resolvedValue}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Multi-line editor for an element's text content (grows to fit paragraphs). */
function ContentTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      rows={3}
      className="max-h-64 min-h-[4.5rem] w-full resize-y rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1.5 text-[12px] leading-relaxed text-vs-text-primary outline-none focus:border-vs-accent"
    />
  );
}

/** A pill showing the value is backed by a design token (vs a literal). */
function TokenBadge({ name }: { name: string }): JSX.Element {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded bg-vs-accent-subtle px-1.5 py-px text-[9px] text-vs-accent">
      <span className="h-1.5 w-1.5 rounded-full bg-vs-accent" />
      {name}
    </span>
  );
}

// ── Small controls (native, vs-token styled) ─────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 flex-none pt-1 text-[11px] text-vs-text-muted">{label}</span>
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Figma-style 3×3 auto-layout alignment grid. Value is `"<x>|<y>"`. */
const ALIGN_POS = ["start", "center", "end"] as const;
function AlignGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  // Optimistic local highlight: move the dot instantly on click, and re-sync when
  // the selection (or a committed value) changes — the built value lags an edit.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const [cx, cy] = local.split("|");
  return (
    <div className="grid w-fit grid-cols-3 gap-0.5 rounded border border-vs-border-default bg-vs-bg-surface p-1">
      {ALIGN_POS.flatMap((y) =>
        ALIGN_POS.map((x) => {
          const active = x === cx && y === cy;
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              title={`${x} / ${y}`}
              onClick={() => {
                setLocal(`${x}|${y}`);
                onChange(`${x}|${y}`);
              }}
              className={`grid h-4 w-4 place-items-center rounded-sm ${
                active ? "bg-vs-accent" : "bg-vs-bg-elevated hover:bg-vs-bg-hover"
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${active ? "bg-white" : "bg-vs-text-muted"}`} />
            </button>
          );
        }),
      )}
    </div>
  );
}

/**
 * Figma-style per-side spacing (padding / margin). A linked-toggle cycles three modes —
 * All (one input) → H·V (two) → Individual (the 2×2 grid of Top/Right/Bottom/Left) — and
 * each side edits independently. Value is `"<top>|<right>|<bottom>|<left>"`; onChange emits
 * only the changed sides as `"side:value;…"` so one side never clobbers another.
 */
type BoxSide = "top" | "right" | "bottom" | "left";
const SIDE_MARK: Record<BoxSide, string> = { top: "M2.5 3h6", right: "M8 2.5v6", bottom: "M2.5 8h6", left: "M3 2.5v6" };
function SideGlyph({ mark }: { mark: string }): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden className="shrink-0 text-vs-text-muted">
      <rect x="2" y="2" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeOpacity="0.4" />
      <path d={mark} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
/** A side value's numeric display: resolve a `var(--token)` via the token set, else strip px. */
function sideDisplay(value: string, opts: InspectorToken[]): string {
  const varName = tokenNameFromVar(value);
  const resolved = varName ? (opts.find((o) => o.name === varName)?.resolvedValue ?? value) : value;
  return resolved.replace(/px$/, "");
}

/**
 * One box side — token-aware, mirroring LengthTokenField. Bind a spacing variable
 * via the ◆ picker OR type a raw value; the pill shows the bound (or value-matched)
 * token. Picking emits `var(--name)`, typing emits the raw px. Because BoxField's
 * grouped modes commit the SAME emitted value to every side they cover, a token or
 * raw value chosen while sides are linked is already present on each side's input
 * when the user unlinks to edit them individually.
 */
function BoxSideInput({
  glyph,
  value,
  tokens,
  tokenType,
  onCommit,
  onCreateToken,
  menuAlign = "start",
}: {
  glyph: JSX.Element;
  value: string; // "16px" | "var(--space-4)"
  tokens: InspectorToken[];
  tokenType?: string;
  onCommit: (v: string) => void; // raw px, or "var(--name)"
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
  menuAlign?: "start" | "end"; // which edge the (wide) picker anchors to, so it never overflows the panel
}): JSX.Element {
  const opts = tokensForField(tokens, tokenType);
  const canPick = opts.length > 0 || !!onCreateToken;
  const [draft, setDraft] = useState(() => sideDisplay(value, opts));
  // localToken: undefined = follow the value; null = detached to a literal; string = just-picked.
  const [localToken, setLocalToken] = useState<string | null | undefined>(undefined);
  const editedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusRawRef = useRef(false); // focus the input right after detaching to raw
  const prevValueRef = useRef(value);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    setDraft(sideDisplay(value, opts));
    // Normally re-derive the binding from the new value. But an explicit raw detach
    // (localToken === null) must STICK when the incoming value merely echoes it — our
    // own emit re-sends the same literal (e.g. 32px == space-8), and without this the
    // value-match would snap it straight back to a token chip, so "Raw value" would
    // never take. A var() or a genuinely different value (a real readout / node change)
    // still re-derives.
    setLocalToken((lt) =>
      lt === null && !tokenNameFromVar(value) && sideDisplay(value, opts) === sideDisplay(prev, opts)
        ? null
        : undefined,
    );
    editedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const matched =
    localToken !== undefined
      ? localToken
      : (tokenNameFromVar(value) ?? (tokenType ? matchTokenName(`${draft}px`, opts, tokenType) : null));
  // After "Raw value" flips the chip to an editable input, focus it so the user can type.
  useEffect(() => {
    if (!matched && focusRawRef.current) {
      focusRawRef.current = false;
      inputRef.current?.focus();
    }
  });
  const bindToken = (name: string): void => {
    setDraft(sideDisplay(`var(--${name})`, opts));
    setLocalToken(name);
    editedRef.current = false;
    onCommit(`var(--${name})`);
    setOpen(false);
  };
  const detach = (): void => {
    const raw = opts.find((t) => t.name === matched)?.resolvedValue ?? `${draft}px`;
    setDraft(raw.replace(/px$/, ""));
    focusRawRef.current = true; // becomes an editable input — focus it
    setLocalToken(null);
    editedRef.current = false;
    onCommit(raw);
    setOpen(false);
  };
  const commitRaw = (): void => {
    if (!editedRef.current) return; // a pick repopulated the input — not a raw edit
    editedRef.current = false;
    setLocalToken(null); // typing a literal detaches any binding
    const t = draft.trim();
    onCommit(/^-?\d*\.?\d+$/.test(t) ? `${t}px` : t);
  };
  // The current side value as a CSS length (draft is bare digits for a raw side).
  const sideCssValue = /^-?\d*\.?\d+$/.test(draft.trim()) ? `${draft.trim()}px` : draft.trim();
  const bindCreated = (name: string): void => {
    setLocalToken(name);
    editedRef.current = false;
    onCommit(`var(--${name})`);
    setOpen(false);
  };
  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center gap-1 rounded border border-vs-border-default bg-vs-bg-surface py-1 pl-1.5 pr-1 focus-within:border-vs-accent">
        {glyph}
        {/* Bound → the whole value chip is a button (click anywhere opens the picker);
            raw → an editable input with a ◆ to bind. The chip hugs its content and the
            dot is the compact token marker (name lives in the tooltip + picker). */}
        <TokenValueChip
          draft={draft}
          matched={matched}
          showDot={canPick}
          inputRef={inputRef}
          onOpen={() => setOpen((o) => !o)}
          onInput={(v) => {
            editedRef.current = true;
            setDraft(v);
          }}
          onCommit={commitRaw}
        />
      </div>
      {open && canPick && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          {/* The picker is content-width (name + resolved value), not the narrow input's
              width — so an unlinked side shows the same readable list as a single input.
              It anchors to the input's near edge so it never overflows the panel. */}
          <div
            className={`absolute z-30 mt-1 max-h-56 w-max min-w-[12rem] max-w-[15rem] overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl ${
              menuAlign === "end" ? "right-0" : "left-0"
            }`}
          >
            <CreateVariableRow value={sideCssValue} tokenType={tokenType} onCreateToken={onCreateToken} onCreated={bindCreated} />
            {matched && (
              <button
                type="button"
                onClick={detach}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-vs-text-muted hover:bg-vs-bg-hover"
              >
                <span className="text-[8px]">◇</span>
                <span className="truncate">Raw value</span>
              </button>
            )}
            {opts.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => bindToken(t.name)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] hover:bg-vs-bg-hover ${
                  t.name === matched ? "text-vs-accent" : "text-vs-text-secondary"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-[8px] text-vs-accent">◆</span>
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="flex-none font-mono text-vs-text-muted">{t.resolvedValue}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function BoxField({
  value,
  tokens,
  tokenType,
  onChange,
  onCreateToken,
}: {
  value: string;
  tokens: InspectorToken[];
  tokenType?: string;
  onChange: (v: string) => void;
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
}): JSX.Element {
  const [tv, rv, bv, lv] = value.split("|");
  const base = { top: tv ?? "0px", right: rv ?? "0px", bottom: bv ?? "0px", left: lv ?? "0px" };
  // Optimistic overlay of the sides the user just set — the value they entered (a
  // raw px OR a `var(--token)`), kept verbatim so it survives a mode switch. Without
  // it, unlinking to edit sides individually would remount inputs bound to the *old*
  // `value` (the host's readout is async), losing the token/value just chosen. A
  // fresh readout (new `value`) supersedes the overlay. This is what makes a value
  // assigned while linked replicate onto every side when the user unlinks.
  const [draft, setDraft] = useState<Partial<Record<BoxSide, string>>>({});
  useEffect(() => setDraft({}), [value]);
  const cur = {
    top: draft.top ?? base.top,
    right: draft.right ?? base.right,
    bottom: draft.bottom ?? base.bottom,
    left: draft.left ?? base.left,
  };
  // menuAlign follows the grid column so the (wide) token picker opens toward the panel
  // interior: left-column inputs anchor left, right-column inputs anchor right.
  const side = (
    glyph: JSX.Element,
    v: string,
    onCommit: (x: string) => void,
    menuAlign: "start" | "end" = "start",
  ): JSX.Element => (
    <BoxSideInput glyph={glyph} value={v} tokens={tokens} tokenType={tokenType} onCommit={onCommit} onCreateToken={onCreateToken} menuAlign={menuAlign} />
  );
  const allEqual = cur.top === cur.right && cur.right === cur.bottom && cur.bottom === cur.left;
  const axisEqual = cur.top === cur.bottom && cur.left === cur.right;
  const [mode, setMode] = useState<"all" | "axis" | "individual">(allEqual ? "all" : axisEqual ? "axis" : "individual");
  // Follow the incoming values, but don't yank the user out of a mode they opened.
  useEffect(() => {
    setMode((m) => (m !== "individual" && !allEqual && axisEqual ? "axis" : m !== "individual" && allEqual ? "all" : m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const cycle = (): void => setMode((m) => (m === "all" ? "axis" : m === "axis" ? "individual" : "all"));
  const emit = (sides: Partial<Record<BoxSide, string>>): void => {
    setDraft((d) => ({ ...d, ...sides })); // remember, so a mode switch replicates it
    onChange(
      Object.entries(sides)
        .map(([s, v]) => `${s}:${v}`)
        .join(";"),
    );
  };
  const linked = mode !== "individual";
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1">
        {mode === "all" ? (
          side(<SideGlyph mark="M2 5.5h7 M5.5 2v7" />, cur.top, (v) => emit({ top: v, right: v, bottom: v, left: v }))
        ) : mode === "axis" ? (
          <div className="flex gap-1.5">
            {side(<SideGlyph mark="M3 2.5v6" />, cur.left, (v) => emit({ left: v, right: v }), "start")}
            {side(<SideGlyph mark="M2.5 3h6" />, cur.top, (v) => emit({ top: v, bottom: v }), "end")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {side(<SideGlyph mark={SIDE_MARK.top} />, cur.top, (v) => emit({ top: v }), "start")}
            {side(<SideGlyph mark={SIDE_MARK.right} />, cur.right, (v) => emit({ right: v }), "end")}
            {side(<SideGlyph mark={SIDE_MARK.bottom} />, cur.bottom, (v) => emit({ bottom: v }), "start")}
            {side(<SideGlyph mark={SIDE_MARK.left} />, cur.left, (v) => emit({ left: v }), "end")}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={cycle}
        title={
          linked
            ? "Sides linked — click to edit each side independently"
            : "Sides independent — click to link them together"
        }
        aria-label="Link sides"
        aria-pressed={!linked}
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded ${
          linked ? "text-vs-text-muted hover:bg-vs-bg-hover" : "bg-vs-accent/15 text-vs-accent"
        }`}
      >
        {linked ? <Link2 size={13} aria-hidden /> : <Unlink2 size={13} aria-hidden />}
      </button>
    </div>
  );
}

/** An inline segmented button group (Figma-style) — e.g. flow: block / row / column. */
/**
 * Figma-style resize control: a Fixed/Hug/Fill mode dropdown + a px value (editable
 * only in Fixed). A mode change emits `@fixed`/`@hug`/`@fill`; a px edit emits the raw
 * value — the host maps either to the axis-aware CSS override.
 */
function ResizeField({
  value,
  mode,
  onChange,
}: {
  value: string;
  mode: "fixed" | "hug" | "fill";
  onChange: (v: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex w-full items-center gap-1">
      {mode === "fixed" ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onChange(draft)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-right font-mono text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
        />
      ) : (
        <span className="min-w-0 flex-1 rounded border border-vs-border-subtle bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-muted">
          {value}
        </span>
      )}
      <select
        aria-label="Resizing"
        value={mode}
        onChange={(e) => onChange(`@${e.target.value}`)}
        className="flex-none rounded border border-vs-border-default bg-vs-bg-surface px-1 py-1 text-[11px] text-vs-text-secondary outline-none focus:border-vs-accent"
      >
        <option value="fixed">Fixed</option>
        <option value="hug">Hug</option>
        <option value="fill">Fill</option>
      </select>
    </div>
  );
}

/**
 * Figma-style flow glyphs: no-auto-layout (block), horizontal (row), vertical (column).
 * Each is a 3-child mini-layout so the direction reads at a glance, like Figma's toolbar.
 */
const FLOW_ICONS: Record<string, JSX.Element> = {
  block: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.6" />
    </svg>
  ),
  row: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2.5" y="3.5" width="2.6" height="9" rx="1" />
      <rect x="6.7" y="3.5" width="2.6" height="9" rx="1" />
      <rect x="10.9" y="3.5" width="2.6" height="9" rx="1" />
    </svg>
  ),
  column: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3.5" y="2.5" width="9" height="2.6" rx="1" />
      <rect x="3.5" y="6.7" width="9" height="2.6" rx="1" />
      <rect x="3.5" y="10.9" width="9" height="2.6" rx="1" />
    </svg>
  ),
};

function SegmentedField({
  value,
  options,
  onChange,
  icons,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  icons?: Record<string, JSX.Element>;
}): JSX.Element {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex w-full overflow-hidden rounded border border-vs-border-default">
      {options.map((o) => {
        const active = o === local;
        const icon = icons?.[o];
        return (
          <button
            key={o}
            type="button"
            title={icon ? o : undefined}
            aria-label={icon ? o : undefined}
            aria-pressed={active}
            onClick={() => {
              setLocal(o);
              onChange(o);
            }}
            className={`flex flex-1 items-center justify-center px-1 py-1 text-[11px] capitalize transition-colors ${
              active
                ? "bg-vs-accent text-white"
                : "bg-vs-bg-surface text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
            }`}
          >
            {icon ?? o}
          </button>
        );
      })}
    </div>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2 0v9.5A1.5 1.5 0 0 1 12.5 17h-5A1.5 1.5 0 0 1 6 15.5V6" />
      <path d="M8.5 9.5v4M11.5 9.5v4" />
    </svg>
  );
}

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}): JSX.Element {
  const opts = options.includes(value) || value === "" ? options : [value, ...options];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function TextField({
  value,
  onChange,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`w-full rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-vs-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary hover:text-vs-text-primary"
      >
        <span className="text-[9px] text-vs-text-muted">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && children}
    </section>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
