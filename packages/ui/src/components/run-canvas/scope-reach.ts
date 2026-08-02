import type { InspectorToken, Selection } from "@vortspec/core/ipc";
import { tokenNameFromVar } from "./compose";
import { matchKey, type ScopeReach, type ScopeTarget } from "@vortspec/core/style-scope";

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

  const values: Record<string, string | undefined> = {};
  for (const section of selection.sections) {
    for (const field of section.fields) values[field.key] = field.value;
  }
  return [{ id: selection.nodeId, component: selection.component, tag: undefined, tokens, values }];
}

/**
 * How far each wide scope reaches.
 *
 * Token uses come from the design system's own count, which spans the project — that is the honest reach
 * of a token edit, and it is the same number the design-system surface shows. Match counts come from the
 * guest, which is the only place the live computed styles exist.
 */
export function scopeReach(
  tokens: readonly InspectorToken[],
  matched: Record<string, string[]> = {},
): ScopeReach {
  const tokenUses: Record<string, number> = {};
  for (const t of tokens) tokenUses[t.name] = t.uses;

  // "Looks like this" is counted from the guest's answer and from nothing else. The host's tree carries
  // component identity but no computed style, so any number derived here would count differently-styled
  // siblings as matches — precisely the elements the user said not to touch. Until the guest has answered,
  // the count is absent and the label says "Buttons like this" with no number, which is true.
  const matchCounts: Record<string, number> = {};
  for (const [key, ids] of Object.entries(matched)) matchCounts[key] = ids.length;
  return { matchCounts, tokenUses };
}
