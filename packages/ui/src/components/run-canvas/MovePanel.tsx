import type { JSX } from "react";
import { Spinner } from "@vortspec/ui/ui";
import type { UseDragMove } from "../../lib/useDragMove";
import { useDraggable } from "../../lib/useDraggable";

/**
 * The direct-manipulation move panel (change: canvas-direct-manipulation-move).
 *
 * The element is ALREADY moved in the live DOM by the time this shows — this is the
 * Keep/Revert gate over that instant, ephemeral move. Keep reconciles source (a
 * gated run that auto-accepts); Revert undoes the DOM move with nothing written. A
 * stopped/failed keep shows its human sentence and leaves the element moved, so
 * Revert still backs out cleanly.
 */
export function MovePanel({
  move,
  onClose,
}: {
  move: UseDragMove;
  /** Dismiss the panel (revert the ephemeral move first). */
  onClose: () => void;
}): JSX.Element {
  const { phase } = move;
  const drag = useDraggable();
  return (
    <div
      data-testid="move-panel"
      data-vs-overlay
      style={drag.style}
      className="pointer-events-auto absolute right-3 top-3 z-40 flex w-72 flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 text-[12px] text-vs-text-secondary shadow-2xl backdrop-blur"
    >
      <div {...drag.handleProps} data-testid="dialog-drag-handle" className="flex items-center gap-2 select-none">
        <span className="font-semibold text-vs-text-primary">Move element</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel move"
          title="Cancel — revert the move"
          className="ml-auto rounded px-1 leading-none text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ✕
        </button>
      </div>

      {phase === "moved" ? (
        <>
          <p data-testid="move-review">Moved here. Keep it to save the change, or revert.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void move.keep()}
              className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => move.revert()}
              className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
            >
              Revert
            </button>
          </div>
        </>
      ) : phase === "reconciling" ? (
        <div data-testid="move-progress" className="flex min-w-0 items-center gap-1.5 text-[11px] text-vs-text-muted">
          <Spinner />
          <span className="min-w-0 flex-1 truncate">{move.progress ?? "Saving the move to source…"}</span>
          <button
            type="button"
            onClick={() => void move.cancel()}
            className="flex-none rounded-md bg-vs-bg-hover px-2 py-0.5 text-vs-text-primary ring-1 ring-vs-border-default hover:bg-vs-bg-elevated"
          >
            Stop
          </button>
        </div>
      ) : phase === "error" ? (
        <>
          <p data-testid="move-error" className="text-vs-text-primary">
            {move.error}
          </p>
          <button
            type="button"
            onClick={() => move.revert()}
            className="self-start rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
          >
            Revert
          </button>
        </>
      ) : null}
    </div>
  );
}
