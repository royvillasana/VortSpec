import type { JSX } from "react";
import type { LiveSessionState } from "../../lib/useLiveSession";
import { presenceColor, presenceName } from "../../lib/live-presence";

/**
 * How many people are on this page, in the Playground header (change: live-playground, task 2.6).
 *
 * Renders NOTHING unless somebody else is actually here. Not when no session is configured (the state
 * almost every project is in), and not when connected but alone — an indicator that says "1 here" to
 * a person editing by themselves is furniture, and it tells them about plumbing rather than about
 * anyone. Presence UI should appear because a PERSON appeared.
 *
 * `unreachable` is the exception: a relay that was configured and cannot be reached is worth saying,
 * because edits still save but nobody else will see them, and silence there looks like working.
 */
export interface LiveParticipantsProps {
  session: LiveSessionState;
  /**
   * The session holds edits this machine has not written to the project file (task 5.3). Live
   * propagation is not durability: an edit reaches everyone instantly and exists only in memory and
   * in the relay until somebody persists and commits it. A session where everyone closes their
   * laptop is an afternoon gone, so it must be hard to leave one without noticing.
   */
  unpersisted?: boolean;
}

export function LiveParticipants({ session, unpersisted }: LiveParticipantsProps): JSX.Element | null {
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

  // Connecting is plumbing, and alone is not news: both stay silent.
  if (session.status === "connecting") return null;

  const others = session.peers.length;
  if (others === 0) return null;
  return (
    <span
      data-testid="live-participants"
      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-neutral-300"
      title={
        unpersisted
          ? `${session.peers.map((p) => presenceName(p.name)).join(", ")} — this session has edits not yet written to the project file`
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
      {unpersisted && (
        <span data-testid="live-unpersisted" className="flex items-center gap-1 text-amber-400">
          <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          unsaved
        </span>
      )}
    </span>
  );
}
