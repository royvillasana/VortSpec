import type { JSX } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@vortspec/ui/ui";
import { FigmaIcon } from "./FigmaIcon";

/**
 * The Send-to-Figma round-trip panel (change: add-screen-to-figma). A small floating card
 * over the canvas, modeled on RunDoctor. Surfaces the current state of the previewed screen's
 * Figma link and the round-trip actions — never the "sending…/pulling…" transient (that rides
 * the AiWorkingPill on the toolbar):
 *
 *  - `mapped` — the screen already has a Figma frame from a prior send: Open · Pull changes back.
 *  - `sent`   — a send just completed: Open · Pull changes back · Dismiss.
 *  - `review` — a pull-back produced source edits awaiting the Keep/Revert gate.
 *  - `error`  — the last round-trip failed.
 */
export function FigmaBridgePanel({
  phase,
  openUrl,
  error,
  onOpen,
  onPull,
  onKeep,
  onRevert,
  onDismiss,
}: {
  phase: "mapped" | "sent" | "review" | "error";
  openUrl?: string | null;
  error?: string | null;
  onOpen?: () => void;
  onPull?: () => void;
  onKeep?: () => void;
  onRevert?: () => void;
  onDismiss?: () => void;
}): JSX.Element {
  return (
    <div
      data-testid="figma-bridge-panel"
      className="pointer-events-auto absolute bottom-3 left-3 z-40 w-72 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <FigmaIcon size={15} />
        <span className="text-[12px] font-semibold text-vs-text-primary">
          {phase === "review"
            ? "Review Figma changes"
            : phase === "error"
              ? "Figma round-trip failed"
              : phase === "sent"
                ? "Sent to Figma"
                : "This screen is in Figma"}
        </span>
        {onDismiss && phase !== "review" && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="ml-auto text-vs-text-muted hover:text-vs-text-secondary"
          >
            ✕
          </button>
        )}
      </div>

      {phase === "review" ? (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-vs-text-muted">
            The Figma edits were applied to this screen's source. Keep them, or revert to how it was.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={onKeep}>
              Keep
            </Button>
            <Button variant="ghost" onClick={onRevert}>
              Revert
            </Button>
          </div>
        </>
      ) : phase === "error" ? (
        <p className="mt-1 text-[11px] leading-relaxed text-vs-warning">
          {error || "The send/pull run didn't complete. Check the Figma connection and try again."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-vs-text-muted">
            Edit the screen in Figma, then pull the changes back into your code.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {openUrl && (
              <Button variant="ghost" onClick={onOpen}>
                <ExternalLink size={13} /> Open in Figma
              </Button>
            )}
            {onPull && (
              <Button variant="primary" onClick={onPull}>
                Pull changes back
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
