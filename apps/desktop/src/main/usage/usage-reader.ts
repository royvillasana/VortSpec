import { spawn } from "node:child_process";
import { homedir } from "node:os";
import type { UsageResult } from "../../shared/usage";
import { parseUsage } from "./usage-parser";

/**
 * Reads the user's plan usage by invoking their own Claude Code:
 * `claude -p "/usage" --output-format json`. `/usage` is a LOCAL command — it
 * makes no model call (num_turns: 0, $0), uses the user's own login, and proxies
 * nothing. We parse the same text Claude shows into percentage bars.
 *
 * Isolated here (the one place that knows this CLI incantation) and defensive:
 * any failure returns a fix-it message rather than throwing, so the Profile page
 * degrades gracefully when `claude` is missing or the format changes.
 */

const TIMEOUT_MS = 20_000;

/** Run `claude -p "/usage" --output-format json` and return the `result` text. */
function runUsage(): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      // Argument array only — no shell, nothing interpolated. Home cwd (no project needed).
      child = spawn("claude", ["-p", "/usage", "--output-format", "json"], {
        cwd: homedir(),
        env: process.env,
        shell: false,
      });
    } catch {
      resolve({ ok: false, error: "Couldn't start Claude Code. Is it installed and on your PATH?" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (r: { ok: true; text: string } | { ok: false; error: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, error: "Reading usage timed out. Try again in a moment." });
    }, TIMEOUT_MS);

    child.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr?.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", () => done({ ok: false, error: "Couldn't run Claude Code. Is it installed and logged in?" }));
    child.on("close", () => {
      // The JSON envelope wraps the /usage text in `result`.
      try {
        const env = JSON.parse(stdout) as { result?: string; is_error?: boolean };
        if (typeof env.result === "string" && env.result.trim()) {
          done({ ok: true, text: env.result });
          return;
        }
      } catch {
        /* fall through — maybe plain text was printed */
      }
      if (stdout.trim()) {
        done({ ok: true, text: stdout });
        return;
      }
      done({
        ok: false,
        error: stderr.trim()
          ? "Claude Code couldn't report usage. Make sure you're logged in (run `claude` once)."
          : "No usage data returned by Claude Code.",
      });
    });
  });
}

export async function getUsage(): Promise<UsageResult> {
  const capturedAt = new Date().toISOString();
  const res = await runUsage();
  if (!res.ok) {
    return { available: false, headline: null, limits: [], note: null, raw: "", capturedAt, error: res.error };
  }
  const parsed = parseUsage(res.text);
  return {
    available: parsed.limits.length > 0,
    headline: parsed.headline,
    limits: parsed.limits,
    note: parsed.note,
    raw: res.text,
    capturedAt,
    error:
      parsed.limits.length > 0
        ? null
        : "Couldn't read usage percentages from Claude Code. Open the details to see its raw output.",
  };
}
