import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the argv the adapter would spawn `claude` with, without a real process.
const spawnCalls: { cmd: string; args: string[] }[] = [];
vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    spawnCalls.push({ cmd, args });
    return {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    };
  },
}));

import { AgentAdapter } from "./adapter";

function argsFor(opts: Parameters<AgentAdapter["start"]>[0]): string[] {
  spawnCalls.length = 0;
  new AgentAdapter().start(opts);
  return spawnCalls.at(-1)!.args;
}

describe("AgentAdapter arg construction", () => {
  beforeEach(() => (spawnCalls.length = 0));

  it("spawns the user's `claude` non-bare, never with --bare", () => {
    spawnCalls.length = 0;
    new AgentAdapter().start({ prompt: "do it", cwd: "/p" });
    expect(spawnCalls.at(-1)!.cmd).toBe("claude");
    expect(argsFor({ prompt: "do it", cwd: "/p" })).not.toContain("--bare");
  });

  it("passes --strict-mcp-config only when strictMcp is set", () => {
    expect(argsFor({ prompt: "p", cwd: "/p", strictMcp: true })).toContain("--strict-mcp-config");
    expect(argsFor({ prompt: "p", cwd: "/p" })).not.toContain("--strict-mcp-config");
  });

  it("passes --model only when a model is set", () => {
    const withModel = argsFor({ prompt: "p", cwd: "/p", model: "sonnet" });
    expect(withModel).toContain("--model");
    expect(withModel[withModel.indexOf("--model") + 1]).toBe("sonnet");
    expect(argsFor({ prompt: "p", cwd: "/p" })).not.toContain("--model");
  });

  it("maps bypassPermissions to --dangerously-skip-permissions", () => {
    expect(argsFor({ prompt: "p", cwd: "/p", bypassPermissions: true })).toContain(
      "--dangerously-skip-permissions",
    );
  });

  it("always requests the stream-json contract", () => {
    const args = argsFor({ prompt: "p", cwd: "/p" });
    expect(args.slice(0, 2)).toEqual(["-p", "p"]);
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  });
});
