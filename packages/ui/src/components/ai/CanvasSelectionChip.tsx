import { useState } from "react";
import type { JSX } from "react";
import type { CanvasSelection } from "../../lib/canvas-selection";

/**
 * The ambient canvas-selection chip on the composer (tasks §4).
 *
 * Distinct from the regular attachment chips: it is not something the user added
 * and it is not cleared on submit — it tracks the live canvas selection. It is
 * **detachable** (dismiss it for this prompt without deselecting on the canvas)
 * and **inspectable** (expand to see exactly what will be sent), which is why it
 * renders separately rather than through `AttachmentChips`.
 */
export function CanvasSelectionChip({
  selection,
  onDetach,
}: {
  selection: CanvasSelection;
  /** Drop the chip for the next prompt; the canvas selection itself stays. */
  onDetach: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2" data-testid="canvas-selection-chip">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-vs-accent-subtle bg-vs-accent-subtle/40 px-1.5 py-0.5 text-[11px] text-vs-text-secondary">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title="Show exactly what will be sent"
            className="flex min-w-0 items-center gap-1 hover:text-vs-text-primary"
          >
            <span aria-hidden>🎯</span>
            <span className="truncate">
              Selection: <span className="font-mono">{selection.label}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onDetach}
            title="Detach for this prompt (keeps the canvas selection)"
            aria-label="Detach selection context"
            className="ml-0.5 rounded px-0.5 leading-none text-vs-text-muted hover:text-vs-text-primary"
          >
            ×
          </button>
        </span>
      </div>
      {open && (
        <pre
          data-testid="canvas-selection-detail"
          className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-vs-border-subtle bg-vs-bg-primary px-2 py-1.5 text-[10px] leading-relaxed text-vs-text-secondary"
        >
          {selection.payload}
        </pre>
      )}
    </div>
  );
}
