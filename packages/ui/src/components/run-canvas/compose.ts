import type {
  BridgeNode,
  InspectorComponent,
  VariantControl,
  Selection,
} from "@vortspec/core/ipc";
import type { ComponentBinding } from "@vortspec/core/selection-builder";

/** A readable text summary of a selection, to seed the assistant chat as context. */
export function buildSelectionContext(selection: Selection): string {
  const head = `Selected in the Run canvas: ${selection.label}${
    selection.component ? ` (component ${selection.component})` : ""
  }${selection.file ? ` — ${selection.file}` : ""}`;
  const variants = selection.variants.length
    ? `Variants — ${selection.variants.map((v) => `${v.key}: ${v.current ?? v.defaultValue ?? ""}`).join(", ")}`
    : "";
  const body = selection.sections
    .map((s) => {
      const fields = s.fields.map((f) => `${f.label}: ${f.value}${f.token ? ` [token ${f.token}]` : ""}`);
      return fields.length ? `${s.title} — ${fields.join(", ")}` : "";
    })
    .filter(Boolean);
  return [head, variants, ...body].filter(Boolean).join("\n");
}

/**
 * Run-Canvas composition helpers (change: run-canvas-visual-editor).
 *
 * Bridge glue between the guest readout and the host models: resolve a selected
 * node to a project component (for the Current-variant section) and translate a
 * Design-panel field edit into the CSS the guest applies as an ephemeral override.
 */

/**
 * When an element is NOT a component instance, detect whether it *resembles* one
 * by class signature — its classes fully contain one of a component's CVA variant
 * option class sets (a raw `<div>` styled exactly like your Button's `primary`).
 * That's the "should be using the component" case the Design panel surfaces.
 */
export function resembleComponent(
  className: string,
  components: InspectorComponent[],
): { name: string; file: string | null } | null {
  const have = new Set(className.split(/\s+/).filter(Boolean));
  if (have.size === 0) return null;
  let best: { name: string; file: string | null } | null = null;
  let bestScore = 0;
  for (const c of components) {
    let score = 0;
    for (const p of c.props) {
      for (const cls of Object.values(p.classes ?? {})) {
        const parts = String(cls).split(/\s+/).filter(Boolean);
        // A variant option counts only if its full (≥2-class) set is present — avoids
        // matching on a single generic utility like `text-white`.
        if (parts.length >= 2 && parts.every((x) => have.has(x))) score += parts.length;
      }
    }
    if (score >= 2 && score > bestScore) {
      best = { name: c.name, file: c.file };
      bestScore = score;
    }
  }
  return best;
}

/** Resolve a selected node to a project component via `data-component` / tag heuristics. */
export function resolveComponent(
  node: BridgeNode | undefined,
  components: InspectorComponent[],
): ComponentBinding | null {
  if (!node) return null;
  const wanted = (node.component ?? node.tag).toLowerCase();
  const match =
    components.find((c) => c.name.toLowerCase() === wanted) ??
    components.find((c) => c.name.toLowerCase() === capitalize(node.tag).toLowerCase());
  if (!match) return null;
  const variants: VariantControl[] = match.props.map((p) => ({
    ...p,
    // Seed `current` with the component's default; `buildSelection` then infers the
    // instance's real current value from its live classes (see `detectVariant` in
    // selection-builder), falling back to this default only when no class set matches.
    current: p.defaultValue,
  }));
  return { name: match.name, file: match.file, variants };
}

/**
 * Map a Design-panel field key + value to the CSS declarations the guest applies
 * for instant preview. Returns an empty object for fields with no direct CSS
 * preview (position X/Y, rotation) — those are informational in v1.
 */
export function cssForField(key: string, value: string): Record<string, string> {
  const props = CSS_FIELD_MAP[key];
  if (!props) return {};
  return Object.fromEntries(props.map((p) => [p, value]));
}

const normToken = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The token name bound in a `var(--name)` value (any field type), or null for a literal. */
export function tokenNameFromVar(value: string): string | null {
  const m = value.trim().match(/^var\(\s*--([\w-]+)\s*\)$/);
  return m ? m[1] : null;
}

/** The project tokens a field of `tokenType` may bind (spacing/radius/typography/color). */
export function tokensForField<T extends { type: string }>(tokens: T[], tokenType: string | undefined): T[] {
  return tokenType ? tokens.filter((t) => t.type === tokenType) : [];
}

/**
 * Find the design token of `type` whose resolved value equals `value` (the
 * Design-panel length field shows this token's name, and re-recognizes a token
 * when the px value is edited to one). Returns null when the value is a literal.
 */
export function matchTokenName(
  value: string,
  tokens: { name: string; resolvedValue: string; type: string }[],
  type: string,
): string | null {
  const target = normToken(value);
  return tokens.find((t) => t.type === type && normToken(t.resolvedValue) === target)?.name ?? null;
}

const CSS_FIELD_MAP: Record<string, string[]> = {
  gap: ["gap"],
  "padding-left": ["padding-left", "padding-right"],
  "padding-top": ["padding-top", "padding-bottom"],
  "margin-left": ["margin-left", "margin-right"],
  "margin-top": ["margin-top", "margin-bottom"],
  width: ["width"],
  height: ["height"],
  radius: ["border-radius"],
  opacity: ["opacity"],
  blend: ["mix-blend-mode"],
  fill: ["background-color"],
  "text-color": ["color"],
  "bg-color": ["background-color"],
  "border-color": ["border-color"],
  "stroke-width": ["border-width"],
  "stroke-color": ["border-color"],
  "stroke-style": ["border-style"],
  "font-family": ["font-family"],
  "font-size": ["font-size"],
  "font-weight": ["font-weight"],
  "line-height": ["line-height"],
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
