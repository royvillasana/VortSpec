/**
 * Who writes the file (OpenSpec change: live-playground, task 5.1).
 *
 * Every participant holds the same converged document, so every participant could write it — and if
 * they all do, the file is written N times with identical content and N git working trees show a
 * change nobody made. So exactly one participant writes while a session is live.
 *
 * The election is the lowest client id present. It needs no negotiation, no messages, and no tie
 * breaking: every participant sees the same awareness map and computes the same answer, so they
 * agree without ever discussing it. When that participant leaves, their id leaves the map and the
 * next-lowest becomes the writer on the very next tick — re-election is a consequence of the rule
 * rather than a procedure that has to run.
 *
 * The rule that matters more than the election: **not being the writer is not permission to lose
 * work.** A participant who leaves writes on the way out regardless, because the alternative is
 * losing an afternoon when the elected writer's laptop closes first. Writing the same converged
 * content twice is harmless; not writing it once is not.
 */

/**
 * The elected writer among the client ids currently present, or null when there are none.
 *
 * Deliberately a pure function of the ids: any state that had to be exchanged (a "who wants to
 * write" round, a lease, a heartbeat) is state that can disagree between participants, and two
 * participants who disagree about the writer either both write or neither does.
 */
export function electWriter(clientIds: readonly number[]): number | null {
  let lowest: number | null = null;
  for (const id of clientIds) {
    if (!Number.isFinite(id)) continue;
    if (lowest === null || id < lowest) lowest = id;
  }
  return lowest;
}

/**
 * Whether this client should write the file right now.
 *
 * True when no session is live — a solo editor is always their own writer, which is what keeps the
 * feature absent rather than merely quiet for the projects that never configure a relay.
 */
export function shouldWrite(input: {
  /** Whether a live session is currently connected. */
  live: boolean;
  /** Client ids in the session, including this one. Empty when not live. */
  clientIds: readonly number[];
  /** This client's id in the session. */
  myClientId: number | null;
}): boolean {
  if (!input.live) return true;
  if (input.myClientId === null) return true; // no identity yet — behave as if solo rather than mute
  const writer = electWriter(input.clientIds);
  return writer === null || writer === input.myClientId;
}

/**
 * Whether this client should write on the way out, having been a passenger until now.
 *
 * Always true when it holds unsaved work. Being the wrong participant is not a reason to leave with
 * an afternoon's editing only in other people's memory.
 */
export function shouldWriteOnLeave(hasUnpersistedEdits: boolean): boolean {
  return hasUnpersistedEdits;
}
