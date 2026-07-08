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

// An in-memory stand-in for the last-run.json persistence so getLastRun logic
// can be exercised without touching the filesystem.
const lastRuns = new Map<string, Record<string, unknown>>();
vi.mock("./run-recorder", () => ({
  newAccumulator: () => ({ files: new Set(), isError: false }),
  recordRun: vi.fn(async () => undefined),
  runTitle: (p: string) => p.slice(0, 20),
  patchLastRun: vi.fn(async (cwd: string, patch: Record<string, unknown>) => {
    lastRuns.set(cwd, { ...(lastRuns.get(cwd) ?? {}), ...patch });
  }),
  readLastRun: vi.fn(async (cwd: string) => lastRuns.get(cwd) ?? null),
}));

// Import after the mocks are registered.
const { startRun, hasActiveRun, cancelRun, getLastRun } = await import("./run-manager");

function fakeSender(): { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean } {
  return { send: vi.fn(), isDestroyed: () => false };
}
const OPTS = (cwd: string) => ({ prompt: "p", cwd, bypassPermissions: true }) as never;

describe("hasActiveRun", () => {
  beforeEach(() => {
    adapters.length = 0;
    lastRuns.clear();
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

describe("getLastRun", () => {
  beforeEach(() => {
    adapters.length = 0;
    lastRuns.clear();
  });

  it("returns null while a run is genuinely in flight", async () => {
    startRun(fakeSender() as never, OPTS("/proj/d"));
    // Persisted "running" + a live process → the in-flight banner covers it, not resume.
    expect(await getLastRun("/proj/d")).toBeNull();
  });

  it("returns null after a successful run", async () => {
    startRun(fakeSender() as never, OPTS("/proj/e"));
    adapters[adapters.length - 1].emit("event", { kind: "exit", code: 0 });
    expect(await getLastRun("/proj/e")).toBeNull();
  });

  it("offers a resumable record after a cancel", async () => {
    startRun(fakeSender() as never, OPTS("/proj/f"));
    const a = adapters[adapters.length - 1];
    a.emit("event", { kind: "system-init", tools: [], mcpServers: [], mcpErrors: [], sessionId: "sess-x" });
    a.emit("event", { kind: "exit", code: null }); // cancel
    const last = await getLastRun("/proj/f");
    expect(last?.status).toBe("cancelled");
    expect(last?.sessionId).toBe("sess-x");
  });
});
