import { useEffect, useState } from "react";
import type { Dispatch, JSX, SetStateAction } from "react";

/**
 * A draggable divider between two panes. `orientation="vertical"` is a thin
 * vertical bar you drag left/right (to resize a side panel's width);
 * `orientation="horizontal"` is a thin horizontal bar you drag up/down (to
 * resize a panel's height). Emits incremental pixel deltas via `onDelta`.
 */
export function Resizer({
  orientation,
  onDelta,
  ariaLabel,
}: {
  orientation: "vertical" | "horizontal";
  onDelta: (delta: number) => void;
  ariaLabel: string;
}): JSX.Element {
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let last = orientation === "vertical" ? e.clientX : e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const cur = orientation === "vertical" ? ev.clientX : ev.clientY;
      onDelta(cur - last);
      last = cur;
    };
    const onUp = (): void => {
      el.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onPointerDown={onPointerDown}
      className={
        orientation === "vertical"
          ? "w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-vs-accent/40"
          : "h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-vs-accent/40"
      }
    />
  );
}

/** A number persisted to localStorage (panel sizes survive reloads). The setter
 *  is the React dispatch, so functional updates (`set(w => w + d)`) work. */
export function usePersistentNumber(
  key: string,
  initial: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Clamp a value to [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A boolean persisted to localStorage (editor/panel toggles survive reloads). */
export function usePersistentBool(
  key: string,
  initial: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : raw === "true";
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/** A string persisted to localStorage (e.g. the preview target). */
export function usePersistentString<T extends string>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}
