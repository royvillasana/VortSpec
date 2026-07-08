import type { RunProgress as RunProgressModel } from "../lib/run-progress";
import { Spinner } from "./ui";

/**
 * The holistic status of a background run: a stage stepper, a progress bar with a
 * plain-language legend of what's happening now, an optional component counter
 * (for the build-&-verify pipeline), and any issues the user may need to resolve.
 * Purely presentational — everything comes from `deriveProgress`.
 */
export function RunProgress({
  progress,
  running,
}: {
  progress: RunProgressModel;
  running: boolean;
}): React.JSX.Element {
  const pct = Math.round(progress.fraction * 100);
  return (
    <div className="flex flex-col gap-2.5">
      {/* Stage stepper */}
      <div className="flex flex-wrap items-center gap-1">
        {progress.stages.map((s, i) => {
          const state = progress.done || i < progress.currentIndex ? "done" : i === progress.currentIndex ? "active" : "pending";
          return (
            <div key={s.id} className="flex items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  state === "done"
                    ? "bg-vs-success-muted text-vs-success"
                    : state === "active"
                      ? "bg-vs-accent-subtle text-vs-text-primary"
                      : "text-vs-text-muted"
                }`}
              >
                {state === "done" ? "✓ " : ""}
                {s.label}
              </span>
              {i < progress.stages.length - 1 && <span className="text-vs-border-strong">›</span>}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-vs-border-default">
        <div
          className="h-full rounded-full bg-vs-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[11px] text-vs-text-secondary">
        {running && <Spinner />}
        <span className="flex-1">{progress.legend}</span>
        {progress.counter && (
          <span className="tabular-nums text-vs-text-muted">
            {progress.counter.done}/{progress.counter.total} components
          </span>
        )}
      </div>

      {/* Blockers the user may need to resolve */}
      {progress.blockers.map((b, i) => (
        <div
          key={i}
          className={`rounded-md border px-3 py-2 text-xs ${
            b.tone === "error"
              ? "border-vs-error bg-vs-error/10 text-vs-error"
              : "border-vs-warning-border bg-vs-warning-muted text-vs-warning"
          }`}
        >
          <p className="font-medium">⚠ {b.title}</p>
          <p className="mt-0.5 opacity-90">{b.hint}</p>
        </div>
      ))}
    </div>
  );
}
