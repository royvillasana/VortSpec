import type { BridgeTree, InspectorToken, Selection } from "@vortspec/core/ipc";
import { tokenNameFromVar } from "./compose";
import type { ScopeReach, ScopeTarget } from "@vortspec/core/style-scope";

/**
 * Turning the panel's view-model into the inputs the scope rules read (change: scoped-style-edits).
 *
 * Kept apart from the panel so the counting is testable without rendering, and so the rules stay a pure
 * function of facts rather than of React state. Everything here is derived from what is actually on the
 * page or actually in the design system — a count this module cannot compute is reported as absent, never
 * as a number, because an over-stated blast radius is worse than an unstated one.
 */

/** The selection as the scope rules see it: identity, component, and the token behind each field. */
export function scopeTargets(selection: Selection | null): ScopeTarget[] {
  if (!selection) return [];
  const tokens: Record<string, string | undefined> = {};
  for (const section of selection.sections) {
    for (const field of section.fields) {
      // `token` is the panel's resolved binding; fall back to reading a literal `var(--x)` value, which is
      // how a field that was just re-pointed reads before the next readout lands.
      tokens[field.key] = field.token ?? tokenNameFromVar(field.value) ?? undefined;
    }
  }
  return [{ id: selection.nodeId, component: selection.component, tag: undefined, tokens }];
}

/**
 * How far each wide scope reaches.
 *
 * Component instances are counted from the LIVE tree, so the number matches what the user can see on the
 * page right now. Token uses come from the design system's own count, which spans the project — that is
 * the honest reach of a token edit, and it is the same number the design-system surface shows.
 */
export function scopeReach(tree: BridgeTree | null, tokens: readonly InspectorToken[]): ScopeReach {
  const componentCounts: Record<string, number> = {};
  for (const node of Object.values(tree?.nodes ?? {})) {
    if (node.component) componentCounts[node.component] = (componentCounts[node.component] ?? 0) + 1;
  }
  const tokenUses: Record<string, number> = {};
  for (const t of tokens) tokenUses[t.name] = t.uses;
  return { componentCounts, tokenUses };
}
