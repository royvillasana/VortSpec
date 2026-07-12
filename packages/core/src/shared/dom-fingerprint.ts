/**
 * Stable DOM node fingerprint (Run-Canvas hardening Phase 1).
 *
 * A serializable, deterministic identity for a rendered element that survives an
 * HMR re-render *replacing* the element object: a structural path (tag +
 * nth-of-type, anchored at the nearest ancestor with a stable id/`data-component`)
 * plus each segment's id / `data-component` / role / class signature. Two elements
 * at the same structural position with the same identity attributes produce the
 * same fingerprint — so a selected node re-acquires the same logical element after
 * the framework re-renders it.
 *
 * This module is PURE (no DOM types) so it is unit-testable in node: the guest
 * builds the segment path from live Elements and calls `fingerprint()`.
 */

export interface FpSeg {
  /** Lowercased tag name. */
  tag: string;
  /** `id` attribute, when present (a strong, near-unique anchor). */
  id?: string;
  /** `data-component`, when present (the app's own component marker). */
  component?: string;
  /** ARIA `role`, when present. */
  role?: string;
  /** A compact, order-stable class signature (framework hash classes dropped). */
  classSig?: string;
  /** 1-based position among same-tag siblings (structural stability). */
  nth: number;
}

/** One path segment → a compact token. Order of attributes is fixed for determinism. */
export function segToken(s: FpSeg): string {
  const parts = [s.tag];
  if (s.id) parts.push(`#${s.id}`);
  if (s.component) parts.push(`@${s.component}`);
  if (s.role) parts.push(`[${s.role}]`);
  if (s.classSig) parts.push(`.${s.classSig}`);
  parts.push(`:${s.nth}`);
  return parts.join("");
}

/**
 * A deterministic fingerprint for the segment path (nearest stable ancestor →
 * element). Identical structure + identity attributes ⇒ identical string.
 */
export function fingerprint(path: FpSeg[]): string {
  return path.map(segToken).join(">");
}

/** Normalize a class list into a stable signature: framework hash classes dropped, sorted, capped. */
export function classSignature(classes: readonly string[]): string {
  return classes
    .filter((c) => c.length <= 24 && !/^[a-z]+-[a-z0-9]{6,}$/i.test(c))
    .slice()
    .sort()
    .slice(0, 4)
    .join(".");
}
