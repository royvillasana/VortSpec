import type { JSX } from "react";
import type { Rect } from "@vortspec/core/ipc";
import { resolveCursor, type Participant } from "../../lib/live-presence";

/**
 * Other people's cursors on the canvas (OpenSpec change: live-playground, task 2.5).
 *
 * Each cursor arrives as an element plus a fraction within it, and is resolved HERE against where
 * that element sits on this screen — the rects come from the same `watchAnchors`/`anchorRects` stream
 * the comment pins use, which re-emits on scroll, resize and re-render. So a cursor follows its
 * element instead of drifting off it, and points at the same thing for someone previewing the page
 * at a different width.
 *
 * This layer renders inside the canvas's transformed box, where guest coordinates map 1:1, so there
 * is no manual conversion to get wrong.
 */
export interface RemoteCursorsProps {
  peers: readonly Participant[];
  /** Element fingerprint → its rect on this screen, or null when it is not currently rendered. */
  anchorRects: Record<string, Rect | null>;
}

export function RemoteCursors({ peers, anchorRects }: RemoteCursorsProps): JSX.Element | null {
  const placed = peers
    .map((peer) => ({ peer, point: peer.cursor ? resolveCursor(peer.cursor, anchorRects[peer.cursor.fp]) : null }))
    // A cursor whose element is not on screen is not drawn at all. Falling back to the origin would
    // park a stranger's cursor in the corner of the page, which reads as a bug rather than as absence.
    .filter((entry): entry is { peer: Participant; point: { x: number; y: number } } => entry.point !== null);

  if (placed.length === 0) return null;

  return (
    <div
      data-vs-overlay=""
      data-testid="remote-cursors"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      {placed.map(({ peer, point }) => (
        <div
          key={peer.clientId}
          data-testid={`remote-cursor-${peer.clientId}`}
          className="absolute will-change-transform"
          // Transitioned so a cursor arriving at 20 updates a second glides instead of teleporting;
          // short enough that it still reads as live.
          style={{ transform: `translate(${point.x}px, ${point.y}px)`, transition: "transform 80ms linear" }}
        >
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true">
            <path d="M1 1L12.5 12.5H6.5L1 18V1Z" fill={peer.color} stroke="white" strokeWidth="1.2" />
          </svg>
          <span
            className="ml-2.5 -mt-1 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm"
            style={{ background: peer.color }}
          >
            {peer.name}
          </span>
          {/* A comment being typed, under the cursor writing it (task 4.1). Shown while it is a
              draft and gone the moment it is abandoned — nothing is stored until it is posted. */}
          {peer.draft && (
            <div
              data-testid={`remote-draft-${peer.clientId}`}
              className="ml-2.5 mt-1 max-w-64 rounded-md bg-neutral-900/95 px-2 py-1.5 text-[11px] leading-snug text-neutral-100 shadow-lg ring-1"
              style={{ borderLeft: `2px solid ${peer.color}` }}
            >
              {peer.draft}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
