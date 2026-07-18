import { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";

/**
 * Make a floating panel draggable by a handle (change: canvas-compose-and-preview-bar).
 *
 * The panel keeps its CSS-positioned anchor (e.g. top-right) and is nudged by a
 * translate offset the user drags. Spread `handleProps` on the drag handle (the
 * panel header) and `style` on the panel root. Buttons inside the handle should
 * `stopPropagation` on pointerdown so clicking them doesn't start a drag.
 */
export function useDraggable(): {
  style: CSSProperties;
  handleProps: { onPointerDown: (e: React.PointerEvent) => void; style: CSSProperties };
} {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't hijack drags that begin on an interactive control in the handle.
      if ((e.target as HTMLElement).closest("button,input,textarea,a,select")) return;
      e.preventDefault();
      start.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      const move = (ev: PointerEvent): void => {
        if (!start.current) return;
        setOffset({ x: start.current.ox + (ev.clientX - start.current.x), y: start.current.oy + (ev.clientY - start.current.y) });
      };
      const up = (): void => {
        start.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [offset],
  );

  return {
    // Only apply a transform once moved, so an unmoved panel keeps `transform: none`.
    style: offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : {},
    handleProps: { onPointerDown, style: { cursor: "move", touchAction: "none" } },
  };
}
