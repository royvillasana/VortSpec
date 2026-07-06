import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WebContents } from "electron";
import { DEV_SERVER_UPDATE_CHANNEL, type DevServerStatus } from "../../shared/dev-server";

/**
 * Manages one long-running dev/storybook server per project so the Dev Preview
 * can embed a live URL. Non-interactive, so a plain arg-array child process
 * (cwd confined to the project folder) is enough — no PTY. The local URL is
 * parsed from the server's own output.
 */

interface Server {
  child: ChildProcess;
  status: DevServerStatus;
  sender: WebContents;
}
const servers = new Map<string, Server>();

/** Prefer a browsable surface: dev → storybook → start. */
async function detectScript(projectPath: string): Promise<string | null> {
  const pkg = await readFile(join(projectPath, "package.json"), "utf8").catch(() => null);
  if (!pkg) return null;
  let scripts: Record<string, unknown> = {};
  try {
    scripts = (JSON.parse(pkg).scripts as Record<string, unknown>) ?? {};
  } catch {
    return null;
  }
  for (const name of ["dev", "storybook", "start", "preview"]) {
    if (typeof scripts[name] === "string") return name;
  }
  return null;
}

function detectPackageManager(projectPath: string): string {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}

/** First localhost/loopback http(s) URL in a chunk of server output. */
export function urlFrom(text: string): string | null {
  // Dev servers colorize output — vite/picocolors emit ANSI codes even under
  // CI/FORCE_COLOR, and they land INSIDE the URL (http://localhost:‹ESC›5173‹ESC›/),
  // which would break `:\d+`. Strip escape sequences before matching.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
  const clean = text.replace(ansi, "");
  const m = clean.match(
    /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s)'"]*)/i,
  );
  if (!m) return null;
  return m[1].replace("0.0.0.0", "localhost").replace(/\/+$/, "") + "/";
}

function push(server: Server, projectPath: string): void {
  if (!server.sender.isDestroyed()) {
    server.sender.send(DEV_SERVER_UPDATE_CHANNEL, { projectPath, status: server.status });
  }
}

export async function startDevServer(
  sender: WebContents,
  projectPath: string,
): Promise<DevServerStatus> {
  const existing = servers.get(projectPath);
  if (existing && (existing.status.state === "starting" || existing.status.state === "running")) {
    existing.sender = sender;
    return existing.status;
  }

  const script = await detectScript(projectPath);
  if (!script) {
    return {
      state: "no-script",
      url: null,
      script: null,
      message: "No dev / storybook / start script found in package.json.",
    };
  }

  const pm = detectPackageManager(projectPath);
  const child = spawn(pm, ["run", script], {
    cwd: projectPath,
    shell: false,
    // NO_COLOR asks tools (picocolors/vite) not to emit ANSI; urlFrom still
    // strips any that slip through. CI keeps them non-interactive.
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", BROWSER: "none", CI: "1" },
  });
  const server: Server = {
    child,
    status: { state: "starting", url: null, script, message: null },
    sender,
  };
  servers.set(projectPath, server);

  const onData = (buf: Buffer): void => {
    if (server.status.state !== "starting") return;
    const url = urlFrom(buf.toString());
    if (url) {
      server.status = { state: "running", url, script, message: null };
      push(server, projectPath);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("error", (err: Error) => {
    server.status = { state: "error", url: null, script, message: err.message };
    push(server, projectPath);
  });
  child.on("exit", (code) => {
    // A running server that exits with null code was stopped by us (SIGTERM).
    const clean = server.status.state === "running" && code === null;
    server.status = {
      state: clean ? "stopped" : code && code !== 0 ? "error" : "stopped",
      url: null,
      script,
      message: clean ? null : code ? `Preview process exited with code ${code}.` : null,
    };
    push(server, projectPath);
  });

  push(server, projectPath);
  return server.status;
}

export function stopDevServer(projectPath: string): void {
  const server = servers.get(projectPath);
  if (!server) return;
  server.child.kill("SIGTERM");
  const child = server.child;
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 4000);
}

export function getDevServerStatus(projectPath: string): DevServerStatus {
  return (
    servers.get(projectPath)?.status ?? {
      state: "stopped",
      url: null,
      script: null,
      message: null,
    }
  );
}

/** Kill every managed dev server (called on app quit). */
export function stopAllDevServers(): void {
  for (const server of servers.values()) server.child.kill("SIGTERM");
}
