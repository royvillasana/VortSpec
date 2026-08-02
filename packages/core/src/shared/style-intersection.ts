/**
 * Editing several elements at once (change: scoped-style-edits, Phase 2).
 *
 * Two rules, and the second is the one that matters.
 *
 * READING: a property shows its value when every selected element agrees on it, and `Mixed` when they do
 * not. Showing one member's value for all of them would be a lie the user then acts on.
 *
 * WRITING: only the properties the user actually EDITED are written. A field left alone — especially one
 * reading `Mixed` — is never written, so every member keeps its own value for it. This is the difference
 * between a bulk edit and a bulk overwrite. Flattening a property nobody looked at is silent, wide, and
 * hard to notice, which is exactly why it is enforced here in a pure function rather than left to a
 * panel's render logic.
 */

/** The value a field shows for a multi-selection: an agreed value, or explicitly mixed. */
export type IntersectionValue = { kind: "same"; value: string } | { kind: "mixed" };

export const MIXED: IntersectionValue = { kind: "mixed" };

/** True when the field has one agreed value across the selection. */
export function isSame(v: IntersectionValue): v is { kind: "same"; value: string } {
  return v.kind === "same";
}

/**
 * What each property reads across the selection.
 *
 * A property missing from some members is `Mixed`, not "the value the others share" — absence is a real
 * difference, and treating it as agreement would let one member's value be written onto elements that
 * never had that property at all.
 */
export function intersect(members: readonly Record<string, string>[]): Record<string, IntersectionValue> {
  if (members.length === 0) return {};
  const keys = new Set<string>();
  for (const m of members) for (const k of Object.keys(m)) keys.add(k);

  const out: Record<string, IntersectionValue> = {};
  for (const key of keys) {
    const first = members[0][key];
    const agreed = first !== undefined && members.every((m) => m[key] === first);
    out[key] = agreed ? { kind: "same", value: first } : MIXED;
  }
  return out;
}

/**
 * The declarations to write, given what the user touched.
 *
 * `touched` is the set of property keys edited in THIS interaction — not the fields that happen to differ,
 * and not every field the panel rendered. A key the user typed into is written even if the value equals
 * what was already there (they asked for it); a key they never touched is omitted, whatever it reads.
 */
export function editedDecls(
  draft: Readonly<Record<string, string>>,
  touched: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of touched) {
    const value = draft[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** One member's outcome when a selection-scoped edit is fanned out. */
export interface FanOutResult<T> {
  target: T;
  ok: boolean;
  /** Why this member could not be written — surfaced to the user, never swallowed. */
  reason?: string;
}

/**
 * Apply a write to every member independently.
 *
 * Independent is the point: one element whose JSX is not statically resolvable must not stop the other
 * four from being written, and it must not be dropped in silence either. The caller gets every outcome so
 * it can name what did not happen.
 */
export async function fanOut<T>(
  targets: readonly T[],
  write: (target: T) => Promise<void>,
): Promise<FanOutResult<T>[]> {
  return Promise.all(
    targets.map(async (target) => {
      try {
        await write(target);
        return { target, ok: true };
      } catch (e) {
        return { target, ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

/** The members a fan-out could not write. Empty when everything landed. */
export function unwritten<T>(results: readonly FanOutResult<T>[]): T[] {
  return results.filter((r) => !r.ok).map((r) => r.target);
}
