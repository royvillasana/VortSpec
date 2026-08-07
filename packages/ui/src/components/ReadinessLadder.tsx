import { useState } from "react";
import type { JSX } from "react";
import { ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import type { ReadinessAssessmentPayload } from "@vortspec/core/ipc";

/**
 * The AI-readiness ladder — OpenSpec change: agentic-design-system, task 5.3.
 *
 * Sits on the Design System screen beside the existing readiness signals and is deliberately a
 * DIFFERENT shape from them: those answer "is this project set up", this answers "how much of the
 * design system can an agent actually work from". A second row of the same green ticks would read as
 * more of the same and get skimmed.
 *
 * The next action is shown at the top level of the component, not hidden behind the expander. It is
 * the only part most people need, and burying it would make the whole thing a badge.
 */

const LEVELS = [1, 2, 3, 4, 5] as const;
const NAMES = ["Libraries", "Standardised", "Governed", "Operational", "Agentic"] as const;

export function ReadinessLadder({
  readiness,
}: {
  readiness: ReadinessAssessmentPayload | null;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!readiness) return null;

  return (
    <section
      data-testid="readiness-ladder"
      className="border-b border-vs-border-subtle bg-vs-bg-secondary px-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-vs-text-muted">AI-readiness</span>

        <div data-testid="readiness-rungs" className="flex items-center gap-0.5">
          {LEVELS.map((level) => (
            <span
              key={level}
              title={NAMES[level - 1]}
              aria-label={`${NAMES[level - 1]}${level <= readiness.level ? " (reached)" : ""}`}
              className={`h-1.5 w-6 rounded-sm ${
                level <= readiness.level ? "bg-vs-accent" : "bg-vs-bg-hover"
              }`}
            />
          ))}
        </div>

        <span className="text-[12px] font-medium text-vs-text-primary">
          {readiness.level}/5 · {readiness.levelName}
        </span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[11px] text-vs-text-secondary hover:text-vs-text-primary"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? "Hide signals" : "Signals"}
        </button>
      </div>

      {readiness.nextAction && (
        <p data-testid="readiness-next" className="pt-1 text-[12px] text-vs-text-secondary">
          <span className="text-vs-text-muted">Next: </span>
          {readiness.nextAction}
        </p>
      )}

      {open && readiness.signals.length > 0 && (
        <ul data-testid="readiness-signals" className="pt-2">
          {readiness.signals.map((signal) => (
            <li key={signal.id} className="flex items-start gap-2 py-0.5 text-[12px]">
              {signal.met ? (
                <Check size={12} className="mt-0.5 flex-none text-vs-accent" />
              ) : (
                <Minus size={12} className="mt-0.5 flex-none text-vs-text-muted" />
              )}
              <span className="min-w-0">
                <span className="text-vs-text-primary">{signal.label}</span>{" "}
                {/* The level a signal gates is shown whether or not it is met — the reader needs to
                    see what is holding the level UP as much as what is holding it back. */}
                <span className="text-vs-text-muted">
                  (L{signal.gates})
                  {readiness.blocking.includes(signal.id) ? " · blocking" : ""}
                </span>
                <span className="block text-vs-text-secondary">{signal.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
