import type { BridgeTree, InspectorToken, Selection } from "@vortspec/core/ipc";
import { tokenNameFromVar } from "./compose";
import { matchKey, type ScopeReach, type ScopeTarget } from "@vortspec/core/style-scope";
import { MIXED, type IntersectionValue } from "@vortspec/core/style-intersection";
import { cssForField } from "./compose";

/**
 * Turning the panel's view-model into the inputs the scope rules read (change: scoped-style-edits).
 *
 * Kept apart from the panel so the counting is testable without rendering, and so the rules stay a pure
 * function of facts rather than of React state. Everything here is derived from what is actually on the
 * page or actually in the design system — a count this module cannot compute is reported as absent, never
 * as a number, because an over-stated blast radius is worse than an unstated one.
 */

/** One member of the selection as the scope rules see it: identity, component, token and value per field. */
function scopeTargetFor(selection: Selection): ScopeTarget {
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
  return { id: selection.nodeId, component: selection.component, tag: undefined, tokens, values };
}

/**
 * The selection as the scope rules see it — EVERY member, not just the focused one.
 *
 * THIS TOOK A `Selection | null` AND RETURNED A LENGTH-1 ARRAY UNCONDITIONALLY (Thor, review of
 * #94). `DesignPanel` handed it the focused element and never the `selectedIds` it already receives
 * as a prop, so `deriveScope`'s `selection.length > 1` branch and `availableScopes`' `selection`
 * option were **structurally unreachable through the live UI** — in the change whose entire subject
 * is scope. Select three Cards where two are 8px and one is 16px and the panel evaluated scope
 * against the one focused Card, so it offered `element` where the honest answer is `selection`.
 *
 * WHY THE CALLER BUILDS THE MEMBER SELECTIONS AND THIS DOES NOT. A member's TOKEN per field is not
 * recoverable from its computed style — `getComputedStyle` reports the resolved value, not the
 * `var()` the author wrote. It comes from `buildSelection(readout, { tokens })`, which needs the
 * project's token list, the component roster and the tree. All three live in `RunApp`, which
 * already applies exactly that recipe to the focused member. So `RunApp` builds one `Selection` per
 * member and passes them here, rather than this module (or the panel) acquiring four more inputs to
 * redo it. The alternative — inferring the other members' tokens from resolved values — would make
 * "they share a token" a guess, and a wide scope justified by a guess edits things the user did not
 * agree to.
 *
 * A member whose readout has not arrived is simply absent from `selections`: not knowing is not the
 * same as knowing it differs, which is the rule `fieldIntersection` below already follows.
 */
export function scopeTargets(selections: Selection | null | readonly (Selection | null)[]): ScopeTarget[] {
  const list = Array.isArray(selections) ? selections : [selections as Selection | null];
  return list.filter((s): s is Selection => s !== null).map(scopeTargetFor);
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
  tree: BridgeTree | null = null,
): ScopeReach {
  const tokenUses: Record<string, number> = {};
  for (const t of tokens) tokenUses[t.name] = t.uses;

  // "Looks like this" is counted from the guest's answer and from nothing else. The host's tree carries
  // component identity but no computed style, so any number derived here would count differently-styled
  // siblings as matches — precisely the elements the user said not to touch. Until the guest has answered,
  // the count is absent and the label says "Buttons like this" with no number, which is true.
  const matchCounts: Record<string, number> = {};
  for (const [key, ids] of Object.entries(matched)) matchCounts[key] = ids.length;

  // Component instances ARE honestly countable from the tree — component identity is in it, unlike the
  // computed style `matching` needs. This is the reach of a component-scoped token change on this page;
  // the override itself reaches every page, which the tooltip says.
  const componentCounts: Record<string, number> = {};
  for (const node of Object.values(tree?.nodes ?? {})) {
    if (node.component) componentCounts[node.component] = (componentCounts[node.component] ?? 0) + 1;
  }
  return { matchCounts, componentCounts, tokenUses };
}


/**
 * What each panel FIELD reads across a multi-selection (change: scoped-style-edits, Phase 2).
 *
 * The panel's fields are built from the focused element, so this asks, per field, whether the other
 * members agree on the CSS properties that field controls. Disagreement on any of them makes the field
 * `Mixed` — a field that controls two properties cannot honestly show one value when the members differ
 * on the other.
 *
 * A member the guest has not reported on yet is skipped rather than treated as a difference: not knowing
 * is not the same as knowing they differ, and flashing `Mixed` while readouts arrive would be a lie that
 * corrects itself, which is worse than being briefly incomplete.
 */
export function fieldIntersection(
  selection: Selection | null,
  memberIds: readonly string[],
  readouts: Record<string, { computed: Record<string, string> }>,
): Record<string, IntersectionValue> {
  const out: Record<string, IntersectionValue> = {};
  if (!selection) return out;
  const others = memberIds.filter((id) => id !== selection.nodeId && readouts[id]);
  if (others.length === 0) return out;

  for (const section of selection.sections) {
    for (const field of section.fields) {
      const props = Object.keys(cssForField(field.key, field.value));
      // A composite field (`align`, `resize`, the padding box) maps to no single declaration set, so there
      // is nothing to compare. Left unmarked rather than guessed at: claiming Mixed for a field we cannot
      // evaluate would be as wrong as claiming agreement, and the narrow scopes still edit it correctly.
      if (props.length === 0) continue;
      const mine = readouts[selection.nodeId]?.computed;
      const agreed = others.every((id) =>
        props.every((prop) => {
          const theirs = readouts[id].computed[prop];
          const ours = mine?.[prop];
          // Compare against the focused element's OWN computed value when we have it, so the comparison is
          // like-for-like; fall back to the field's displayed value when we do not.
          return theirs !== undefined && theirs === (ours ?? field.value);
        }),
      );
      if (!agreed) out[field.key] = MIXED;
    }
  }
  return out;
}
