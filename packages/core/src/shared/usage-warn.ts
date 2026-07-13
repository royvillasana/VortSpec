import type { UsageResult } from "./usage";

/**
 * Proactive usage-limit warnings: as the Claude SESSION usage climbs toward the
 * limit, warn the user once at 75%, then again at each +10% step (85%, 95%) up
 * to the 100% pause. Pure threshold logic, kept here so it's unit-testable and
 * shared between the reader and the renderer hook.
 */
export const WARN_THRESHOLDS = [75, 85, 95] as const;

/** The session limit's current usage (0–100) + reset label, or null if absent. */
export function sessionUsage(usage: UsageResult): { percent: number; resetsAt: string | null } | null {
  // The session bar is labelled e.g. "Current session"; the weekly/per-model bars
  // carry "week"/model names, so match session but exclude "week".
  const s = usage.limits.find((l) => /session/i.test(l.label) && !/week/i.test(l.label));
  return s ? { percent: s.percent, resetsAt: s.resetsAt } : null;
}

/**
 * The highest warning threshold the usage has crossed but which hasn't been
 * warned yet (strictly greater than `lastWarned`), or null if none is due. So a
 * jump from 60% straight to 96% surfaces the 95% warning (the most urgent), and
 * a later reading at the same level surfaces nothing.
 */
export function nextWarningThreshold(percent: number, lastWarned: number): number | null {
  const crossed = WARN_THRESHOLDS.filter((t) => percent >= t && t > lastWarned);
  return crossed.length ? Math.max(...crossed) : null;
}

/**
 * When a fresh session has clearly reset (usage fell back below the first
 * threshold), the warning tracker should re-arm from zero. Returns the
 * `lastWarned` to carry forward given the latest reading.
 */
export function rearmedLastWarned(percent: number, lastWarned: number): number {
  return percent < WARN_THRESHOLDS[0] ? 0 : lastWarned;
}
