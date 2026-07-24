import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ExecResult } from "../util/exec";

vi.mock("../util/exec", () => ({ execFileSafe: vi.fn() }));
import { execFileSafe } from "../util/exec";
import { installClaudeCli, installGit, CLAUDE_PKG } from "./base-install";
import { MANAGED_DIR } from "./runtime-manager";

const mocked = vi.mocked(execFileSafe);
const result = (over: Partial<ExecResult> = {}): ExecResult => ({
  code: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  ...over,
});

const realPlatform = process.platform;
beforeEach(() => {
  mocked.mockReset();
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
});
afterEach(() => Object.defineProperty(process, "platform", { value: realPlatform, configurable: true }));

describe("installClaudeCli", () => {
  it("installs the official package into the managed prefix (no sudo), then verifies", async () => {
    mocked
      .mockResolvedValueOnce(result({ stdout: "added 1 package" })) // npm install
      .mockResolvedValueOnce(result({ stdout: "1.2.3 (Claude Code)" })); // claude --version
    const c = await installClaudeCli();
    expect(mocked.mock.calls[0]?.[0]).toBe("npm");
    expect(mocked.mock.calls[0]?.[1]).toEqual(["install", "-g", CLAUDE_PKG, "--prefix", MANAGED_DIR]);
    expect(mocked.mock.calls.some((call) => call[0] === "sudo")).toBe(false);
    expect(c.status).toBe("pass");
  });

  it("reports a failed install with a retry fix", async () => {
    mocked.mockResolvedValueOnce(result({ code: 1, stderr: "network error reaching registry" }));
    const c = await installClaudeCli();
    expect(c.status).toBe("fail");
    expect(c.fix?.kind).toBe("run-install");
  });
});

describe("installGit", () => {
  it("triggers Apple Command Line Tools and passes when already installed", async () => {
    mocked
      .mockResolvedValueOnce(result({ stderr: "command line tools are already installed" })) // xcode-select --install
      .mockResolvedValueOnce(result({ stdout: "git version 2.39.0" })); // git --version
    const c = await installGit();
    expect(mocked.mock.calls[0]?.[0]).toBe("xcode-select");
    expect(mocked.mock.calls[0]?.[1]).toEqual(["--install"]);
    expect(mocked.mock.calls.some((call) => call[0] === "sudo")).toBe(false);
    expect(c.status).toBe("pass");
  });

  it("waits on the installer dialog when the tools aren't present yet", async () => {
    mocked.mockResolvedValueOnce(result({ stdout: "" })); // dialog launched
    const c = await installGit();
    expect(c.status).toBe("unknown");
    expect(c.detail).toMatch(/Command Line Tools/i);
    expect(c.fix?.kind).toBe("verify");
  });

  it("falls back to a link on non-macOS", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const c = await installGit();
    expect(c.status).toBe("fail");
    expect(c.fix?.kind).toBe("install-link");
    expect(mocked).not.toHaveBeenCalled();
  });
});
