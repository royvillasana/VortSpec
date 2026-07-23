import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { RunLimit } from "@vortspec/core/ipc";

/**
 * The agnostic "run paused — Claude usage limit" notice. Rendered wherever
 * VortSpec drives a Claude run (guided flow, assistant dock, run panel) when a
 * run stops on the user's usage limit. Shows what happened, when it resets (with
 * a live countdown), and a Resume action that re-runs the same session once the
 * limit clears — with an opt-in "resume automatically at reset".
 *
 * VortSpec proxies no model traffic and stores no keys: this is the user's own
 * Claude plan limit, so the copy says so and the reset time is whatever Claude
 * reported. When we can't parse an exact reset moment we degrade to the label.
 */
export function RunLimitNotice({
  limit,
  onResume,
  resumeLabel = "Resume",
  busy = false,
  autoResume = false,
  onAutoResumeChange,
}: {
  limit: RunLimit;
  onResume: () => void;
  /** Verb for the button, e.g. "Resume the build". */
  resumeLabel?: string;
  /** A resume run is starting (disables the button + shows a spinner label). */
  busy?: boolean;
  /** Whether auto-resume-at-reset is armed. */
  autoResume?: boolean;
  onAutoResumeChange?: (on: boolean) => void;
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // FREEZE the reset moment when the notice first mounts (≈ when the run paused). The label
  // is a bare time-of-day; re-parsing it against the TICKING `now` rolls a JUST-passed reset
  // forward to tomorrow — e.g. "1:30am" re-parsed at 1:31am became tomorrow's 1:30am, a
  // phantom ~24h countdown that never hits zero, so auto-resume never fired. Parse ONCE
  // against the mount time so the countdown ends when the reset actually passes.
  const anchor = useRef(Date.now());
  const resetAt = useMemo(
    () => limit.resetsAt ?? parseResetEpoch(limit.resetLabel, anchor.current),
    [limit.resetsAt, limit.resetLabel],
  );
  const remaining = resetAt != null ? resetAt - now : null;
  const cleared = remaining != null && remaining <= 0;

  // Auto-resume: fire once, the moment the countdown reaches zero.
  const fired = useRef(false);
  useEffect(() => {
    if (autoResume && cleared && !busy && !fired.current) {
      fired.current = true;
      onResume();
    }
    if (!cleared) fired.current = false;
  }, [autoResume, cleared, busy, onResume]);

  const scopeName =
    limit.scope === "weekly" ? "weekly" : limit.scope === "opus" ? "Opus" : limit.scope === "session" ? "session" : "";
  const resetText =
    remaining != null && remaining > 0
      ? `Resets in ${formatDuration(remaining)}${limit.resetLabel ? ` (${limit.resetLabel})` : ""}`
      : cleared
        ? "Your limit has reset — you can resume now."
        : limit.resetLabel
          ? `Resets ${limit.resetLabel}`
          : "It resets on your usual Claude schedule.";

  const canResume = !busy && (resetAt == null || cleared);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2.5 text-[12px] text-vs-text-primary">
      <div className="flex items-start gap-2">
        <span className="text-sm leading-none text-vs-warning">⏳</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">
            Paused — you’ve hit your {scopeName ? `${scopeName} ` : ""}Claude usage limit.
          </span>
          <span className="text-vs-text-secondary">{resetText}</span>
          <span className="text-[10px] text-vs-text-muted">
            This is your own Claude plan’s limit — VortSpec adds no usage and stores no keys. Your work so far is saved;
            resuming continues the same task.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onResume}
          disabled={!canResume}
          className="rounded-md bg-vs-accent px-3 py-1.5 text-[11px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Resuming…"
            : cleared || resetAt == null
              ? resumeLabel
              : `${resumeLabel} in ${formatDuration(remaining ?? 0)}`}
        </button>
        {onAutoResumeChange && resetAt != null && !cleared && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-vs-text-secondary">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => onAutoResumeChange(e.target.checked)}
              className="accent-vs-accent"
            />
            Resume automatically when it resets
          </label>
        )}
      </div>
    </div>
  );
}

/** "2h 14m" / "3m 20s" / "12s" from a millisecond duration. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Best-effort parse of a reset LABEL into an absolute epoch (ms), for the
 * countdown. Handles a bare time-of-day ("3:45pm", "12:00am", "2am") in the
 * user's local time → the next occurrence of that time. Returns null for
 * weekday/date forms (e.g. "Mon 12:00am", "Jul 7 at 6:30pm") — the caller then
 * shows the label without a countdown. `now` is passed in for testability.
 */
export function parseResetEpoch(label: string | undefined, now: number): number | null {
  if (!label) return null;
  // Reject forms that carry a weekday/month — a time-of-day alone can't place them.
  if (/\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(label)) {
    return null;
  }
  const m = label.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") hour += 12;
  const minute = m[2] ? Number(m[2]) : 0;
  const base = new Date(now);
  const target = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
  let epoch = target.getTime();
  // If that time already passed today, it's tomorrow.
  if (epoch <= now) epoch += 24 * 60 * 60 * 1000;
  return epoch;
}
