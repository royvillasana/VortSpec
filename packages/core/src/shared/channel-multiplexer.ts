/**
 * One transport listener per channel, however many subscribers there are.
 *
 * The preload used to attach a listener per subscriber. That is correct — every subscriber also
 * unsubscribes — but it does not scale: `useAgentRun` alone has 21 call sites, each subscribing to two
 * channels on mount, and eleven mounted at once crossed Node's default 10-listener ceiling. The warning
 * that produced reads as a leak and is not one, which is the worst kind of warning: it invites raising
 * the ceiling, which hides the symptom and leaves listeners growing with component count.
 *
 * Multiplexing makes the listener count a property of the CHANNELS (a fixed, small number) rather than of
 * the UI's shape. Kept transport-agnostic and pure so it can be tested without Electron.
 */

/** Attaches a raw transport listener for a channel. Mirrors `ipcRenderer.on`. */
export type Attach = (channel: string, listener: (payload: unknown) => void) => void;

export interface Multiplexer {
  /** Add a subscriber; returns its unsubscribe. */
  subscribe: <T>(channel: string, callback: (payload: T) => void) => () => void;
  /** Subscriber count for a channel — for tests and diagnostics. */
  count: (channel: string) => number;
  /** Channels that have had a transport listener attached. */
  channels: () => string[];
}

export function createMultiplexer(attach: Attach): Multiplexer {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>();

  return {
    subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
      let set = subscribers.get(channel);
      if (!set) {
        set = new Set();
        subscribers.set(channel, set);
        attach(channel, (payload) => {
          // Snapshot before dispatching: a subscriber may unsubscribe (or subscribe) while handling, and
          // mutating the Set mid-iteration would silently skip its neighbour.
          for (const subscriber of [...(subscribers.get(channel) ?? [])]) {
            try {
              subscriber(payload);
            } catch {
              // One subscriber throwing must not starve the rest — they are unrelated components
              // sharing a channel, not a chain.
            }
          }
        });
      }
      const entry = callback as (payload: unknown) => void;
      set.add(entry);
      return () => {
        // The transport listener stays attached even when the last subscriber leaves: it is one of a
        // handful, and tearing it down per mount/unmount cycle would be churn for no benefit.
        subscribers.get(channel)?.delete(entry);
      };
    },
    count: (channel) => subscribers.get(channel)?.size ?? 0,
    channels: () => [...subscribers.keys()],
  };
}
