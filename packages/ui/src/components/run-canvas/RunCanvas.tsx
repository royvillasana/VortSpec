import { createElement, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Rect } from "@vortspec/core/ipc";
import type { InspectorBridge, CanvasMode } from "../../lib/useInspectorBridge";
import { SpacingOverlay } from "./SpacingOverlay";
import { CommentsLayer, type CommentsLayerProps } from "./CommentsLayer";
import { AiSkeletonBlock, AiSkeletonPage } from "./AiSkeleton";
import { CanvasToolbar } from "./CanvasToolbar";
import { bridgeStatusMessage } from "./bridge-status";

const px = (s?: string): number => Math.max(0, parseFloat(s ?? "") || 0);

/**
 * The Run-Canvas center surface (change: run-canvas-visual-editor).
 *
 * Embeds the project's dev server in an Electron <webview> instrumented by the
 * guest preload, and draws the hover/selection overlay on top. A single CSS
 * transform (translate + scale) wraps BOTH the webview and the overlay, so guest
 * viewport rects map 1:1 into the overlay at any zoom (no manual coordinate
 * conversion). Modes: Interact (use the app — the resting default), Inspect
 * (hover/click selects), Comment (pin a thread). Resize handles drag
 * width/height, previewing live.
 */
export function RunCanvas({
  src,
  guestPreloadUrl,
  bridge,
  mode,
  onModeChange,
  zoom,
  onZoomBy,
  onZoomReset,
  onLiveEdit,
  onCommitEdit,
  onSendToChat,
  comments,
  skeleton,
}: {
  src: string;
  guestPreloadUrl: string | null;
  bridge: InspectorBridge;
  /** Input mode — owned by RunApp, surfaced on the canvas toolbar. */
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  /** Zoom factor — owned by RunApp, surfaced on the canvas toolbar. */
  zoom: number;
  onZoomBy: (factor: number) => void;
  onZoomReset: () => void;
  /** Apply a CSS override live (per animation frame while dragging a handle). */
  onLiveEdit?: (css: Record<string, string>) => void;
  /** Record the final edit(s) once, on drag end. */
  onCommitEdit?: (edits: { key: string; value: string; cssProps: string[] }[]) => void;
  /** Send the current selection to the assistant chat (from the right-click menu). */
  onSendToChat?: () => void;
  /** Comment threads + handlers; the pins/composer render in comment mode. */
  comments?: Omit<CommentsLayerProps, "zoom">;
  /** An "AI is working" placeholder over the preview: a shimmer block where a
   *  component is being built, or a full-page animated gradient for page work. */
  skeleton?: { mode: "page"; label?: string } | { mode: "block"; rect: Rect; label?: string } | null;
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

  // The selected node's name for the overlay badge — its component name, else its
  // tag, plus an id/class hint so a plain element still reads meaningfully.
  const selNode = bridge.selectedId ? bridge.tree?.nodes[bridge.selectedId] : undefined;
  const selName = selNode
    ? `${selNode.component ?? selNode.tag}${
        selNode.idAttr ? ` #${selNode.idAttr}` : selNode.classes[0] ? ` .${selNode.classes[0]}` : ""
      }`
    : undefined;

  // In insert mode the cursor telegraphs the flow axis: a vertical divider (row
  // flow) reads as a horizontal move, and vice-versa.
  const insertCursor =
    mode === "insert" && !bridge.placeholder
      ? bridge.insertTarget?.axis === "column"
        ? "row-resize"
        : "col-resize"
      : undefined;

  return (
    <div
      className="relative h-full min-h-[340px] w-full overflow-hidden bg-white"
      style={insertCursor ? { cursor: insertCursor } : undefined}
    >
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

        {/* Overlay lives inside the stage → boxes use guest coords directly.
            Only shown in Inspect mode — Interact leaves the app untouched. */}
        <div data-vs-overlay className="pointer-events-none absolute inset-0">
          {mode === "inspect" && hovRect && <Box rect={hovRect} kind="hover" />}
          {mode === "inspect" && showSpacing && selRect && readout && (
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
          {mode === "inspect" && selRect && (
            <Box
              rect={selRect}
              kind="select"
              label={selName}
              showHandles
              zoom={zoom}
              onLiveEdit={onLiveEdit}
              onCommitEdit={onCommitEdit}
              onDragRect={setDragRect}
              onDragEnd={() => {
                settlingRef.current = true;
              }}
            />
          )}

          {/* Insert mode: the slot line follows the pointer until a click
              materializes the placeholder, which then shows resize handles. */}
          {mode === "insert" && !bridge.placeholder && bridge.insertTarget && (
            <InsertLine line={bridge.insertTarget.line} axis={bridge.insertTarget.axis} />
          )}
          {mode === "insert" && bridge.placeholder && (
            <PlaceholderBox
              rect={bridge.placeholder.rect}
              zoom={zoom}
              onResize={(size) => bridge.resizePlaceholder(size)}
            />
          )}

          {/* Drag-move (inspect mode): a ghost of the dragged element trails the
              pointer, and the drop slot draws the same InsertLine as insert mode
              (change: canvas-live-structural-editing, §5.4). */}
          {mode === "inspect" && bridge.drag && (
            <>
              <DragGhost rect={bridge.drag.ghost} />
              {bridge.drag.target && (
                <InsertLine line={bridge.drag.target.line} axis={bridge.drag.target.axis} />
              )}
            </>
          )}

          {/* "AI is working" placeholder — a shimmer block where a component is being
              built, or an animated gradient over the whole preview for page work. Last
              in the overlay so it sits above selection/insert chrome while generating. */}
          {skeleton?.mode === "block" && <AiSkeletonBlock rect={skeleton.rect} label={skeleton.label} />}
          {skeleton?.mode === "page" && <AiSkeletonPage label={skeleton.label} />}
        </div>
      </div>

      {/* Comment pins + composer/threads — screen-space so they stay a constant size. */}
      {mode === "comment" && comments && (
        <CommentsLayer {...comments} zoom={zoom} />
      )}

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

      {/* The one canvas toolbar — modes + zoom + bridge status. Owned by the
          canvas, so it survives the Design→Comments panel swap. */}
      <CanvasToolbar
        mode={mode}
        onModeChange={onModeChange}
        zoom={zoom}
        onZoomBy={onZoomBy}
        onZoomReset={onZoomReset}
        bridgeReady={bridge.ready}
        bridgeError={bridge.error}
      />

      {/* Notices sit ABOVE the toolbar (which owns bottom-3), stacked in one column
          so a second notice pushes the first up instead of drawing over it. */}
      <div className="pointer-events-none absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {bridge.error && (
          <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-3 py-1.5 text-[11px] text-vs-text-secondary shadow">
            {/* Same sentence the toolbar shows as its disabled reason — one source. */}
            {bridgeStatusMessage("failed", bridge.error)}
          </div>
        )}

        {bridge.selectionLost && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-vs-border-default bg-vs-bg-elevated px-3 py-1.5 text-[11px] text-vs-text-secondary shadow">
            The element you were editing was removed by a live reload — pick another to keep going.
            <button
              className="rounded px-1.5 py-0.5 text-vs-text-primary hover:bg-vs-bg-hover"
              onClick={() => bridge.clearSelectionLost()}
            >
              Dismiss
            </button>
          </div>
        )}

        {bridge.placeholderLost && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-vs-border-default bg-vs-bg-elevated px-3 py-1.5 text-[11px] text-vs-text-secondary shadow">
            {bridge.placeholderLost}
            <button
              className="rounded px-1.5 py-0.5 text-vs-text-primary hover:bg-vs-bg-hover"
              onClick={() => bridge.clearPlaceholderLost()}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
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
  label,
  showHandles = false,
  zoom = 1,
  onLiveEdit,
  onCommitEdit,
  onDragRect,
  onDragEnd,
}: {
  rect: Rect;
  kind: "hover" | "select";
  /** The element/component name shown on the selection badge (Figma-style). */
  label?: string;
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
      // Capture the pointer so the drag survives the cursor passing over the guest
      // <webview> (which would otherwise swallow move/up and strand the drag).
      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* capture unsupported */
      }
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
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("lostpointercapture", up);
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
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
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("lostpointercapture", up);
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
      {kind === "select" && label && (
        <span className="absolute -top-5 left-0 max-w-[240px] truncate whitespace-nowrap rounded bg-vs-accent px-1.5 py-px text-[10px] font-medium text-white">
          {label}
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

/** The insertion line drawn across the flow axis at the current slot (guest coords). */
function InsertLine({
  line,
  axis,
}: {
  line: { x1: number; y1: number; x2: number; y2: number };
  axis: "row" | "column";
}): JSX.Element {
  // Row flow (items horizontal) → a vertical divider; column flow → horizontal.
  const vertical = axis === "row";
  const left = Math.min(line.x1, line.x2);
  const top = Math.min(line.y1, line.y2);
  const length = vertical ? Math.abs(line.y2 - line.y1) : Math.abs(line.x2 - line.x1);
  return (
    <div
      data-testid="insert-line"
      data-axis={axis}
      className="pointer-events-none absolute z-10 rounded-full"
      style={{
        left: vertical ? left - 1.5 : left,
        top: vertical ? top : top - 1.5,
        width: vertical ? 3 : length,
        height: vertical ? length : 3,
        background: "var(--color-vs-accent)",
        boxShadow: "0 0 0 1px rgba(124,111,240,0.35)",
      }}
    />
  );
}

/** A faint ghost of the dragged element trailing the pointer during a drag-move (§5.4). */
function DragGhost({ rect }: { rect: Rect }): JSX.Element {
  return (
    <div
      data-testid="drag-ghost"
      className="pointer-events-none absolute z-10 rounded"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: "rgba(124,111,240,0.12)",
        border: "1.5px solid var(--color-vs-accent)",
        opacity: 0.85,
      }}
    />
  );
}

/** The resize handles for placement — n/w edges omitted (they'd fight the anchor). */
const PLACEHOLDER_HANDLES: { dir: "e" | "s" | "se"; style: React.CSSProperties }[] = [
  { dir: "e", style: { right: -4, top: "calc(50% - 4px)", cursor: "ew-resize" } },
  { dir: "s", style: { left: "calc(50% - 4px)", bottom: -4, cursor: "ns-resize" } },
  { dir: "se", style: { right: -4, bottom: -4, cursor: "nwse-resize" } },
];

/** The composition placeholder overlay: an outline over the guest's real placeholder,
 *  with e/s/se handles whose drags stream a soft size hint to the guest. */
function PlaceholderBox({
  rect,
  zoom,
  onResize,
}: {
  rect: Rect;
  zoom: number;
  onResize: (size: { width?: number; height?: number }) => void;
}): JSX.Element {
  function startResize(dir: "e" | "s" | "se") {
    return (e: React.PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      // Capture so the drag survives the cursor moving over the guest <webview>.
      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* capture unsupported */
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const w0 = rect.width;
      const h0 = rect.height;
      const move = (ev: PointerEvent): void => {
        // Client-px delta ÷ zoom = guest-px delta (the stage is scaled).
        const width = dir !== "s" ? Math.max(24, Math.round(w0 + (ev.clientX - startX) / zoom)) : undefined;
        const height = dir !== "e" ? Math.max(24, Math.round(h0 + (ev.clientY - startY) / zoom)) : undefined;
        onResize({ width, height });
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
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("lostpointercapture", up);
    };
  }
  return (
    <div
      data-testid="placeholder-box"
      className="absolute"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, outline: "2px solid var(--color-vs-accent)", outlineOffset: -1 }}
    >
      {PLACEHOLDER_HANDLES.map((h) => (
        <span
          key={h.dir}
          onPointerDown={startResize(h.dir)}
          className="pointer-events-auto absolute h-2 w-2 rounded-[2px] border border-white bg-vs-accent"
          style={h.style}
        />
      ))}
    </div>
  );
}
