import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Drive startRun without spawning a real `claude`: the adapter is a controllable
// EventEmitter whose `start` is a no-op, so we can emit `exit` by hand.
const adapters: FakeAdapter[] = [];
class FakeAdapter extends EventEmitter {
  canceled = false;
  start = vi.fn();
  cancel = vi.fn(() => {
    this.canceled = true;
  });
  constructor() {
    super();
    adapters.push(this);
  }
}
vi.mock("./adapter", () => ({ AgentAdapter: FakeAdapter }));
vi.mock("./run-recorder", () => ({
  newAccumulator: () => ({ files: new Set(), isError: false }),
  recordRun: vi.fn(async () => undefined),
}));

// Import after the mocks are registered.
const { startRun, hasActiveRun } = await import("./run-manager");

function fakeSender(): { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean } {
  return { send: vi.fn(), isDestroyed: () => false };
}
const OPTS = (cwd: string) => ({ prompt: "p", cwd, bypassPermissions: true }) as never;

describe("hasActiveRun", () => {
  beforeEach(() => {
    adapters.length = 0;
  });

  it("reports true only for a project with a run in flight", () => {
    expect(hasActiveRun("/proj/a")).toBe(false);
    startRun(fakeSender() as never, OPTS("/proj/a"));
    expect(hasActiveRun("/proj/a")).toBe(true);
    // A different project is unaffected.
    expect(hasActiveRun("/proj/b")).toBe(false);
  });

  it("clears when the run exits", () => {
    startRun(fakeSender() as never, OPTS("/proj/c"));
    expect(hasActiveRun("/proj/c")).toBe(true);
    // The adapter that was just created for this run emits its terminal event.
    adapters[adapters.length - 1].emit("event", { kind: "exit", code: 0 });
    expect(hasActiveRun("/proj/c")).toBe(false);
  });
});
