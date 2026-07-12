/**
 * Ephemeral-edit bookkeeping for the Run-Canvas guest (hardening Phase 2).
 *
 * The guest previews style/class edits on the live DOM before anything is written
 * to disk. These are keyed by the **stable node id** (Phase 1 uid), not the element
 * object, so that when an HMR re-render replaces the element the edit re-applies to
 * whatever element the re-scan hands us in its place. This module is the pure
 * bookkeeping (no DOM types) so it is unit-testable in node; the guest performs the
 * actual `style.setProperty` / `classList` mutations from the plans it returns.
 */

export interface StyleOverride {
  /** prop → the value we applied; re-painted verbatim after each tree rebuild. */
  applied: Record<string, string>;
  /** prop → the element's inline value *before* our first touch ("" = it was unset). */
  original: Record<string, string>;
}

export interface ClassOverride {
  /** Classes we added for a variant preview. */
  add: string[];
  /** Classes we removed for a variant preview. */
  remove: string[];
}

/** A fresh, empty style override. */
export function emptyStyleOverride(): StyleOverride {
  return { applied: {}, original: {} };
}

/**
 * Fold `css` into `o`: record each prop as applied, and capture its prior inline
 * value the FIRST time we touch that prop (so a later re-edit of the same prop
 * doesn't clobber the true original). `priorInline(prop)` reads the element's
 * current inline value. Mutates and returns `o`.
 */
export function mergeStyle(
  o: StyleOverride,
  css: Record<string, string>,
  priorInline: (prop: string) => string,
): StyleOverride {
  for (const [prop, value] of Object.entries(css)) {
    if (!(prop in o.original)) o.original[prop] = priorInline(prop);
    o.applied[prop] = value;
  }
  return o;
}

/**
 * The restore plan for `o`: prop → the inline value to set back, or `null` to
 * remove the property entirely (it was unset before we touched it).
 */
export function restorePlan(o: StyleOverride): Record<string, string | null> {
  const plan: Record<string, string | null> = {};
  for (const [prop, orig] of Object.entries(o.original)) plan[prop] = orig ? orig : null;
  return plan;
}

/** A fresh, empty class override. */
export function emptyClassOverride(): ClassOverride {
  return { add: [], remove: [] };
}

/**
 * Fold a class add/remove op into `c`, keeping `add` and `remove` mutually
 * exclusive (adding a class cancels a prior removal of it, and vice versa). Empty
 * strings are ignored. Mutates and returns `c`.
 */
export function mergeClass(c: ClassOverride, remove: readonly string[], add: readonly string[]): ClassOverride {
  for (const name of remove) {
    if (!name) continue;
    if (!c.remove.includes(name)) c.remove.push(name);
    c.add = c.add.filter((x) => x !== name);
  }
  for (const name of add) {
    if (!name) continue;
    if (!c.add.includes(name)) c.add.push(name);
    c.remove = c.remove.filter((x) => x !== name);
  }
  return c;
}
