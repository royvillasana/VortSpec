import type { JSX } from "react";
import type { ScopeOption, StyleScope } from "@vortspec/core/style-scope";

/**
 * The blast radius of the edit you are about to make (change: scoped-style-edits).
 *
 * Shown under the field being edited, BEFORE a value is committed, because the whole risk of a wide edit
 * is not noticing it was wide. Every option states its reach; an option whose reach cannot be computed
 * says so rather than showing a number that might be wrong — an over-stated count on a scope that touches
 * every page is worse than no count at all.
 *
 * Rendered only when there is a real choice: with one option there is nothing to decide and the row would
 * be chrome. It is deliberately not a dropdown — a scope hidden behind a click is a scope the user does
 * not read.
 */
export function ScopeSelector({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly ScopeOption[];
  value: StyleScope;
  onChange: (scope: StyleScope, key?: string) => void;
  disabled?: boolean;
}): JSX.Element | null {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 pt-1" role="group" aria-label="Apply to">
      <span className="text-[9.5px] uppercase tracking-[0.06em] text-vs-text-muted">Apply to</span>
      {options.map((o) => {
        const active = o.scope === value;
        return (
          <button
            key={`${o.scope}:${o.key ?? ""}`}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={scopeLabel(o)}
            title={scopeTitle(o)}
            onClick={() => onChange(o.scope, o.key)}
            className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
              active
                ? "border-vs-accent bg-vs-accent-muted text-vs-text-primary"
                : "border-vs-border-default text-vs-text-muted hover:border-vs-border-strong hover:text-vs-text-secondary"
            }`}
          >
            {scopeLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What an option says on its face. The reach is part of the label, not a tooltip — a count you have to
 * hover for is a count that is not informing the decision.
 *
 * A `null` reach renders without a number. That case is real: a component the live tree has not reported
 * on yet has no honest instance count, and inventing one would misstate the edit.
 */
export function scopeLabel(o: ScopeOption): string {
  switch (o.scope) {
    case "element":
      return "This element";
    case "selection":
      return `${o.reach ?? 0} selected`;
    case "matching":
      return o.reach === null ? `${o.key}s like this` : `${o.reach} ${o.key}s like this`;
    case "token":
      return o.reach === null ? `--${o.key}` : `--${o.key} · ${o.reach} uses`;
  }
}

/** The consequence spelled out, for the one place a tooltip earns its keep: what else this touches. */
function scopeTitle(o: ScopeOption): string {
  switch (o.scope) {
    case "element":
      return "Change only this element, in this page's source";
    case "selection":
      return "Change every selected element, in this page's source";
    case "matching":
      return `Change every ${o.key} that currently looks like this one (${o.value}). A ${o.key} styled differently is left alone.`;
    case "token":
      return `Change --${o.key} itself — everything that uses this token changes, on every page`;
  }
}
