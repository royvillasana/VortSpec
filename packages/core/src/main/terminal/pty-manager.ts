import { spawn, type IPty } from "node-pty";
import type { WebContents } from "electron";
import { TERMINAL_DATA_CHANNEL } from "@vortspec/core/terminal";

/**
 * Real PTY sessions for the integrated terminal, keyed by a renderer-supplied
 * id. Each spawns the user's login shell in the workspace folder; the shell
 * binary is spawned directly with an argument array — the app NEVER builds a
 * shell string from its own input. The user's keystrokes are relayed verbatim
 * via write(), so their own typed commands run under their own authority.
 */

/** The login shell + args for a platform. Pure + exported for unit testing. */
export function buildShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): { file: string; args: string[] } {
  if (platform === "win32") return { file: env.COMSPEC || "powershell.exe", args: [] };
  return { file: env.SHELL || "/bin/zsh", args: [] };
}

const sessions = new Map<string, IPty>();

export function createSession(
  sender: WebContents,
  opts: { id: string; cwd: string; cols?: number; rows?: number },
): void {
  if (sessions.has(opts.id)) return;
  const { file, args } = buildShell();
  const pty = spawn(file, args, {
    name: "xterm-color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    cwd: opts.cwd,
    env: process.env as Record<string, string>,
  });
  pty.onData((data) => sender.send(TERMINAL_DATA_CHANNEL, { id: opts.id, data }));
  pty.onExit(({ exitCode }) => {
    sessions.delete(opts.id);
    sender.send(TERMINAL_DATA_CHANNEL, { id: opts.id, data: "", exit: exitCode });
  });
  sessions.set(opts.id, pty);
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.write(data);
}

export function resizeSession(id: string, cols: number, rows: number): void {
  try {
    sessions.get(id)?.resize(Math.max(1, cols), Math.max(1, rows));
  } catch {
    // The PTY may have exited between resize events — ignore.
  }
}

export function killSession(id: string): void {
  const pty = sessions.get(id);
  if (pty) {
    try {
      pty.kill();
    } catch {
      // already gone
    }
    sessions.delete(id);
  }
}

export function killAllSessions(): void {
  for (const pty of sessions.values()) {
    try {
      pty.kill();
    } catch {
      // already gone
    }
  }
  sessions.clear();
}

export function sessionCount(): number {
  return sessions.size;
}
