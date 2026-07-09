import { createElement, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Rect } from "@vortspec/core/ipc";
import type { InspectorBridge } from "../../lib/useInspectorBridge";
import { SpacingOverlay } from "./SpacingOverlay";

const px = (s?: string): number => Math.max(0, parseFloat(s ?? "") || 0);

/**
 * The Run-Canvas center surface (change: run-canvas-visual-editor).
 *
 * Embeds the project's dev server in an Electron <webview> instrumented by the
 * guest preload, and draws the hover/selection overlay on top. A single CSS
 * transform (translate + scale) wraps BOTH the webview and the overlay, so guest
 * viewport rects map 1:1 into the overlay at any zoom (no manual coordinate
 * conversion). Three modes: Inspect (hover/click selects), Interact (use the
 * app), Pan (drag to move the canvas — reliable since the webview isolates
 * keyboard/wheel events). Resize handles drag width/height, previewing live.
 */
export function RunCanvas({
  src,
  guestPreloadUrl,
  bridge,
  mode,
  zoom,
  onLiveEdit,
  onCommitEdit,
  onSendToChat,
}: {
  src: string;
  guestPreloadUrl: string | null;
  bridge: InspectorBridge;
  /** Input mode — driven from the sidebar Layers header. */
  mode: "inspect" | "interact";
  /** Zoom factor — driven from the sidebar Layers footer. */
  zoom: number;
  /** Apply a CSS override live (per animation frame while dragging a handle). */
  onLiveEdit?: (css: Record<string, string>) => void;
  /** Record the final edit(s) once, on drag end. */
  onCommitEdit?: (edits: { key: string; value: string; cssProps: string[] }[]) => void;
  /** Send the current selection to the assistant chat (from the right-click menu). */
  onSendToChat?: () => void;
}): JSX.Element {
  // Optimistic rectangle while dragging a handle — drives the overlay instantly
  // instead of waiting for the guest's geometry echo (the source of the lag).
  const [dragRect, setDragRect] = useState<Rect | null>(null);

  const bridgeSelRect = bridge.selectedId ? bridge.rects[bridge.selectedId] : undefined;
  const selRect = dragRect ?? bridgeSelRect;
  const hovRect =
    bridge.hoveredId && bridge.hoveredId !== bridge.selectedId
      ? bridge.rects[bridge.hoveredId]
      : undefined;

  // After a drag ends we keep the optimistic rect until the guest echoes the
  // final geometry — then hand back to the live rect. Prevents a snap on mouse-up.
  const settlingRef = useRef(false);
  useEffect(() => {
    if (settlingRef.current && bridgeSelRect) {
      settlingRef.current = false;
      setDragRect(null);
    }
  }, [bridgeSelRect]);
  // Selecting a different element always drops any leftover drag rect.
  useEffect(() => {
    settlingRef.current = false;
    setDragRect(null);
  }, [bridge.selectedId]);

  // Box-model of the selection for the draggable padding/gap/margin bands.
  const readout = bridge.readout && bridge.readout.nodeId === bridge.selectedId ? bridge.readout : null;
  const c = readout?.computed ?? {};
  const spacingDir: "row" | "column" | "block" =
    c["display"] === "flex" || c["display"] === "inline-flex"
      ? c["flex-direction"] === "column"
        ? "column"
        : "row"
      : "block";
  const showSpacing = mode === "inspect" && !!selRect && !!readout;

  return (
    <div className="relative h-full min-h-[340px] w-full overflow-hidden bg-white">
      {/* Stage — the webview + overlay share one transform, so rects align at any zoom. */}
      <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${zoom})` }}>
        {guestPreloadUrl ? (
          // <webview> is an Electron intrinsic element, not in React's JSX types —
          // build it via createElement to keep the loose attribute typing contained.
          createElement("webview", {
            ref: bridge.attach,
            src,
            preload: guestPreloadUrl,
            // sandbox=no matches the main window so the ESM guest preload (which
            // imports `electron`) actually loads — a sandboxed webview silently
            // fails to load it. contextIsolation keeps the guest's world separate.
            webpreferences: "sandbox=no,contextIsolation=yes,nodeIntegration=no",
            className: "h-full w-full border-0",
            style: { display: "flex" },
          })
        ) : (
          <div className="grid h-full place-items-center text-xs text-vs-text-secondary">
            Preparing canvas…
          </div>
        )}

        {/* Overlay lives inside the stage → boxes use guest coords directly. */}
        <div data-vs-overlay className="pointer-events-none absolute inset-0">
          {hovRect && <Box rect={hovRect} kind="hover" />}
          {showSpacing && selRect && readout && (
            <SpacingOverlay
              key={bridge.selectedId ?? ""}
              rect={selRect}
              padding={{ top: px(c["padding-top"]), right: px(c["padding-right"]), bottom: px(c["padding-bottom"]), left: px(c["padding-left"]) }}
              margin={{ top: px(c["margin-top"]), right: px(c["margin-right"]), bottom: px(c["margin-bottom"]), left: px(c["margin-left"]) }}
              gap={px(c["gap"])}
              direction={spacingDir}
              childRects={readout.children}
              zoom={zoom}
              onLive={(css) => onLiveEdit?.(css)}
              onCommit={(edit) => onCommitEdit?.([edit])}
            />
          )}
          {selRect && (
            <Box
              rect={selRect}
              kind="select"
              showHandles={mode === "inspect"}
              zoom={zoom}
              onLiveEdit={onLiveEdit}
              onCommitEdit={onCommitEdit}
              onDragRect={setDragRect}
              onDragEnd={() => {
                settlingRef.current = true;
              }}
            />
          )}
        </div>
      </div>

      {/* Right-click context menu on an element (Send to chat, …). */}
      {bridge.contextMenu && (
        <div className="absolute inset-0 z-30" onClick={() => bridge.clearContextMenu()}>
          <div
            className="absolute min-w-[160px] overflow-hidden rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 text-[12px] shadow-2xl"
            style={{ left: bridge.contextMenu.x * zoom, top: bridge.contextMenu.y * zoom }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onSendToChat?.();
                bridge.clearContextMenu();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
            >
              💬 Send to chat
            </button>
          </div>
        </div>
      )}

      {bridge.error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-vs-border-default bg-vs-bg-elevated px-3 py-1.5 text-[11px] text-vs-text-secondary shadow">
          Visual editing unavailable on this page — {bridge.error}
        </div>
      )}
    </div>
  );
}

/** Which handles resize, and along which axes. */
const RESIZABLE: Record<string, { w?: boolean; h?: boolean; cursor: string }> = {
  e: { w: true, cursor: "ew-resize" },
  s: { h: true, cursor: "ns-resize" },
  se: { w: true, h: true, cursor: "nwse-resize" },
};

function Box({
  rect,
  kind,
  showHandles = false,
  zoom = 1,
  onLiveEdit,
  onCommitEdit,
  onDragRect,
  onDragEnd,
}: {
  rect: Rect;
  kind: "hover" | "select";
  showHandles?: boolean;
  zoom?: number;
  onLiveEdit?: (css: Record<string, string>) => void;
  onCommitEdit?: (edits: { key: string; value: string; cssProps: string[] }[]) => void;
  onDragRect?: (rect: Rect | null) => void;
  onDragEnd?: () => void;
}): JSX.Element {
  const color = kind === "select" ? "var(--color-vs-accent)" : "rgba(124,111,240,0.5)";

  function startDrag(pos: string) {
    return (e: React.PointerEvent): void => {
      const axis = RESIZABLE[pos];
      if (!axis || !onLiveEdit) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      let latest = { w: start.w, h: start.h };
      let raf = 0;
      // Throttle the live override + guest IPC to one message per frame.
      const flush = (): void => {
        raf = 0;
        const css: Record<string, string> = {};
        if (axis.w) css.width = `${latest.w}px`;
        if (axis.h) css.height = `${latest.h}px`;
        onLiveEdit(css);
      };
      const move = (ev: PointerEvent): void => {
        // Client-px delta ÷ zoom = guest-px delta (the stage is scaled).
        const w = axis.w ? Math.max(0, Math.round(start.w + (ev.clientX - startX) / zoom)) : start.w;
        const h = axis.h ? Math.max(0, Math.round(start.h + (ev.clientY - startY) / zoom)) : start.h;
        latest = { w, h };
        // Move the overlay box immediately (no IPC round-trip → no lag).
        onDragRect?.({ x: start.x, y: start.y, width: w, height: h });
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const up = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (raf) cancelAnimationFrame(raf);
        // Flush the EXACT release size to the guest (the throttled stream may have
        // skipped the final frame), so the element locks in where the user let go.
        const finalCss: Record<string, string> = {};
        if (axis.w) finalCss.width = `${latest.w}px`;
        if (axis.h) finalCss.height = `${latest.h}px`;
        onLiveEdit(finalCss);
        // Hold the box at the release size until the guest echoes it (settle).
        onDragRect?.({ x: start.x, y: start.y, width: latest.w, height: latest.h });
        onDragEnd?.();
        const edits: { key: string; value: string; cssProps: string[] }[] = [];
        if (axis.w) edits.push({ key: "width", value: `${latest.w}px`, cssProps: ["width"] });
        if (axis.h) edits.push({ key: "height", value: `${latest.h}px`, cssProps: ["height"] });
        onCommitEdit?.(edits);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
  }

  return (
    <div
      className="absolute"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        outline: `1.5px solid ${color}`,
        outlineOffset: -1,
      }}
    >
      {kind === "hover" && (
        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-vs-accent px-1 py-px text-[9px] text-white">
          {Math.round(rect.width)}×{Math.round(rect.height)}
        </span>
      )}
      {showHandles &&
        HANDLES.map((h) => {
          const resizable = RESIZABLE[h.pos];
          return (
            <span
              key={h.pos}
              onPointerDown={resizable ? startDrag(h.pos) : undefined}
              className={`absolute h-2 w-2 rounded-[2px] border border-white bg-vs-accent ${
                resizable ? "pointer-events-auto" : ""
              }`}
              style={{ ...h.style, cursor: resizable?.cursor }}
            />
          );
        })}
    </div>
  );
}

/** Eight resize handles at the corners/edges of the selection box. */
const HANDLES: { pos: string; style: React.CSSProperties }[] = [
  { pos: "nw", style: { left: -4, top: -4 } },
  { pos: "n", style: { left: "calc(50% - 4px)", top: -4 } },
  { pos: "ne", style: { right: -4, top: -4 } },
  { pos: "e", style: { right: -4, top: "calc(50% - 4px)" } },
  { pos: "se", style: { right: -4, bottom: -4 } },
  { pos: "s", style: { left: "calc(50% - 4px)", bottom: -4 } },
  { pos: "sw", style: { left: -4, bottom: -4 } },
  { pos: "w", style: { left: -4, top: "calc(50% - 4px)" } },
];
