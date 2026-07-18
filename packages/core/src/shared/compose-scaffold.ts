/**
 * Composition preview scaffold markers (change: canvas-compose-and-preview-bar, §6).
 *
 * A composition run writes its options directly into the project's source so the
 * dev server hot-reloads them and each previews in the real slot. Those options
 * are a **transient preview scaffold**, never a finished artifact: they are wrapped
 * in marker comments so they can be identified and removed deterministically — on
 * accept (keep one, delete the rest), on discard/cancel/error (delete all), and by
 * the commit guard, which refuses to commit any file that still carries a marker.
 *
 * This module is the single source of truth for the marker format. The composition
 * prompt instructs the agent to emit exactly these markers; cleanup and the git
 * guard recognize exactly these markers. Keep them in lockstep here.
 *
 * The markers are JSX comment expressions (`{​/* … *​/}`) so they are inert in the
 * rendered output — invisible to layout — and valid inside the JSX where options
 * are inserted.
 */

/** The stable sentinel any scaffold marker contains — the string the commit guard greps. */
export const SCAFFOLD_SENTINEL = "VORTSPEC:COMPOSE";

/** A run id is opaque but must be marker-safe (used inside the marker + in the regex). */
export function isRunId(s: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(s);
}

/** The opening marker for one option block. */
export function scaffoldBegin(runId: string, option: number): string {
  return `{/* ${SCAFFOLD_SENTINEL}:BEGIN run=${runId} option=${option} */}`;
}

/** The closing marker for one option block. */
export function scaffoldEnd(runId: string, option: number): string {
  return `{/* ${SCAFFOLD_SENTINEL}:END run=${runId} option=${option} */}`;
}

/**
 * Wrap an option's source in its begin/end markers. `inner` is the option's JSX,
 * placed on its own lines so accept can recover it cleanly.
 */
export function wrapOption(runId: string, option: number, inner: string): string {
  return `${scaffoldBegin(runId, option)}\n${inner}\n${scaffoldEnd(runId, option)}`;
}

/** Whether a file still carries any composition scaffold (what the commit guard checks). */
export function hasScaffold(source: string): boolean {
  return source.includes(SCAFFOLD_SENTINEL);
}

/** Matches a whole option block (BEGIN … END) with the same run + option, capturing the inner content. */
function blockRegex(runId?: string): RegExp {
  const run = runId ? escapeRegExp(runId) : "[A-Za-z0-9_-]+";
  // \1 = run, \2 = option must match between BEGIN and END so blocks can't cross-nest.
  return new RegExp(
    `\\{\\s*/\\*\\s*${SCAFFOLD_SENTINEL}:BEGIN run=(${run}) option=(\\d+)\\s*\\*/\\s*\\}` +
      `([\\s\\S]*?)` +
      `\\{\\s*/\\*\\s*${SCAFFOLD_SENTINEL}:END run=\\1 option=\\2\\s*\\*/\\s*\\}`,
    "g",
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove composition scaffolding from a source string. Idempotent — running it on
 * a clean file returns it unchanged.
 *
 * - default: strip every option block (discard / cancel / error cleanup).
 * - `runId`: scope the strip to one run's blocks (leave any other run untouched).
 * - `keepOption`: accept — keep that option's INNER content (markers removed) and
 *   delete every other option block wholesale. Only meaningful with a `runId`.
 *
 * Leftover blank lines from a removed block are collapsed so accept/discard don't
 * leave a widening gap behind.
 */
export function stripScaffold(source: string, opts: { runId?: string; keepOption?: number } = {}): string {
  const { runId, keepOption } = opts;
  const out = source.replace(blockRegex(runId), (_match, _run: string, option: string, inner: string) =>
    keepOption !== undefined && Number(option) === keepOption ? inner.replace(/^\n|\n$/g, "") : "",
  );
  // Collapse the blank lines a removed block leaves behind (3+ newlines → 2).
  return out.replace(/\n{3,}/g, "\n\n");
}
