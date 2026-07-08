import { spawn } from "node:child_process";

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** set when the binary could not be spawned (e.g. not on PATH) */
  spawnError?: string;
}

/**
 * Spawn a binary with an argument array — never a shell string, never
 * interpolating user input into a command line (invariant: safe process
 * handling). Always bounded by a timeout.
 */
export function execFileSafe(
  command: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; input?: string } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    // Resolve at most once. On timeout we resolve immediately rather than
    // waiting for `close`: killing the child does not guarantee a `close` event
    // if a grandchild (a CLI shim / version-manager launched by `command`) keeps
    // the stdio pipe open — that would hang the caller (and the startup splash)
    // forever. We SIGKILL best-effort and move on.
    const settle = (result: ExecResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
          settle({ code: null, stdout, stderr, timedOut: true });
        }, opts.timeoutMs)
      : null;

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err: Error) => {
      settle({ code: null, stdout, stderr, timedOut, spawnError: err.message });
    });
    child.on("close", (code: number | null) => {
      settle({ code, stdout, stderr, timedOut });
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}
