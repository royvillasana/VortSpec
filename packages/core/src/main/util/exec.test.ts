import { describe, it, expect } from "vitest";
import { execFileSafe } from "./exec";

describe("execFileSafe", () => {
  it("resolves promptly with timedOut on a hanging process (does not wait for close)", async () => {
    const start = Date.now();
    const r = await execFileSafe("sleep", ["10"], { timeoutMs: 150 });
    const elapsed = Date.now() - start;
    expect(r.timedOut).toBe(true);
    // Must resolve near the timeout, never blocking on the child's exit.
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns stdout + exit code for a fast command", async () => {
    const r = await execFileSafe("node", ["-e", "process.stdout.write('hi')"], {
      timeoutMs: 5000,
    });
    expect(r.stdout).toBe("hi");
    expect(r.code).toBe(0);
    expect(r.timedOut).toBe(false);
  });

  it("reports a spawnError for a missing binary rather than hanging", async () => {
    const r = await execFileSafe("vortspec-no-such-binary-xyz", ["--version"], {
      timeoutMs: 1000,
    });
    expect(r.spawnError).toBeTruthy();
    expect(r.code).toBeNull();
  });
});
