import type { JSX } from "react";
import type { InspectorComponent } from "@vortspec/core/ipc";
import { ComponentPicker } from "./ComponentPicker";

/**
 * The assign-a-component dialog (change: canvas-compose-and-preview-bar).
 *
 * Shown as a floating dialog over the canvas when the user inspect-clicks an
 * element — the design-system roster to assign/reuse for that element. Replaces
 * the assign section that used to live in the left Design panel; it reuses the
 * shared `ComponentPicker` (with hover thumbnails), so insert and assign present
 * one consistent component list.
 */
export function AssignDialog({
  recognized,
  recommended,
  components,
  onAssign,
  onExtract,
  onClose,
  getStoryUrl,
}: {
  /** The component the selected element already IS, when recognized (else null). */
  recognized: string | null;
  /** A component the element resembles but isn't using — pinned + badged (else null). */
  recommended: string | null;
  components: InspectorComponent[];
  /** Assign a roster component to the selection (allSimilar = apply to every match). */
  onAssign: (component: { name: string; file: string | null }, opts: { allSimilar: boolean }) => void;
  /** Extract the selection as a new component when nothing fits. */
  onExtract?: () => void;
  /** Dismiss the dialog for this selection. */
  onClose: () => void;
  /** A live Storybook iframe URL for a component's initial state, or null (hover preview). */
  getStoryUrl?: (name: string) => string | null;
}): JSX.Element {
  return (
    <div
      data-testid="assign-dialog"
      data-vs-overlay
      className="pointer-events-auto absolute right-3 top-3 z-40 flex w-72 flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 p-3 text-[12px] text-vs-text-secondary shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>🧩</span>
        <span className="font-semibold text-vs-text-primary">Assign a component</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="ml-auto rounded px-1 leading-none text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ✕
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-vs-text-primary">
        {recognized ? (
          <>
            ✓ This is your <b>{recognized}</b> component. Pick another to reassign it.
          </>
        ) : recommended ? (
          <>
            Looks like your <b>{recommended}</b> component — or pick another to assign. Reusing a component keeps its
            variants and tokens connected.
          </>
        ) : (
          <>This is hand-written markup. Assign the design-system component it should be.</>
        )}
      </p>

      <ComponentPicker
        components={components}
        recommended={recommended}
        actionLabel="assign"
        showAllSimilar
        onExtract={onExtract}
        getStoryUrl={getStoryUrl}
        onPick={(c, opts) => onAssign({ name: c.name, file: c.file }, opts)}
      />
    </div>
  );
}
