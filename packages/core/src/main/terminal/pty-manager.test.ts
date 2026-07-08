import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildShell,
  createSession,
  writeSession,
  resizeSession,
  killSession,
  killAllSessions,
  sessionCount,
} from "./pty-manager";
import type { WebContents } from "electron";

afterEach(() => killAllSessions());

describe("buildShell", () => {
  it("uses $SHELL on unix, with an empty arg array (no shell-string)", () => {
    expect(buildShell("darwin", { SHELL: "/bin/bash" })).toEqual({ file: "/bin/bash", args: [] });
    expect(buildShell("linux", {}).file).toBe("/bin/zsh");
  });

  it("uses COMSPEC on Windows", () => {
    expect(buildShell("win32", { COMSPEC: "cmd.exe" })).toEqual({ file: "cmd.exe", args: [] });
    expect(buildShell("win32", {}).file).toBe("powershell.exe");
  });
});

describe("pty session manager", () => {
  it("spawns a shell, relays output, resizes, and kills", async () => {
    const sent: { id: string; data: string; exit?: number | null }[] = [];
    const sender = { send: (_ch: string, p: (typeof sent)[number]) => sent.push(p) } as unknown as WebContents;

    createSession(sender, { id: "t1", cwd: process.cwd(), cols: 80, rows: 24 });
    expect(sessionCount()).toBe(1);

    writeSession("t1", "echo hello_pty_123\r");
    await vi.waitFor(
      () => expect(sent.some((p) => p.data.includes("hello_pty_123"))).toBe(true),
      { timeout: 5000, interval: 50 },
    );

    resizeSession("t1", 100, 30); // must not throw
    killSession("t1");
    expect(sessionCount()).toBe(0);
  });

  it("ignores a duplicate id and cleans up all sessions", () => {
    const sender = { send: () => undefined } as unknown as WebContents;
    createSession(sender, { id: "a", cwd: process.cwd() });
    createSession(sender, { id: "a", cwd: process.cwd() }); // duplicate → ignored
    createSession(sender, { id: "b", cwd: process.cwd() });
    expect(sessionCount()).toBe(2);
    killAllSessions();
    expect(sessionCount()).toBe(0);
  });
});
