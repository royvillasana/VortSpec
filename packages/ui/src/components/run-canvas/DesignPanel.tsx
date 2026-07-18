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
import { NodeTree } from "./NodeTree";
import type { PendingEdit } from "./pending";
import { matchTokenName, tokenNameFromVar, tokensForField } from "./compose";
import { ColorTokenField, type ColorToken } from "./ColorPicker";

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
export function DesignPanel({
  selection,
  tree,
  hoveredId,
  onSelectNode,
  onHoverNode,
  onFieldChange,
  onVariantChange,
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
  onAssign,
  owedScreenUpdates = [],
  onSaveScreenUpdates,
  onDismissScreenUpdate,
  move,
}: {
  selection: Selection | null;
  tree: BridgeTree | null;
  hoveredId?: string | null;
  onSelectNode: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
  /** An ephemeral property edit (section field key → new value). */
  onFieldChange?: (key: string, value: string) => void;
  /** A variant switch (variant prop key → new option). */
  onVariantChange?: (key: string, value: string) => void;
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
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-vs-bg-primary text-vs-text-primary">
      {/* Layers — just the node tree. The mode toggle and zoom controls moved to
          the canvas toolbar (change: canvas-compose-and-preview-bar), so they no
          longer disappear with this region and are no longer duplicated by the
          Comments panel that replaces this one in comment mode. */}
      <LayersRegion
        tree={tree}
        selectedId={selection?.nodeId ?? null}
        hoveredId={hoveredId}
        onSelectNode={onSelectNode}
        onHoverNode={onHoverNode}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selection ? (
          <p className="px-3 py-6 text-center text-[11px] text-vs-text-muted">
            Select an element on the canvas to edit its properties.
          </p>
        ) : (
          <>
            <SelectionHeader selection={selection} onAssign={onAssign} />
            {/* Assigning / reusing / extracting a component moved to the inspect
                AssignDialog (change: canvas-compose-and-preview-bar) — this panel is
                now just identity + editable properties. */}
            {selection.variants.length > 0 && (
              <VariantSection variants={selection.variants} onChange={onVariantChange} />
            )}
            {selection.sections.map((section) => (
              <PropertySection
                key={section.id}
                section={section}
                onFieldChange={onFieldChange}
                colorTokens={colorTokens}
                tokens={tokens}
              />
            ))}
          </>
        )}
      </div>

      {/* Exactly ONE bar at the bottom (never stacked) — priority: an in-flight move,
          a post-apply review, pending inspect edits, then owed screen-spec updates. */}
      {move ? (
        <MoveBar {...move} />
      ) : review ? (
        <ReviewBar onKeep={onKeep} onRevert={onRevert} />
      ) : pending.length > 0 ? (
        <ApplyBar
          pending={pending}
          applying={applying}
          applyStatus={applyStatus}
          onApply={onApply}
          onDiscard={onDiscard}
          onRemove={onRemovePending}
        />
      ) : owedScreenUpdates.length > 0 ? (
        <SaveChangesBar files={owedScreenUpdates} onSave={onSaveScreenUpdates} onDismiss={onDismissScreenUpdate} />
      ) : null}
    </div>
  );
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
            <li key={p.key} className="group flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
              <span className="min-w-0 flex-1 truncate">
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
                  onClick={() => onRemove(p.key)}
                  aria-label={`Remove ${p.label} change`}
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

/** The Layers region: collapsible header · node tree. Modes and zoom live on the canvas toolbar. */
function LayersRegion({
  tree,
  selectedId,
  hoveredId,
  onSelectNode,
  onHoverNode,
}: {
  tree: BridgeTree | null;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelectNode: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-vs-border-subtle">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary hover:text-vs-text-primary"
        >
          <span className="text-[9px] text-vs-text-muted">{open ? "▾" : "▸"}</span>
          Layers
        </button>
      </div>
      {open && (
        <div className="max-h-64 overflow-y-auto">
          <NodeTree
            tree={tree}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelectNode}
            onHover={onHoverNode}
          />
        </div>
      )}
    </section>
  );
}

function SelectionHeader({ selection, onAssign }: { selection: Selection; onAssign?: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-vs-border-subtle px-3 py-2">
      <span className="truncate text-[13px] font-semibold">{selection.label}</span>
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
}: {
  section: DesignSection;
  onFieldChange?: (key: string, value: string) => void;
  colorTokens?: ColorToken[];
  tokens?: InspectorToken[];
}): JSX.Element | null {
  if (section.fields.length === 0) return null;
  return (
    <Collapsible title={section.title} defaultOpen>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {section.fields.map((f) => (
          <Row key={f.key} label={f.label}>
            <Field field={f} colorTokens={colorTokens} tokens={tokens} onChange={(val) => onFieldChange?.(f.key, val)} />
          </Row>
        ))}
      </div>
    </Collapsible>
  );
});

function Field({
  field,
  colorTokens,
  tokens,
  onChange,
}: {
  field: SectionField;
  colorTokens: ColorToken[];
  tokens: InspectorToken[];
  onChange: (value: string) => void;
}): JSX.Element {
  const control =
    field.kind === "align" ? (
      <AlignGrid value={field.value} onChange={onChange} />
    ) : field.kind === "segment" ? (
      <SegmentedField value={field.value} options={field.options} onChange={onChange} />
    ) : field.kind === "select" ? (
      <SelectField value={field.value} options={field.options} onChange={onChange} />
    ) : field.kind === "toggle" ? (
      <SelectField value={field.value} options={["true", "false"]} onChange={onChange} />
    ) : field.kind === "color" ? (
      <ColorTokenField value={field.value} token={field.token} colorTokens={colorTokens} onChange={onChange} />
    ) : field.kind === "length" ? (
      <LengthTokenField
        value={field.value}
        token={field.token}
        tokenType={field.tokenType}
        tokens={tokens}
        onChange={onChange}
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
}: {
  value: string;
  token?: string | null;
  tokenType?: string;
  tokens: InspectorToken[];
  onChange: (v: string) => void;
}): JSX.Element {
  const opts = tokensForField(tokens, tokenType);
  const [draft, setDraft] = useState(value);
  // The just-picked binding, reflected immediately so the field shows the new token
  // + its value BEFORE the (gated) apply refreshes the readout. `null` = detached to
  // a literal; `undefined` = follow the selection's recognized token.
  const [localToken, setLocalToken] = useState<string | null | undefined>(undefined);
  // Whether the user has typed a raw value into the input (so blur commits it — a
  // pick that merely repopulates the input must not be mistaken for a raw edit).
  const editedRef = useRef(false);
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

  const bindToken = (name: string): void => {
    // Reflect the new token name + its resolved value in the field right away.
    setDraft(opts.find((t) => t.name === name)?.resolvedValue ?? draft);
    setLocalToken(name);
    editedRef.current = false;
    onChange(`var(--${name})`); // emit the binding — the guest resolves the real value
    setOpen(false);
  };
  const detach = (): void => {
    // Fall back to a raw literal — the current resolved value (or the bound token's).
    const raw = opts.find((t) => t.name === matched)?.resolvedValue ?? draft;
    setDraft(raw);
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
      <div className="flex w-full items-center rounded border border-vs-border-default bg-vs-bg-surface focus-within:border-vs-accent">
        {opts.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={matched ? `Variable: ${matched} — pick another or detach` : "Bind a variable"}
            className={`flex max-w-[58%] flex-none items-center gap-1 rounded-l px-1.5 py-1 text-[10px] ${
              matched
                ? "bg-vs-accent-subtle text-vs-accent"
                : "text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-secondary"
            }`}
          >
            <span className="text-[8px]">◆</span>
            {matched && <span className="truncate">{matched}</span>}
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => {
            editedRef.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commitRaw}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 bg-transparent px-2 py-1 text-right font-mono text-[12px] text-vs-text-primary outline-none"
        />
      </div>
      {open && opts.length > 0 && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl">
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

/** An inline segmented button group (Figma-style) — e.g. flow: block / row / column. */
function SegmentedField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}): JSX.Element {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex w-full overflow-hidden rounded border border-vs-border-default">
      {options.map((o) => {
        const active = o === local;
        return (
          <button
            key={o}
            type="button"
            onClick={() => {
              setLocal(o);
              onChange(o);
            }}
            className={`flex-1 px-1 py-1 text-[11px] capitalize transition-colors ${
              active
                ? "bg-vs-accent text-white"
                : "bg-vs-bg-surface text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
            }`}
          >
            {o}
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
