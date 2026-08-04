import { describe, expect, it, vi } from "vitest";
import { createMultiplexer } from "./channel-multiplexer";

/**
 * The property under test is the one the warning was really about: the number of transport listeners
 * must depend on the number of CHANNELS, not on how many components happen to be mounted.
 */

function harness() {
  const attached: string[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  const mux = createMultiplexer((channel, listener) => {
    attached.push(channel);
    handlers.set(channel, listener);
  });
  return { mux, attached, emit: (channel: string, payload: unknown) => handlers.get(channel)?.(payload) };
}

describe("listener count follows channels, not components", () => {
  it("attaches once however many subscribe", () => {
    const { mux, attached } = harness();
    for (let i = 0; i < 21; i++) mux.subscribe("agent:event", () => {});
    expect(attached).toEqual(["agent:event"]);
    expect(mux.count("agent:event")).toBe(21);
  });

  it("attaches once per distinct channel", () => {
    const { mux, attached } = harness();
    mux.subscribe("a", () => {});
    mux.subscribe("b", () => {});
    mux.subscribe("a", () => {});
    expect(attached.sort()).toEqual(["a", "b"]);
  });

  it("does not re-attach after every subscriber leaves and a new one arrives", () => {
    // Re-attaching per mount/unmount cycle would be churn, and would reintroduce growth under a
    // component that mounts and unmounts repeatedly.
    const { mux, attached } = harness();
    const off = mux.subscribe("a", () => {});
    off();
    mux.subscribe("a", () => {});
    expect(attached).toEqual(["a"]);
  });
});

describe("dispatch reaches every subscriber", () => {
  it("fans one payload out to all of them", () => {
    const { mux, emit } = harness();
    const seen: number[] = [];
    mux.subscribe<number>("a", (p) => seen.push(p * 1));
    mux.subscribe<number>("a", (p) => seen.push(p * 2));
    emit("a", 5);
    expect(seen).toEqual([5, 10]);
  });

  it("stops delivering to an unsubscribed callback, and only that one", () => {
    const { mux, emit } = harness();
    const seen: string[] = [];
    const off = mux.subscribe("a", () => seen.push("first"));
    mux.subscribe("a", () => seen.push("second"));
    off();
    emit("a", null);
    expect(seen).toEqual(["second"]);
  });

  it("does not deliver across channels", () => {
    const { mux, emit } = harness();
    const fn = vi.fn();
    mux.subscribe("a", fn);
    emit("b", 1);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("one subscriber cannot break the others", () => {
  it("keeps dispatching after a throw", () => {
    // These are unrelated components sharing a channel, not a chain — one failing must not starve
    // whoever was registered behind it.
    const { mux, emit } = harness();
    const after = vi.fn();
    mux.subscribe("a", () => {
      throw new Error("subscriber blew up");
    });
    mux.subscribe("a", after);
    expect(() => emit("a", 1)).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it("survives a subscriber that unsubscribes mid-dispatch", () => {
    // Mutating the Set while iterating it would silently skip the next subscriber.
    const { mux, emit } = harness();
    const seen: string[] = [];
    const off = mux.subscribe("a", () => {
      seen.push("first");
      off();
    });
    mux.subscribe("a", () => seen.push("second"));
    emit("a", 1);
    expect(seen).toEqual(["first", "second"]);
    emit("a", 1);
    expect(seen).toEqual(["first", "second", "second"]);
  });
});
