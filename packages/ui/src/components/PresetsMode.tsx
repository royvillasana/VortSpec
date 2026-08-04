import { useCallback, useEffect, useState } from "react";
import type { Preset, PresetPlan, RoleOutcome } from "@vortspec/core/presets";
import { Spinner } from "@vortspec/ui/ui";
import { api } from "../lib/api";

/**
 * Library's **Presets** mode (change: design-system-style-panel, Phase 4).
 *
 * **Default is first and is not a preset.** It is the design system the project already has from its
 * source — the consumed library's values, or the Figma file's. Selecting it puts those back by dropping
 * what a preset contributed, leaving the user's own edits alone.
 *
 * Applying anything is PREVIEWED first: one click rewrites many tokens, and finding out afterwards which
 * ones moved is not good enough. The preview also names what will be skipped, because a preset a project
 * cannot fully express should say so rather than land quietly half-applied.
 */
export function PresetsMode({
  projectPath,
  onApplied,
  onPreview,
}: {
  projectPath: string;
  onApplied: () => void;
  /**
   * The design system as it WOULD look with the highlighted preset applied (null = nothing pending), so
   * the Live Preview above can show it. Judging a preset by how it looks beats reading its hex values.
   */
  onPreview: (preview: Record<string, unknown> | null) => void;
}): React.JSX.Element {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ preset: Preset; plan: PresetPlan } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const list = await api.listPresets(projectPath).catch(() => null);
    setPresets(list?.presets ?? []);
    setActiveId(list?.activeId ?? null);
    setLoading(false);
  }, [projectPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function preview(preset: Preset): Promise<void> {
    setBusy(true);
    const p = await api.previewPreset(projectPath, preset.id).catch(() => null);
    setBusy(false);
    if (p) {
      setPlan({ preset, plan: p });
      onPreview((p.preview as Record<string, unknown> | undefined) ?? null);
    }
  }

  function cancel(): void {
    setPlan(null);
    onPreview(null);
  }

  // Leaving Presets must not strand the preview showing a preset the user never applied.
  useEffect(() => () => onPreview(null), [onPreview]);

  async function confirm(): Promise<void> {
    if (!plan) return;
    setBusy(true);
    const applied = await api.applyPreset(projectPath, plan.preset.id).catch(() => null);
    setPlan(null);
    onPreview(null);
    setBusy(false);
    if (applied) setResult(summarize(applied.outcomes));
    await load();
    onApplied();
  }

  async function backToDefault(): Promise<void> {
    setBusy(true);
    await api.selectDefaultPreset(projectPath).catch(() => undefined);
    setBusy(false);
    setResult("Back to your design system’s own values. Your own edits were kept.");
    await load();
    onApplied();
  }

  async function saveCurrent(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    await api.createPresetFromCurrent(projectPath, name.trim()).catch(() => undefined);
    setBusy(false);
    setNaming(false);
    setName("");
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Default leads the list and can never be removed — it is what the project already has. */}
      <PresetRow
        title="Default"
        summary="Your design system, as your library defines it"
        active={activeId === null}
        disabled={busy}
        onClick={() => void backToDefault()}
      />

      {presets.map((p) => (
        <PresetRow
          key={p.id}
          title={p.name}
          summary={p.summary}
          active={activeId === p.id}
          disabled={busy}
          onClick={() => void preview(p)}
        />
      ))}

      {plan && <PlanPreview plan={plan} busy={busy} onCancel={cancel} onConfirm={() => void confirm()} />}

      {result && (
        <p className="rounded border border-vs-border-default bg-vs-bg-elevated px-2 py-1.5 text-[10px] leading-relaxed text-vs-text-secondary">
          {result}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-vs-border-subtle pt-2">
        {naming ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveCurrent()}
              placeholder="Preset name"
              aria-label="New preset name"
              className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-elevated px-1.5 py-1 text-[11px] text-vs-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-vs-accent"
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void saveCurrent()}
              className="rounded border border-vs-accent px-2 py-1 text-[10px] text-vs-text-primary disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setNaming(true)}
            className="w-fit rounded border border-vs-border-default px-2 py-1 text-[10px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:opacity-50"
          >
            + Create preset from current values
          </button>
        )}
      </div>
    </div>
  );
}

function PresetRow({
  title,
  summary,
  active,
  disabled,
  onClick,
}: {
  title: string;
  summary: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
        active ? "border-vs-accent bg-vs-bg-elevated" : "border-vs-border-default hover:border-vs-accent"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-vs-text-primary">{title}</span>
        {active && (
          <span className="rounded bg-vs-accent px-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            active
          </span>
        )}
      </span>
      <span className="text-[10px] text-vs-text-muted">{summary}</span>
    </button>
  );
}

/**
 * The confirm step. The visual is the Live Preview above — which is already showing this preset — so this
 * is deliberately NOT a list of hex values. It states the SCOPE (how many change, how many are added, what
 * cannot be expressed here) because that is the part a picture cannot tell you.
 */
function PlanPreview({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: { preset: Preset; plan: PresetPlan };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const changes = plan.plan.outcomes.filter((o) => o.outcome === "change").length;
  const introduced = plan.plan.outcomes.filter((o) => o.outcome === "introduce").length;
  const skipped = plan.plan.outcomes.filter((o) => o.outcome === "skip");

  return (
    <div className="flex flex-col gap-2 rounded-md border border-vs-accent bg-vs-bg-elevated p-2.5">
      <span className="text-[11px] font-medium text-vs-text-primary">
        Previewing {plan.preset.name} — apply it?
      </span>
      <p className="text-[10px] leading-relaxed text-vs-text-secondary">
        The preview above is showing this preset. Applying changes {changes} value{changes === 1 ? "" : "s"}
        {introduced > 0 ? ` and adds ${introduced} to your design system` : ""}.
      </p>
      {skipped.length > 0 && (
        <p className="text-[10px] leading-relaxed text-vs-text-muted">
          {skipped.length} part{skipped.length === 1 ? "" : "s"} of this preset can’t be expressed here —
          your design system has no token for {skipped.map((o) => o.role.replace(/^[a-z]+\./, "")).join(", ")}.
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-vs-text-muted">
        Values you changed since the last apply will be overwritten.
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded border border-vs-accent px-2 py-1 text-[10px] font-medium text-vs-text-primary disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded border border-vs-border-default px-2 py-1 text-[10px] text-vs-text-secondary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A plain sentence for what just happened — including what did NOT apply. */
function summarize(outcomes: RoleOutcome[]): string {
  const changed = outcomes.filter((o) => o.outcome === "change").length;
  const introduced = outcomes.filter((o) => o.outcome === "introduce").length;
  const skipped = outcomes.filter((o) => o.outcome === "skip").length;
  const parts = [`${changed} value${changed === 1 ? "" : "s"} updated`];
  if (introduced) parts.push(`${introduced} added`);
  if (skipped) parts.push(`${skipped} skipped (no matching token in your design system)`);
  return `${parts.join(", ")}.`;
}
