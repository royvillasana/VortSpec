/**
 * The SCOPE of a style edit (change: scoped-style-edits).
 *
 * A style edit is a value and a blast radius. These functions answer the two questions the edit control
 * has to answer before the user types anything: which scopes are even available for this selection and
 * this property, and which of them should be preselected.
 *
 * Both are pure functions of what the selection literally exposes — no history, no last-used memory, no
 * frequency weighting. A default the user cannot predict is worse than one they have to change, and a
 * derivation that reads only the selection can be exhaustively tested rather than sampled.
 *
 * Nothing here writes. Routing a committed edit to a destination is the caller's job; this module only
 * decides what the caller is allowed to offer and what it should offer first.
 */

/**
 * Where an edit lands.
 *
 * `element`, `selection` and `matching` write the page's own source, once per element. `token` writes the
 * durable personalization overlay once, reaching every page — it is not a "bigger version" of an element
 * edit but a different destination entirely.
 *
 * `matching` is "every element that looks the same": the same `data-component` AND the same current value
 * for the property being edited. Deliberately not "every instance of this component" — an element already
 * styled differently was styled differently on purpose, and sweeping it into a change aimed at the ones
 * that look alike destroys a decision the user made earlier and did not revisit.
 *
 * `component-token` exists because a token is SHARED. `--radius-element` may be read by Button and Card
 * alike, so "change every Button" cannot be done by writing the token — that would change Cards too. It is
 * written instead as a redefinition of the same token scoped to the component,
 * `[data-component="Button"] { --radius-element: 4px }`, which spares the siblings and keeps the value a
 * token rather than a literal, so it still follows a later theme or preset. It also needs no edit to the
 * component's source, which is the only reason it is available at all on a consumed library.
 *
 * `matching` and `component-token` are both offered because they are different questions: the ones that
 * look alike TODAY, on this page, versus every instance BY IDENTITY, on every page.
 */
export type StyleScope = "element" | "selection" | "matching" | "component-token" | "token";

/** One element as far as scoping is concerned. Deliberately minimal — this is all the rules read. */
export interface ScopeTarget {
  /** Stable canvas identity, used only to count and to distinguish members. */
  id: string;
  /** The `data-component` name when the element is a design-system instance, else null. */
  component?: string | null;
  /** Tag name, lowercased. Used by select-all-matching, not by the default rule. */
  tag?: string;
  /**
   * The token each style property resolves THROUGH, keyed by property, without the leading `--`.
   * Absent or undefined means the property is not governed by the design system on this element.
   */
  tokens?: Record<string, string | undefined>;
  /** The element's CURRENT value per property — what "looks the same" is judged on. */
  values?: Record<string, string | undefined>;
}

/**
 * Reach counts the page can supply. A missing entry means "not countable here" — which is reported as
 * such rather than guessed, because a wrong count on a wide scope is worse than no count.
 */
export interface ScopeReach {
  /**
   * How many elements on the page share a (component, value) pair, keyed by `matchKey`. Counting by the
   * PAIR rather than by component is what makes the label honest: "10 Buttons like this" is a different
   * number from "13 Buttons", and the difference is the three nobody wants touched.
   */
  matchCounts?: Record<string, number | undefined>;
  /** Instances per `data-component` on the current page — honestly countable from the tree. */
  componentCounts?: Record<string, number | undefined>;
  /** Uses per token name (without `--`), as the design system already counts them. */
  tokenUses?: Record<string, number | undefined>;
}

/** One offered scope: what it is, what it keys on, and how far it reaches (null when uncountable). */
export interface ScopeOption {
  scope: StyleScope;
  /** The `data-component` for `matching` scope, the token name for `token` scope, else undefined. */
  key?: string;
  /** For `matching`: the current value the matched elements share. */
  value?: string;
  /** For `component-token`: the token being redefined inside the component named by `key`. */
  token?: string;
  /** Elements this would affect, or null when the reach cannot be computed. */
  reach: number | null;
}

/** The token every member resolves `property` through, or null when they do not agree on one. */
export function sharedToken(selection: readonly ScopeTarget[], property: string): string | null {
  if (selection.length === 0) return null;
  const first = selection[0].tokens?.[property];
  if (!first) return null;
  return selection.every((t) => t.tokens?.[property] === first) ? first : null;
}

/** The `data-component` every member shares, or null when they do not share one. */
export function sharedComponent(selection: readonly ScopeTarget[]): string | null {
  if (selection.length === 0) return null;
  const first = selection[0].component;
  if (!first) return null;
  return selection.every((t) => t.component === first) ? first : null;
}

/** What {@link deriveScope} decided, and what it keyed on. */
export interface DerivedScope {
  scope: StyleScope;
  /** The token (`token` scope) or component (`matching` scope) it keyed on. */
  key?: string;
  /** For `matching`: the shared current value that defines "looks the same". */
  value?: string;
  /** For `component-token`: the token being redefined inside the component named by `key`. */
  token?: string;
}

/** The key a (component, value) pair is counted under. One place, so counting and lookup cannot drift. */
export function matchKey(component: string, value: string): string {
  return `${component}\u0000${value}`;
}

/** The value every member currently has for `property`, or null when they do not agree. */
export function sharedValue(selection: readonly ScopeTarget[], property: string): string | null {
  if (selection.length === 0) return null;
  const first = selection[0].values?.[property];
  if (first === undefined) return null;
  return selection.every((t) => t.values?.[property] === first) ? first : null;
}

/**
 * The scope to preselect:
 *
 *   1. more than one member  → `selection`
 *   2. else                  → `element`
 *
 * It used to point at the widest scope the selection supported — the token, or a token scoped to the
 * component, or every element that looked alike — on the principle that when a design system governs a
 * property, editing the instance fights it.
 *
 * That principle is still true, and it was still the wrong default. It made a single click change every
 * instance of a component, and through a token every page in the project, from a control the user had not
 * looked at. Reported as: "I'm applying the change only on that component, just like the button asked me
 * to do" — and it changed all of them.
 *
 * The costs are not symmetric, which is what settles it. A narrow edit that should have been wide is one
 * more action. A wide edit that should have been narrow rewrites work the user cannot see, on pages they
 * are not looking at, and they find out later or never. So the derivation now returns the smallest thing
 * the user can have meant, and reaching further is a decision they make with the result already in front
 * of them.
 *
 * Every wider scope is still OFFERED — see `availableScopes`, which is unchanged. This function only
 * decides what is selected before the user says anything.
 *
 * A multi-element selection still defaults to `selection`: those elements were chosen deliberately, and
 * respecting that is the same principle, not an exception to it.
 *
 * An empty selection yields `element`, which offers nothing to write.
 */
export function deriveScope(selection: readonly ScopeTarget[], _property: string): DerivedScope {
  if (selection.length > 1) return { scope: "selection" };
  return { scope: "element" };
}

/**
 * Every scope that can be offered, narrowest first.
 *
 * A scope is omitted when it has nothing to key on rather than shown-and-disabled: `matching` needs both a
 * shared `data-component` and a shared current value, `token` needs a shared token for this property, and
 * `selection` needs more than one member. Offering a scope that cannot act invites the user to pick it and
 * be refused.
 */
export function availableScopes(
  selection: readonly ScopeTarget[],
  property: string,
  reach: ScopeReach = {},
): ScopeOption[] {
  if (selection.length === 0) return [];
  const options: ScopeOption[] = [{ scope: "element", reach: 1 }];
  if (selection.length > 1) options.push({ scope: "selection", reach: selection.length });

  const component = sharedComponent(selection);
  const value = sharedValue(selection, property);
  if (component && value !== null) {
    options.push({
      scope: "matching",
      key: component,
      value,
      reach: reach.matchCounts?.[matchKey(component, value)] ?? null,
    });
  }
  const token = sharedToken(selection, property);
  // Offered only when there is BOTH a component to scope to and a token to scope — without either there
  // is nothing to redefine, or nowhere to confine it.
  if (component && token) {
    options.push({
      scope: "component-token",
      key: component,
      token,
      reach: reach.componentCounts?.[component] ?? null,
    });
  }
  if (token) {
    options.push({ scope: "token", key: token, reach: reach.tokenUses?.[token] ?? null });
  }
  return options;
}

/**
 * Whether a committed edit at this scope writes the durable overlay rather than the page's own source.
 *
 * The distinction drives more than the destination: an overlay write targets a token IDENTITY, so it is
 * not gated by whether any particular element's JSX is statically resolvable.
 */
export function writesOverlay(scope: StyleScope): boolean {
  return scope === "token" || scope === "component-token";
}

/**
 * Whether an edit at `scope` should offer to change the shared token instead.
 *
 * Only when the edit would hardcode a value onto elements whose value that token already decides — so
 * the offer is never speculative, and never appears when there is nothing to promote to.
 */
export function promotionTarget(
  scope: StyleScope,
  selection: readonly ScopeTarget[],
  property: string,
): string | null {
  if (writesOverlay(scope)) return null;
  return sharedToken(selection, property);
}
