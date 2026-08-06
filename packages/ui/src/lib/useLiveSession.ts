/**
 * Joining and leaving a live session (OpenSpec change: live-playground, task 2.3).
 *
 * The default is not to connect. A session happens only when all of these hold, and any one of them
 * missing is a normal, silent no-op rather than an error to report:
 *
 * - the page is a LIGHT page (framework pages are never live — their edits are codemods into `.tsx`,
 *   a different problem with a different failure mode),
 * - the project has a relay address committed to it,
 * - the project has a git remote, which is what a room is named after.
 *
 * A default install of the app, opening a project nobody has configured, therefore connects to
 * nothing. That is a requirement of the change, not an implementation detail: this feature adds the
 * first persistent outbound connection to a product whose pitch is that it runs nothing.
 */
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { hasRelay, type CollabConfig } from "@vortspec/core/collab-config";
import { roomIdFor, sha256Hex } from "@vortspec/core/live-session";
import {
  participantCount,
  participantsFrom,
  presenceColor,
  type CursorAnchor,
  type Participant,
} from "./live-presence";

/** What the Playground can say about the session, and why it is not live when it is not. */
export type LiveSessionState = {
  /** `off` = nothing configured (the normal state). Never render `off` as a problem. */
  status: "off" | "connecting" | "live" | "unreachable";
  /** A sentence for the user when the status is `unreachable`; empty otherwise. */
  detail: string;
  /** How many people are in the session, including this one. 0 when not live. */
  participants: number;
  /** Everyone else, with their cursors. Empty when not live — never render your own. */
  peers: Participant[];
  /**
   * The relay has sent whatever it already had for this room. Until this is true, an empty document
   * means "not yet told", not "nobody has this page" — seeding before it would overwrite everyone
   * else's work with the file on disk.
   */
  synced: boolean;
  /** Client ids in the session, including this one. Empty when not live. */
  clientIds: number[];
  /** This client's id, or null before the session has one. */
  myClientId: number | null;
};

export const offSession: LiveSessionState = {
  status: "off",
  detail: "",
  participants: 0,
  peers: [],
  synced: false,
  clientIds: [],
  myClientId: null,
};

export type LiveSessionInput = {
  /** The CRDT for the page — the host replica. Null when the page is not adopted. */
  doc: Y.Doc | null;
  /** The project's committed relay address, or null while unknown. */
  config: CollabConfig | null;
  /** The credential this machine holds for that relay ("" when none — the relay may be open). */
  credential: string;
  /** The project's git remote; "" when it has none, which means no session. */
  remote: string;
  /** The light page's name; null when the Playground is not on a light page. */
  page: string | null;
  /** This user's display name, from their profile. */
  name: string;
  /** This user's pointer in document terms, or null when it is off the page. */
  cursor: CursorAnchor | null;
};

/**
 * Whether a session should be joined at all.
 *
 * Extracted from the effect and exported so the load-bearing rule — "a default install connects to
 * nothing" — is a thing that can be asserted, rather than a condition inside a hook that no test
 * reaches. Each clause is a supported, silent state, not an error.
 */
export type JoinableSession = LiveSessionInput & { doc: Y.Doc; page: string; config: CollabConfig };

export function shouldJoin(input: LiveSessionInput): input is JoinableSession {
  const { doc, config, remote, page } = input;
  if (!doc) return false; // the page is not adopted — nothing to share
  if (!page) return false; // not on a light page; framework pages are never live
  if (!hasRelay(config)) return false; // no relay configured, or one that is not usable
  if (!remote.trim()) return false; // no git remote — a room has nothing to be named after
  return true;
}

/**
 * Connect the page's document to the team's relay for as long as the inputs hold, and disconnect
 * cleanly when they stop holding. Returns what the Playground needs to show.
 */
export function useLiveSession(input: LiveSessionInput): LiveSessionState {
  const { doc, config, credential, remote, page } = input;
  const [state, setState] = useState<LiveSessionState>(offSession);
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!shouldJoin(input)) {
      setState(offSession);
      return;
    }

    let alive = true;
    let provider: HocuspocusProvider | null = null;
    setState({ ...offSession, status: "connecting" });

    void roomIdFor(remote, input.page, sha256Hex)
      .then((room) => {
        if (!alive || !room) return;
        provider = new HocuspocusProvider({
          url: input.config.relayUrl,
          name: room,
          document: input.doc,
          token: credential || undefined,
          // The document is seeded from the file by whoever opened the page first; the provider's
          // job here is only transport.
          onSynced: () => {
            if (alive) setState((prev) => ({ ...prev, synced: true }));
          },
          onStatus: ({ status }) => {
            if (!alive) return;
            setState((prev) =>
              status === "connected"
                ? { ...prev, status: "live", detail: "" }
                : { ...prev, status: prev.status === "live" ? "unreachable" : prev.status },
            );
          },
          onAuthenticationFailed: ({ reason }) => {
            if (!alive) return;
            setState({
              status: "unreachable",
              // Named precisely: "cannot connect" would send someone to debug their network when the
              // actual fix is a credential this machine does not have.
              detail: credential
                ? `The relay rejected this machine's credential (${reason || "not accepted"}).`
                : "This relay requires a credential and this machine has none stored.",
              participants: 0,
              peers: [],
              synced: false,
              clientIds: [],
              myClientId: null,
            });
          },
          onDisconnect: () => {
            if (!alive) return;
            setState({
              status: "unreachable",
              detail: "The relay is not reachable. Your edits are still saved to the project.",
              participants: 0,
              peers: [],
              synced: false,
              clientIds: [],
              myClientId: null,
            });
          },
        });
        providerRef.current = provider;

        // Presence is awareness state, not document content: replicated to peers, dropped
        // automatically on disconnect, and never written to the project. "Presence disappears when
        // someone leaves" is therefore true by construction rather than by cleanup code.
        provider.setAwarenessField("presence", {
          name: input.name,
          color: presenceColor(input.name),
          cursor: input.cursor,
        });

        provider.on("awarenessChange", () => {
          if (!alive || !provider) return;
          const states = provider.awareness?.getStates();
          if (!states) return;
          setState((prev) =>
            prev.status === "live"
              ? {
                  ...prev,
                  participants: participantCount(states),
                  peers: participantsFrom(states, provider!.document.clientID),
                  clientIds: [...states.keys()],
                  myClientId: provider!.document.clientID,
                }
              : prev,
          );
        });
      })
      .catch(() => {
        if (alive) setState({
              status: "unreachable",
              detail: "The session could not be started.",
              participants: 0,
              peers: [],
              synced: false,
              clientIds: [],
              myClientId: null,
            });
      });

    return () => {
      alive = false;
      provider?.destroy();
      providerRef.current = null;
    };
  }, [doc, config, credential, remote, page]);

  // The cursor changes constantly; the connection must not. Publishing it in its own effect keeps a
  // pointer move from tearing down and rebuilding the session twenty times a second.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.setAwarenessField("presence", {
      name: input.name,
      color: presenceColor(input.name),
      cursor: input.cursor,
    });
  }, [input.name, input.cursor]);

  return state;
}
