import type {
  BridgeNode,
  InspectorComponent,
  VariantControl,
} from "@vortspec/core/ipc";
import type { ComponentBinding } from "@vortspec/core/selection-builder";

/**
 * Run-Canvas composition helpers (change: run-canvas-visual-editor).
 *
 * Bridge glue between the guest readout and the host models: resolve a selected
 * node to a project component (for the Current-variant section) and translate a
 * Design-panel field edit into the CSS the guest applies as an ephemeral override.
 */

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
    // The instance's current value isn't derivable from the DOM alone; default to
    // the component's defaultVariants until we infer it from classes (later).
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

const CSS_FIELD_MAP: Record<string, string[]> = {
  gap: ["gap"],
  "padding-left": ["padding-left", "padding-right"],
  "padding-top": ["padding-top", "padding-bottom"],
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
