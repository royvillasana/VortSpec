import { useState } from "react";
import type { JSX } from "react";
import type { Rect } from "@vortspec/core/ipc";

/**
 * Figma-style spacing manipulation (change: run-canvas-visual-editor).
 *
 * Draws the selected element's padding, gap, and margin as draggable pink bands
 * over the canvas — exactly Figma's behavior: grab a band and drag perpendicular
 * to its side to change that spacing, with a live value badge, previewing in the
 * guest (nothing written until Apply). Coordinates are guest-viewport pixels; the
 * overlay lives inside the zoom/pan stage so it maps 1:1 (deltas ÷ zoom).
 */
export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Band {
  prop: string; // css property to edit
  rect: Rect; // where to draw (guest coords)
  axis: "x" | "y"; // drag axis
  sign: number; // delta → value direction
  base: number; // current value (px)
  kind: "padding" | "gap" | "margin";
}

export function SpacingOverlay({
  rect,
  padding,
  margin,
  gap,
  direction,
  childRects,
  zoom,
  onLive,
  onCommit,
}: {
  rect: Rect;
  padding: Sides;
  margin: Sides;
  gap: number;
  direction: "row" | "column" | "block";
  childRects: Rect[];
  zoom: number;
  onLive: (css: Record<string, string>) => void;
  onCommit: (edit: { key: string; value: string; cssProps: string[] }) => void;
}): JSX.Element {
  // Persisted optimistic values (survive drag-end until the selection changes —
  // the component is keyed by node id upstream, so it remounts on reselect).
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const v = (prop: string, base: number): number => draft[prop] ?? base;

  const R = rect;
  const pt = v("padding-top", padding.top);
  const pr = v("padding-right", padding.right);
  const pb = v("padding-bottom", padding.bottom);
  const pl = v("padding-left", padding.left);
  const g = v("gap", gap);

  const bands: Band[] = [];

  // Padding — inside the border box.
  if (pt > 0) bands.push({ prop: "padding-top", rect: { x: R.x, y: R.y, width: R.width, height: pt }, axis: "y", sign: 1, base: pt, kind: "padding" });
  if (pb > 0) bands.push({ prop: "padding-bottom", rect: { x: R.x, y: R.y + R.height - pb, width: R.width, height: pb }, axis: "y", sign: -1, base: pb, kind: "padding" });
  if (pl > 0) bands.push({ prop: "padding-left", rect: { x: R.x, y: R.y + pt, width: pl, height: R.height - pt - pb }, axis: "x", sign: 1, base: pl, kind: "padding" });
  if (pr > 0) bands.push({ prop: "padding-right", rect: { x: R.x + R.width - pr, y: R.y + pt, width: pr, height: R.height - pt - pb }, axis: "x", sign: -1, base: pr, kind: "padding" });

  // Gap — between consecutive children (flex only).
  if (direction !== "block" && g > 0) {
    for (let i = 0; i < childRects.length - 1; i++) {
      const a = childRects[i];
      const b = childRects[i + 1];
      const band =
        direction === "row"
          ? { x: a.x + a.width, y: R.y + pt, width: Math.max(0, b.x - (a.x + a.width)), height: R.height - pt - pb }
          : { x: R.x + pl, y: a.y + a.height, width: R.width - pl - pr, height: Math.max(0, b.y - (a.y + a.height)) };
      bands.push({ prop: "gap", rect: band, axis: direction === "row" ? "x" : "y", sign: 1, base: g, kind: "gap" });
    }
  }

  // Margin — outside the border box.
  const mt = v("margin-top", margin.top);
  const mr = v("margin-right", margin.right);
  const mb = v("margin-bottom", margin.bottom);
  const ml = v("margin-left", margin.left);
  if (mt > 0) bands.push({ prop: "margin-top", rect: { x: R.x, y: R.y - mt, width: R.width, height: mt }, axis: "y", sign: -1, base: mt, kind: "margin" });
  if (mb > 0) bands.push({ prop: "margin-bottom", rect: { x: R.x, y: R.y + R.height, width: R.width, height: mb }, axis: "y", sign: 1, base: mb, kind: "margin" });
  if (ml > 0) bands.push({ prop: "margin-left", rect: { x: R.x - ml, y: R.y, width: ml, height: R.height }, axis: "x", sign: -1, base: ml, kind: "margin" });
  if (mr > 0) bands.push({ prop: "margin-right", rect: { x: R.x + R.width, y: R.y, width: mr, height: R.height }, axis: "x", sign: 1, base: mr, kind: "margin" });

  function startBand(band: Band) {
    return (e: React.PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      // Capture the pointer to THIS band element so the drag keeps receiving move/up
      // even while the cursor is over the embedded <webview> — without this the guest
      // swallows the events and pointerup never fires, so the drag stays stuck until
      // the next click. (Capture retargets to the element but events still bubble to
      // the window listeners below.)
      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* capture unsupported — window listeners still cover the non-webview case */
      }
      setActive(band.prop);
      const startX = e.clientX;
      const startY = e.clientY;
      const start = band.prop === "gap" ? g : band.base;
      let latest = start;
      let raf = 0;
      const flush = (): void => {
        raf = 0;
        onLive({ [band.prop]: `${Math.max(0, Math.round(latest))}px` });
      };
      const move = (ev: PointerEvent): void => {
        const d = band.axis === "x" ? ev.clientX - startX : ev.clientY - startY;
        latest = Math.max(0, start + (band.sign * d) / zoom);
        setDraft((prev) => ({ ...prev, [band.prop]: Math.round(latest) }));
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const up = (): void => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("lostpointercapture", up);
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        if (raf) cancelAnimationFrame(raf);
        const value = `${Math.max(0, Math.round(latest))}px`;
        onLive({ [band.prop]: value });
        onCommit({ key: band.prop, value, cssProps: [band.prop] });
        setActive(null);
      };
      // With pointer capture, events are dispatched to `el` — listen there. Also end on
      // lostpointercapture (e.g. the element unmounts) so the drag never gets stuck.
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("lostpointercapture", up);
    };
  }

  return (
    <>
      {bands.map((band, i) => {
        const isActive = active === band.prop;
        const value = band.prop === "gap" ? g : v(band.prop, band.base);
        return (
          <div
            key={`${band.prop}-${i}`}
            onPointerDown={startBand(band)}
            title={`${band.prop}: ${Math.round(value)}px`}
            className="pointer-events-auto absolute"
            style={{
              left: band.rect.x,
              top: band.rect.y,
              width: band.rect.width,
              height: band.rect.height,
              cursor: band.axis === "x" ? "ew-resize" : "ns-resize",
              backgroundColor: band.kind === "margin" ? "rgba(139,92,246,0.16)" : "rgba(236,72,153,0.16)",
              backgroundImage: `repeating-linear-gradient(-45deg, ${
                band.kind === "margin" ? "rgba(139,92,246,0.45)" : "rgba(236,72,153,0.45)"
              } 0 1px, transparent 1px 5px)`,
              outline: isActive ? "1px solid rgba(236,72,153,0.9)" : undefined,
            }}
          >
            {isActive && (
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-pink-600 px-1 py-px text-[10px] font-medium text-white"
                style={{ backgroundColor: "#db2777" }}
              >
                {Math.round(value)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
