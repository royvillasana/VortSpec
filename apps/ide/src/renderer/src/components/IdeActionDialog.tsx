import type { JSX } from "react";
import type { PendingIdeAction } from "../lib/useIdeMcp";

/**
 * The gate for a workspace-changing action the assistant asked for
 * (open/clone/switch). Nothing happens until the user confirms here — a model
 * can never silently swap the user's workspace.
 */
export function IdeActionDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingIdeAction;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={pending.title}
    >
      <div className="w-full max-w-md rounded-lg border border-vs-border-default bg-vs-bg-surface p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-vs-text-primary">{pending.title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-vs-text-secondary">{pending.detail}</p>
        <p className="mt-2 text-[11px] text-vs-text-muted">Requested by the assistant.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-vs-border-default px-3 py-1.5 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-vs-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
