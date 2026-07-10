import type { Selection } from "@vortspec/core/ipc";

/**
 * Pending-edit model for the Run-Canvas gated commit (change: run-canvas-visual-editor).
 *
 * Visual edits are collected here and stay ephemeral (live guest overrides only)
 * until the user hits Apply. Apply routes each edit by kind: a `token` edit is a
 * deterministic token-file rewrite (`inspector:setTokenValue`); a `style`/`variant`
 * edit is a component-source change delegated to a gated Claude Code run with a
 * revertable snapshot — VortSpec never rewrites component source itself (D3/D9).
 */
export type EditKind = "token" | "style" | "variant";

export interface PendingEdit {
  /** Map key: the section field key, or `variant:<prop>`. */
  key: string;
  /** Human label for the apply summary (e.g. `Radius`, `Variant · size`). */
  label: string;
  kind: EditKind;
  /** The new value the user set. */
  value: string;
  /** Owning token name for a `token` edit; null otherwise. */
  token: string | null;
  /** Whether this token is used by more than one place (a shared change). */
  shared: boolean;
  /** CSS properties a `style` edit maps to (for the run prompt). */
  cssProps: string[];
  /** The exact live override this edit applies — lets a single edit be removed
   *  and the rest re-applied on top of the restored original. Style edits only. */
  css?: Record<string, string>;
  /** Class swap a `variant` edit applies live (to re-preview after a removal). */
  removeClasses?: string[];
  addClasses?: string[];
}

/** Classify a Design-panel field edit into a `PendingEdit`, given the live selection + token usage. */
export function classifyFieldEdit(
  selection: Selection,
  key: string,
  value: string,
  cssProps: string[],
  tokenUses: (name: string) => number,
  /** Force a per-element style edit even if the value is token-backed — used by
   *  canvas drags (padding/gap/margin/resize), which Figma treats as detaching to
   *  a literal rather than editing the shared token. */
  forceStyle = false,
  /** The exact override map, when it isn't a simple `prop → value` (e.g. align, flow). */
  css?: Record<string, string>,
  /** Live token match for the NEW value (length fields): a name re-binds, `null`
   *  detaches to a literal. `undefined` falls back to the field's static token. */
  tokenOverride?: string | null,
): PendingEdit {
  const field = selection.sections.flatMap((s) => s.fields).find((f) => f.key === key);
  const token = forceStyle
    ? null
    : tokenOverride !== undefined
      ? tokenOverride
      : (field?.token ?? null);
  return {
    key,
    label: field?.label ?? key,
    kind: token ? "token" : "style",
    value,
    token,
    shared: token ? tokenUses(token) > 1 : false,
    cssProps,
    css: css ?? (cssProps.length ? Object.fromEntries(cssProps.map((p) => [p, value])) : undefined),
  };
}

export function classifyVariantEdit(
  prop: string,
  value: string,
  removeClasses: string[] = [],
  addClasses: string[] = [],
): PendingEdit {
  return {
    key: `variant:${prop}`,
    label: `Variant · ${prop}`,
    kind: "variant",
    value,
    token: null,
    shared: false,
    cssProps: [],
    removeClasses,
    addClasses,
  };
}

/**
 * The provenance of a canvas edit — how precisely it maps back to source (Phase 6).
 * `variant`/`token`/`text` are deterministic (a known option, token, or literal);
 * `freeform-style` is an arbitrary geometry/style target the agent must realize.
 */
export type EditProvenance = "variant" | "token" | "freeform-style" | "text";

/** Classify a recorded edit's provenance from its kind + field. */
export function editProvenance(edit: PendingEdit): EditProvenance {
  if (edit.kind === "variant") return "variant";
  if (edit.kind === "token") return "token";
  if (edit.key === "content") return "text";
  return "freeform-style";
}

/**
 * A single edit as a provenance-scoped instruction: exact for deterministic edits
 * (variant / token / text) so the agent doesn't have to guess intent, and clearly
 * flagged as an approximate visual target for freeform geometry/style.
 */
export function describeEdit(edit: PendingEdit): string {
  switch (editProvenance(edit)) {
    case "variant": {
      const prop = edit.key.replace(/^variant:/, "");
      return `Set the \`${prop}\` variant to \`${edit.value}\` (exact — a known variant option).`;
    }
    case "token":
      return `Bind ${edit.label} to the design token \`--${edit.token}\` (exact — a known token).`;
    case "text":
      return `Set the element's visible text to \`${edit.value}\` (exact).`;
    case "freeform-style": {
      const props = edit.cssProps.length ? edit.cssProps.join(", ") : edit.label.toLowerCase();
      return `Approximate visual target — set ${props} to about \`${edit.value}\`; realize it in source however best fits the component.`;
    }
  }
}

/** A concise prompt for the gated Claude Code run that commits the structural edits. */
export function buildEditPrompt(
  componentFile: string | null,
  componentName: string | null,
  edits: PendingEdit[],
): string {
  const target = componentFile
    ? `the component source at \`${componentFile}\`${componentName ? ` (${componentName})` : ""}`
    : `the relevant component source`;
  const lines = edits.map((e) => `- ${describeEdit(e)}`);
  return [
    `Apply these visual edits made in the VortSpec Run Canvas to ${target}.`,
    `Make the minimal change so the rendered result matches; preserve existing design-token usage and do not touch unrelated code.`,
    ``,
    ...lines,
  ].join("\n");
}
