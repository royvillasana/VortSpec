/**
 * Who else is here, and where their cursor is (OpenSpec change: live-playground, tasks 2.4–2.6).
 *
 * A cursor is stored as an ELEMENT and a fraction within it, never as a pixel. That is the whole
 * design, and it comes straight from the requirement: a cursor must point at the same element for
 * everyone, whatever size or zoom each person is viewing at. Two people previewing the same page at
 * desktop and mobile widths have genuinely different geometry — the same x/y is a different element —
 * so a shared pixel would put someone's cursor on the wrong thing while looking perfectly plausible.
 *
 * Anchoring to an element also means each viewer resolves the position locally, through the same
 * `watchAnchors`/`anchorRects` machinery the comment pins already use, which re-emits on scroll,
 * resize and re-render. A cursor therefore follows its element rather than drifting off it.
 *
 * All of this is ephemeral: presence lives in the CRDT's awareness channel, which is replicated to
 * peers and dropped when they disconnect. Nothing here is ever written to the project.
 */
import type { Rect } from "@vortspec/core/ipc";

/** Where someone's cursor is, in terms of the document rather than the screen. */
export type CursorAnchor = {
  /** The element's durable fingerprint — the same identity comment pins are anchored to. */
  fp: string;
  /** Position within that element's box, 0–1 on each axis. */
  fx: number;
  fy: number;
};

/** One other person in the session. */
export type Participant = {
  /** Stable per-connection id from the awareness channel. */
  clientId: number;
  name: string;
  color: string;
  cursor: CursorAnchor | null;
  /**
   * A comment being typed, shown under their cursor. Awareness state, so an abandoned draft leaves
   * nothing behind — it disappears when they clear it or disconnect, by construction rather than by
   * cleanup. Only POSTING writes anything, and that goes to the repo-backed comment store like every
   * other comment.
   */
  draft: string | null;
};

/** What this client publishes about itself. */
export type LocalPresence = {
  name: string;
  color: string;
  cursor: CursorAnchor | null;
  draft: string | null;
};

/**
 * A stable colour per person, derived from their name so that everyone sees the same person in the
 * same colour without anyone assigning colours. Two people who share a name share a colour, which is
 * a cosmetic collision rather than a correctness one.
 *
 * The palette avoids the canvas's own selection blue: a remote cursor that looks like your own
 * selection is worse than one in an unexpected colour.
 */
const PALETTE = [
  "#e8590c", // orange
  "#c2255c", // pink
  "#7048e8", // violet
  "#1098ad", // teal
  "#2f9e44", // green
  "#e67700", // amber
  "#9c36b5", // grape
  "#0b7285", // deep teal
] as const;

export function presenceColor(name: string): string {
  const key = name.trim() || "anonymous";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/** The name to show for someone who has not set one. Never render an empty label. */
export function presenceName(name: string): string {
  return name.trim() || "Someone";
}

/**
 * Where in an element a point falls, as fractions. Clamped, because a pointer can sit a pixel outside
 * the box it was hit-tested into and an unclamped fraction would place the cursor outside the element
 * for everyone else.
 */
export function anchorWithin(rect: Rect, x: number, y: number): { fx: number; fy: number } {
  const fx = rect.width > 0 ? (x - rect.x) / rect.width : 0;
  const fy = rect.height > 0 ? (y - rect.y) / rect.height : 0;
  return { fx: clamp01(fx), fy: clamp01(fy) };
}

/**
 * Resolve someone's cursor to a point in THIS viewer's canvas, given where their element is here.
 * Null when the element is not currently present — a cursor with nowhere to be is not drawn, rather
 * than drawn at the origin, which would put a stranger's cursor in the corner of the page.
 */
export function resolveCursor(anchor: CursorAnchor, rect: Rect | null | undefined): { x: number; y: number } | null {
  if (!rect) return null;
  return { x: rect.x + anchor.fx * rect.width, y: rect.y + anchor.fy * rect.height };
}

/** Every fingerprint that needs a rect for the cursors currently on screen, deduplicated. */
export function cursorFingerprints(participants: readonly Participant[]): string[] {
  const seen = new Set<string>();
  for (const p of participants) if (p.cursor) seen.add(p.cursor.fp);
  return [...seen];
}

/**
 * Turn the awareness channel's raw states into the people to draw, excluding this client — you do not
 * render your own cursor; the operating system already does.
 */
export function participantsFrom(
  states: Map<number, unknown> | ReadonlyArray<[number, unknown]>,
  localClientId: number,
): Participant[] {
  const entries = states instanceof Map ? [...states.entries()] : [...states];
  const out: Participant[] = [];
  for (const [clientId, raw] of entries) {
    if (clientId === localClientId) continue;
    const presence = raw as { presence?: Partial<LocalPresence> } | undefined;
    const value = presence?.presence;
    if (!value) continue;
    out.push({
      clientId,
      name: presenceName(value.name ?? ""),
      color: value.color || presenceColor(value.name ?? ""),
      cursor: isCursor(value.cursor) ? value.cursor : null,
      draft: typeof value.draft === "string" && value.draft.trim() ? value.draft : null,
    });
  }
  // Stable order so cursors do not reshuffle in the DOM on every awareness tick.
  return out.sort((a, b) => a.clientId - b.clientId);
}

/**
 * How many people are in the session, counting this one. Taken from the size of the awareness map, so
 * it is right by construction — a disconnect removes the entry and the count follows.
 */
export function participantCount(states: Map<number, unknown> | ReadonlyArray<unknown>): number {
  return states instanceof Map ? states.size : states.length;
}

function isCursor(value: unknown): value is CursorAnchor {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<CursorAnchor>;
  return typeof c.fp === "string" && !!c.fp && typeof c.fx === "number" && typeof c.fy === "number";
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
