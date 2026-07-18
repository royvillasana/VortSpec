import type { JSX } from "react";
import { Spinner } from "@vortspec/ui/ui";
import type { UseDragMove } from "../../lib/useDragMove";
import { useDraggable } from "../../lib/useDraggable";

/**
 * The drag-move panel (change: canvas-live-structural-editing, §5.8).
 *
 * A thin surface over the gated move run: watch it work (with a Stop), then review
 * the relocated element in place and accept or discard. A `stopped`/failed run
 * shows its human sentence with discard only. Mirrors the compose panel's
 * review/error phases — a move is a compose run with one option.
 */
export function MovePanel({
  move,
  onScreenUpdate,
  onScreenLater,
  onClose,
}: {
  move: UseDragMove;
  /** Run the owed SDD-DE Screen Creation update for the accepted move. */
  onScreenUpdate: (file: string) => void;
  /** Defer the owed update to the sidebar Save-changes bar. */
  onScreenLater?: (file: string) => void;
  /** Dismiss the panel (discard any in-flight move first). */
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
          title="Cancel — discard the move"
          className="ml-auto rounded px-1 leading-none text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ✕
        </button>
      </div>

      {phase === "moving" ? (
        <div data-testid="move-progress" className="flex min-w-0 items-center gap-1.5 text-[11px] text-vs-text-muted">
          <Spinner />
          <span className="min-w-0 flex-1 truncate">{move.progress ?? "Relocating the element…"}</span>
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
            onClick={() => void move.discard()}
            className="self-start rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
          >
            Discard
          </button>
        </>
      ) : phase === "review" ? (
        <>
          <p data-testid="move-review">The element was relocated — keep it here or discard the move.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void move.accept()}
              className="rounded bg-vs-accent px-2 py-1 text-white hover:opacity-90"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => void move.discard()}
              className="rounded border border-vs-border-default px-2 py-0.5 hover:bg-vs-bg-hover"
            >
              Discard
            </button>
          </div>
        </>
      ) : null}

      {move.screenUpdateOwed && (
        <div data-testid="move-screen-update" className="mt-1 rounded border border-vs-border-subtle bg-vs-bg-primary px-2 py-1.5">
          <p>
            The <span className="font-mono text-vs-text-primary">{move.screenUpdateOwed}</span> screen's spec now needs
            a Screen Creation update to match the moved element.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onScreenUpdate(move.screenUpdateOwed as string);
                move.clearScreenUpdate();
              }}
              className="rounded bg-vs-accent px-2 py-0.5 text-white hover:opacity-90"
            >
              Update the screen spec
            </button>
            <button
              type="button"
              onClick={() => {
                if (move.screenUpdateOwed) onScreenLater?.(move.screenUpdateOwed);
                move.clearScreenUpdate();
              }}
              className="rounded px-1.5 hover:bg-vs-bg-hover"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
