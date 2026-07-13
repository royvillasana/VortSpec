import type { JSX } from "react";
import type { UsageWarning as UsageWarningData } from "../lib/useUsageWarning";

/**
 * The agnostic "approaching your usage limit" banner — the pre-emptive
 * counterpart to RunLimitNotice (which fires at 100%). Shown as the session
 * usage crosses 75% / 85% / 95%, so a long session doesn't hit the wall
 * unannounced mid-build. Dismissible; it returns at the next threshold.
 */
export function UsageWarning({
  warning,
  onDismiss,
}: {
  warning: UsageWarningData;
  onDismiss: () => void;
}): JSX.Element {
  const urgent = warning.threshold >= 95;
  const left = Math.max(0, 100 - warning.percent);
  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-[12px] ${
        urgent
          ? "border-vs-error/40 bg-vs-error/[0.06] text-vs-text-primary"
          : "border-vs-warning-border bg-vs-warning-muted text-vs-text-primary"
      }`}
    >
      <span className={`text-sm leading-none ${urgent ? "text-vs-error" : "text-vs-warning"}`}>⚠</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span>
          You’ve used <b>{warning.percent}%</b> of your Claude session limit
          {urgent ? " — you’re almost out." : "."} About {left}% left before runs pause on the limit
          {warning.resetsAt ? `; it resets ${warning.resetsAt}.` : "."}
        </span>
        <span className="text-[10px] text-vs-text-muted">
          This is your own Claude plan — finish or pause long builds soon so one doesn’t stop mid-run.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss usage warning"
        className="flex-none text-vs-text-muted hover:text-vs-text-secondary"
      >
        ✕
      </button>
    </div>
  );
}
