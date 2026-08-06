import type { JSX } from "react";
import type { LiveSessionState } from "../../lib/useLiveSession";
import { presenceColor, presenceName } from "../../lib/live-presence";

/**
 * How many people are on this page, in the Playground header (change: live-playground, task 2.6).
 *
 * Renders NOTHING when no session is configured. That is the state almost every project is in, and
 * showing "1 person here" to someone editing alone would turn a feature they never asked for into
 * permanent furniture — worse, it would imply collaboration is switched on when nothing is connected.
 *
 * `unreachable` is shown, because a relay that was configured and cannot be reached is something the
 * user needs to know: their edits still save, but nobody else is seeing them.
 */
export interface LiveParticipantsProps {
  session: LiveSessionState;
}

export function LiveParticipants({ session }: LiveParticipantsProps): JSX.Element | null {
  if (session.status === "off") return null;

  if (session.status === "unreachable") {
    return (
      <span
        data-testid="live-participants"
        title={session.detail}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-amber-400"
      >
        <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
        Not live
      </span>
    );
  }

  if (session.status === "connecting") {
    return (
      <span data-testid="live-participants" className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400">
        <span className="size-1.5 rounded-full bg-neutral-500" aria-hidden="true" />
        Connecting…
      </span>
    );
  }

  // Live. Alone in the room is still worth showing once a session exists: it says the connection is
  // up and nobody else has arrived, which is different from not being connected.
  const others = session.peers.length;
  return (
    <span
      data-testid="live-participants"
      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-neutral-300"
      title={
        others === 0
          ? "You are the only one on this page"
          : session.peers.map((p) => presenceName(p.name)).join(", ")
      }
    >
      <span className="flex -space-x-1.5" aria-hidden="true">
        {session.peers.slice(0, 4).map((p) => (
          <span
            key={p.clientId}
            className="inline-flex size-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-neutral-900"
            style={{ background: p.color || presenceColor(p.name) }}
          >
            {presenceName(p.name).slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
      {session.participants} here
    </span>
  );
}
