import { createContext, useCallback, useContext, useMemo, useState, type JSX, type ReactNode } from "react";

/**
 * Ambient canvas selection (change: canvas-compose-and-preview-bar, tasks §4).
 *
 * The element currently selected on the Run canvas, offered to the assistant as
 * **standing context** — a chip on the composer the user never had to send. It is
 * published by the canvas (`RunApp`) and read by the assistant dock, which are
 * siblings under the IDE shell, so a small context carries it between them the way
 * `assistant-task` carries a dispatched task.
 *
 * This is deliberately NOT the old right-click "Send to chat" one-shot: that
 * fabricated a `startLine: 1, endLine: 1` range to smuggle a canvas selection
 * through the editor's file-reference shape, and it evaporated on the next turn.
 * A canvas selection has no honest line range, and grounding that expires after
 * one prompt is not grounding — the natural loop is "select this, now iterate on
 * it." So this is carried as its own kind and persists for as long as the
 * selection holds.
 */
export interface CanvasSelection {
  /**
   * Identity of the selected element — the bridge node id. The dock keys its
   * "detached for this selection" state on this, so it changes iff the selection
   * changes to a different element (a re-select replaces rather than accumulates).
   */
  key: string;
  /** Short label for the chip, e.g. the component name or the element's label. */
  label: string;
  /** The full grounding text sent to the assistant (from `buildSelectionContext`). */
  payload: string;
}

interface Store {
  selection: CanvasSelection | null;
  publish: (selection: CanvasSelection | null) => void;
}

const CanvasSelectionCtx = createContext<Store | null>(null);

function sameSelection(a: CanvasSelection | null, b: CanvasSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.label === b.label && a.payload === b.payload;
}

/**
 * Holds the current ambient selection. Mounted by the IDE shell above BOTH the
 * canvas and the assistant dock so one can publish and the other can read.
 */
export function CanvasSelectionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  // Ignore a republish that says nothing new — the canvas re-derives the payload
  // on every render, and a no-op setState would rerender every reading dock.
  const publish = useCallback((next: CanvasSelection | null) => {
    setSelection((cur) => (sameSelection(cur, next) ? cur : next));
  }, []);
  const value = useMemo<Store>(() => ({ selection, publish }), [selection, publish]);
  return <CanvasSelectionCtx.Provider value={value}>{children}</CanvasSelectionCtx.Provider>;
}

/** The current ambient selection, or null when nothing is selected / no provider. */
export function useCanvasSelection(): CanvasSelection | null {
  return useContext(CanvasSelectionCtx)?.selection ?? null;
}

const noop = (): void => {};

/**
 * Publish the current selection from the canvas. Returns a stable no-op when no
 * provider is mounted (e.g. the desktop shell, which has no canvas yet), so the
 * canvas can call it unconditionally.
 */
export function usePublishCanvasSelection(): (selection: CanvasSelection | null) => void {
  return useContext(CanvasSelectionCtx)?.publish ?? noop;
}
