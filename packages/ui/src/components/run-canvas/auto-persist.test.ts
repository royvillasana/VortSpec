import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createAutoPersist } from "./auto-persist";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAutoPersist", () => {
  it("debounces a burst of edits into a single write", async () => {
    const persist = vi.fn(async () => {});
    const ap = createAutoPersist({ persist, debounceMs: 400 });
    ap.schedule();
    ap.schedule();
    ap.schedule();
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(persist).toHaveBeenCalledTimes(1); // one write for the whole burst
  });

  it("flush persists immediately, bypassing the debounce", async () => {
    const persist = vi.fn(async () => {});
    const ap = createAutoPersist({ persist });
    ap.schedule();
    ap.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("is single-flight: an edit during a write queues exactly one follow-up", async () => {
    let resolve!: () => void;
    const persist = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const ap = createAutoPersist({ persist, debounceMs: 10 });

    ap.schedule();
    await vi.advanceTimersByTimeAsync(10); // first write starts, now in-flight
    expect(persist).toHaveBeenCalledTimes(1);
    expect(ap.busy).toBe(true);

    // Two more edits arrive mid-write → collapse into ONE queued follow-up.
    ap.flush();
    ap.flush();
    expect(persist).toHaveBeenCalledTimes(1); // still just the in-flight one

    resolve(); // finish the first write → the single follow-up fires (now in-flight)
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(ap.busy).toBe(true); // the follow-up is on the wire

    resolve(); // finish the follow-up
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2); // no third — only ONE follow-up was queued
    expect(ap.busy).toBe(false);
  });

  it("surfaces a rejection via onError and keeps running", async () => {
    const onError = vi.fn();
    const persist = vi.fn(async () => {
      throw new Error("write failed");
    });
    const ap = createAutoPersist({ persist, onError, debounceMs: 5 });
    ap.schedule();
    await vi.advanceTimersByTimeAsync(5);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ap.busy).toBe(false); // recovered — a later edit can still persist
  });

  it("dispose cancels a pending write", async () => {
    const persist = vi.fn(async () => {});
    const ap = createAutoPersist({ persist, debounceMs: 400 });
    ap.schedule();
    ap.dispose();
    await vi.advanceTimersByTimeAsync(400);
    expect(persist).not.toHaveBeenCalled();
  });
});
