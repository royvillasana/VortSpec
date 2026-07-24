import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecResult } from "../util/exec";

// Mock the spawn helper so we can drive `claude mcp list` / `claude mcp add`
// outputs without a real Claude Code install.
vi.mock("../util/exec", () => ({ execFileSafe: vi.fn() }));
import { execFileSafe } from "../util/exec";
import { verifyFigmaMcp, addFigmaMcp, REMOTE_FIGMA_MCP_ARGS } from "./env-manager";

const mocked = vi.mocked(execFileSafe);
const result = (over: Partial<ExecResult> = {}): ExecResult => ({
  code: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  ...over,
});

beforeEach(() => mocked.mockReset());

describe("verifyFigmaMcp", () => {
  it("reports a missing MCP as an actionable figma-add fix (not a docs link)", async () => {
    mocked.mockResolvedValueOnce(result({ stdout: "some-other-server: connected\n" }));
    const c = await verifyFigmaMcp();
    expect(c.status).toBe("unknown");
    expect(c.fix?.kind).toBe("figma-add"); // runs the install, not an install-link URL
    expect(c.fix?.url).toBeUndefined();
  });

  it("reports connected as pass", async () => {
    mocked.mockResolvedValueOnce(result({ stdout: "figma: https://mcp.figma.com/mcp - ✔ connected\n" }));
    expect((await verifyFigmaMcp()).status).toBe("pass");
  });

  it("reports configured-but-unauthed as fail", async () => {
    mocked.mockResolvedValueOnce(result({ stdout: "figma: https://mcp.figma.com/mcp - needs authentication\n" }));
    const c = await verifyFigmaMcp();
    expect(c.status).toBe("fail");
    expect(c.fix?.kind).toBe("verify"); // OAuth is interactive → re-verify after
  });
});

describe("addFigmaMcp", () => {
  it("runs the documented `claude mcp add … figma …`, then re-verifies", async () => {
    mocked
      .mockResolvedValueOnce(result({ stdout: "Added figma" })) // the add
      .mockResolvedValueOnce(result({ stdout: "figma: … - needs authentication" })); // the re-verify
    const c = await addFigmaMcp();
    // First call is the add, with exactly the documented args.
    expect(mocked.mock.calls[0]?.[0]).toBe("claude");
    expect(mocked.mock.calls[0]?.[1]).toEqual([...REMOTE_FIGMA_MCP_ARGS]);
    // A freshly-added server needs auth until the user completes /mcp → Authenticate.
    expect(c.status).toBe("fail");
  });

  it("treats 'already exists' as success and reports the real state", async () => {
    mocked
      .mockResolvedValueOnce(result({ code: 1, stderr: "MCP server figma already exists in config" }))
      .mockResolvedValueOnce(result({ stdout: "figma: … - ✔ connected" }));
    expect((await addFigmaMcp()).status).toBe("pass"); // not a failure — re-verify wins
  });

  it("surfaces a real add failure as fail with the figma-add fix", async () => {
    mocked.mockResolvedValueOnce(result({ code: 1, stderr: "network error reaching registry" }));
    const c = await addFigmaMcp();
    expect(c.status).toBe("fail");
    expect(c.fix?.kind).toBe("figma-add");
  });

  it("handles Claude not being installed (spawn error)", async () => {
    mocked.mockResolvedValueOnce(result({ code: null, spawnError: "spawn claude ENOENT" }));
    const c = await addFigmaMcp();
    expect(c.status).toBe("unknown");
    expect(c.detail).toMatch(/installed and on PATH/i);
  });
});
