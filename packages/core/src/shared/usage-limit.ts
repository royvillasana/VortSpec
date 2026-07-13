import { z } from "zod";

/**
 * Detect when a Claude Code run STOPPED because the user hit their usage limit
 * (the Pro/Max rolling session limit, the weekly limit, or the Opus limit) — as
 * opposed to a normal error — so the app can pause the run, show when it resets,
 * and offer to resume then.
 *
 * The CLI does NOT expose a discrete machine-readable "usage limit" result, so
 * detection is defensive and matches on the human message the CLI surfaces, in
 * both its current and legacy forms:
 *   - current:  "You've hit your session limit · resets 3:45pm"
 *               "You've hit your weekly limit · resets Mon 12:00am"
 *               "You've hit your Opus limit · resets 3:45pm"
 *   - legacy:   "Claude AI usage limit reached|1751900000"   (pipe + unix reset)
 *
 * The reset is a LOCAL-time label (or, legacy, a unix timestamp). We keep the
 * label as-is and let the UI compute a best-effort countdown from it, degrading
 * to "resume when your limit resets" when it can't be parsed to an exact moment.
 */
export const usageLimitScopeSchema = z.enum(["session", "weekly", "opus", "unknown"]);
export type UsageLimitScope = z.infer<typeof usageLimitScopeSchema>;

export interface UsageLimitInfo {
  scope: UsageLimitScope;
  /** The human reset label exactly as the CLI printed it (e.g. "3:45pm"), if any. */
  resetLabel?: string;
  /** Reset time as epoch ms — only when given explicitly (the legacy pipe form). */
  resetsAt?: number;
  /** The raw matched text, for display/debug fallback. */
  raw: string;
}

/** Pull a "resets <label>" out of a limit message (stops at a paren/·/newline/end). */
function resetLabelFrom(text: string): string | undefined {
  const m = text.match(/resets?\s+([^\n().·|]+)/i);
  const label = m?.[1]?.trim();
  return label ? label : undefined;
}

/**
 * Return usage-limit info if `text` is a usage-limit stop, else null. Pure and
 * defensive — matches the message string, not a (nonexistent) structured field.
 */
export function detectUsageLimit(text: string | undefined | null): UsageLimitInfo | null {
  if (!text) return null;

  // Legacy form: "Claude AI usage limit reached|<unix>" — the number is the reset.
  const legacy = text.match(/claude ai usage limit reached\s*\|\s*(\d{9,13})/i);
  if (legacy) {
    const n = Number(legacy[1]);
    return { scope: "unknown", resetsAt: n < 1e12 ? n * 1000 : n, raw: legacy[0].trim() };
  }

  // Current form: "You've hit your <scope> limit …".
  const scoped = text.match(/you['’]?ve hit your\s+(session|weekly|opus)\b[^\n]*/i);
  if (scoped) {
    return {
      scope: scoped[1].toLowerCase() as UsageLimitScope,
      resetLabel: resetLabelFrom(scoped[0]),
      raw: scoped[0].trim(),
    };
  }

  // Generic fallbacks (unknown scope) — a limit without the "hit your <scope>" shape.
  const generic = text.match(/(you['’]?ve hit your[^\n]*limit[^\n]*|usage limit reached[^\n]*)/i);
  if (generic) {
    return { scope: "unknown", resetLabel: resetLabelFrom(generic[0]), raw: generic[0].trim() };
  }

  return null;
}
