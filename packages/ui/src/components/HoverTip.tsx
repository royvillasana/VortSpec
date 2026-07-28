import { useCallback, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A hover tooltip in the same style as the IDE activity bar / canvas toolbar, but rendered in a
 * body PORTAL so it's never clipped by a scrolling or `overflow-hidden` ancestor (the sidebar tree
 * clips, so a plain absolutely-positioned tooltip would be cut off). Wrap a trigger; the label shows
 * on hover/focus, positioned to one side of the trigger.
 */
export function HoverTip({
  label,
  side = "left",
  children,
}: {
  label: string;
  /** Which side of the trigger the tooltip opens toward (default: left, into the sidebar). */
  side?: "left" | "right";
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: side === "left" ? r.left : r.right, y: r.top + r.height / 2 });
  }, [side]);
  const hide = useCallback(() => setPos(null), []);
  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      className="inline-flex"
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform: side === "left" ? "translate(calc(-100% - 8px), -50%)" : "translate(8px, -50%)",
            }}
            className="pointer-events-none z-[100] whitespace-nowrap rounded-md border border-vs-border-default bg-vs-bg-elevated px-2 py-1 text-[11px] font-medium text-vs-text-primary shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
