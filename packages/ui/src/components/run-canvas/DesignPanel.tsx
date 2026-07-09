import { memo, useEffect, useState } from "react";
import type { JSX } from "react";
import type {
  Selection,
  BridgeTree,
  DesignSection,
  SectionField,
  VariantControl,
} from "@vortspec/core/ipc";
import { NodeTree } from "./NodeTree";
import type { PendingEdit } from "./pending";
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
  review = false,
  onApply,
  onDiscard,
  onKeep,
  onRevert,
  mode = "inspect",
  onModeChange,
  zoom = 1,
  onZoomBy,
  onZoomReset,
  colorTokens = [],
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
  /** Post-apply review of a structural (gated) change — offer Keep / Revert. */
  review?: boolean;
  onApply?: () => void;
  onDiscard?: () => void;
  onKeep?: () => void;
  onRevert?: () => void;
  /** Canvas input mode (Inspect / Interact) — shown beside the Layers label. */
  mode?: "inspect" | "interact";
  onModeChange?: (mode: "inspect" | "interact") => void;
  /** Canvas zoom — controls sit at the bottom of the Layers region. */
  zoom?: number;
  onZoomBy?: (factor: number) => void;
  onZoomReset?: () => void;
  /** Project color tokens for the Figma-style color picker (Libraries tab). */
  colorTokens?: ColorToken[];
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-vs-bg-primary text-vs-text-primary">
      {/* Layers — node tree, with the Inspect/Interact toggle in the header and
          the zoom controls at the bottom (keeps the canvas viewport clean). */}
      <LayersRegion
        tree={tree}
        selectedId={selection?.nodeId ?? null}
        hoveredId={hoveredId}
        onSelectNode={onSelectNode}
        onHoverNode={onHoverNode}
        mode={mode}
        onModeChange={onModeChange}
        zoom={zoom}
        onZoomBy={onZoomBy}
        onZoomReset={onZoomReset}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selection ? (
          <p className="px-3 py-6 text-center text-[11px] text-vs-text-muted">
            Select an element on the canvas to edit its properties.
          </p>
        ) : (
          <>
            <SelectionHeader selection={selection} />
            {selection.variants.length > 0 && (
              <VariantSection variants={selection.variants} onChange={onVariantChange} />
            )}
            {selection.sections.map((section) => (
              <PropertySection
                key={section.id}
                section={section}
                onFieldChange={onFieldChange}
                colorTokens={colorTokens}
              />
            ))}
          </>
        )}
      </div>

      {review ? (
        <ReviewBar onKeep={onKeep} onRevert={onRevert} />
      ) : pending.length > 0 ? (
        <ApplyBar pending={pending} applying={applying} onApply={onApply} onDiscard={onDiscard} />
      ) : null}
    </div>
  );
}

/** The gated-commit bar: the only path to disk (spec-first gate). */
function ApplyBar({
  pending,
  applying,
  onApply,
  onDiscard,
}: {
  pending: PendingEdit[];
  applying: boolean;
  onApply?: () => void;
  onDiscard?: () => void;
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
            <li key={p.key} className="flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
              <span className="truncate">
                {p.label} → <span className="font-mono">{p.value}</span>
              </span>
              {p.shared && (
                <span className="rounded bg-vs-warning/20 px-1 text-[9px] text-vs-warning">shared token</span>
              )}
              {p.kind !== "token" && (
                <span className="rounded bg-vs-accent-subtle px-1 text-[9px] text-vs-accent">source edit</span>
              )}
            </li>
          ))}
        </ul>
        {shared.length > 0 && (
          <p className="text-[10px] text-vs-warning">
            Editing a shared token changes every element bound to it.
          </p>
        )}
        {structural.length > 0 && (
          <p className="text-[10px] text-vs-text-muted">
            Source edits run through Claude Code and can be reverted.
          </p>
        )}
      </div>
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

/** The Layers region: header (title + Inspect/Interact) · node tree · zoom footer. */
function LayersRegion({
  tree,
  selectedId,
  hoveredId,
  onSelectNode,
  onHoverNode,
  mode,
  onModeChange,
  zoom,
  onZoomBy,
  onZoomReset,
}: {
  tree: BridgeTree | null;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelectNode: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
  mode: "inspect" | "interact";
  onModeChange?: (mode: "inspect" | "interact") => void;
  zoom: number;
  onZoomBy?: (factor: number) => void;
  onZoomReset?: () => void;
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
        <div className="ml-auto flex overflow-hidden rounded border border-vs-border-default text-[10px]">
          <ModeBtn active={mode === "inspect"} onClick={() => onModeChange?.("inspect")} label="Inspect" />
          <ModeBtn active={mode === "interact"} onClick={() => onModeChange?.("interact")} label="Interact" />
        </div>
      </div>
      {open && (
        <>
          <div className="max-h-64 overflow-y-auto">
            <NodeTree
              tree={tree}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={onSelectNode}
              onHover={onHoverNode}
            />
          </div>
          <div className="flex items-center gap-1 border-t border-vs-border-subtle px-3 py-1.5 text-[10px] text-vs-text-muted">
            <span className="mr-auto uppercase tracking-wide">Zoom</span>
            <ZoomBtn onClick={() => onZoomBy?.(1 / 1.2)} label="−" />
            <button
              type="button"
              onClick={() => onZoomReset?.()}
              title="Reset to 100%"
              className="min-w-[2.75rem] rounded px-1 py-0.5 text-center text-vs-text-secondary hover:bg-vs-bg-hover"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ZoomBtn onClick={() => onZoomBy?.(1.2)} label="+" />
          </div>
        </>
      )}
    </section>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 ${
        active ? "bg-vs-accent text-white" : "text-vs-text-secondary hover:bg-vs-bg-hover"
      }`}
    >
      {label}
    </button>
  );
}

function ZoomBtn({ onClick, label }: { onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded text-vs-text-secondary hover:bg-vs-bg-hover"
    >
      {label}
    </button>
  );
}

function SelectionHeader({ selection }: { selection: Selection }): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-vs-border-subtle px-3 py-2">
      <span className="truncate text-[13px] font-semibold">{selection.label}</span>
      {selection.component && (
        <span className="rounded border border-vs-border-default px-1 py-px text-[9px] uppercase tracking-wide text-vs-text-muted">
          component
        </span>
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
}: {
  section: DesignSection;
  onFieldChange?: (key: string, value: string) => void;
  colorTokens?: ColorToken[];
}): JSX.Element | null {
  if (section.fields.length === 0) return null;
  return (
    <Collapsible title={section.title} defaultOpen>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {section.fields.map((f) => (
          <Row key={f.key} label={f.label}>
            <Field field={f} colorTokens={colorTokens} onChange={(val) => onFieldChange?.(f.key, val)} />
          </Row>
        ))}
      </div>
    </Collapsible>
  );
});

function Field({
  field,
  colorTokens,
  onChange,
}: {
  field: SectionField;
  colorTokens: ColorToken[];
  onChange: (value: string) => void;
}): JSX.Element {
  const control =
    field.kind === "align" ? (
      <AlignGrid value={field.value} onChange={onChange} />
    ) : field.kind === "select" ? (
      <SelectField value={field.value} options={field.options} onChange={onChange} />
    ) : field.kind === "toggle" ? (
      <SelectField value={field.value} options={["true", "false"]} onChange={onChange} />
    ) : field.kind === "color" ? (
      <ColorTokenField value={field.value} token={field.token} colorTokens={colorTokens} onChange={onChange} />
    ) : (
      <TextField value={field.value} onChange={onChange} mono />
    );
  // The color field shows its own token label; other token-backed fields get a badge.
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {control}
      {field.token && field.kind !== "color" && <TokenBadge name={field.token} />}
    </div>
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
