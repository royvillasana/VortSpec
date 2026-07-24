import { execFileSafe } from "../util/exec";
import { MANAGED_DIR } from "./runtime-manager";
import type { EnvCheck, FixAction } from "@vortspec/core/ipc";

/**
 * Base-tool installers (change: automate-base-tool-install). Each is idempotent,
 * requires no administrator password (VortSpec never runs `sudo`), and returns the
 * re-verified `EnvCheck` so the guided flow can advance automatically.
 */

const RETRY: FixAction = { kind: "run-install", label: "Retry" };
const RECHECK: FixAction = { kind: "verify", label: "Re-check" };
const GIT_LINK: FixAction = { kind: "install-link", label: "Install Git", url: "https://git-scm.com/downloads" };

/** The official Claude Code npm package — installed into the managed prefix. */
export const CLAUDE_PKG = "@anthropic-ai/claude-code";

/**
 * Install the **official** Claude Code CLI into the VortSpec-managed prefix
 * (`~/.vortspec`) using the bundled npm — so `claude` lands in `~/.vortspec/bin`
 * with no sudo and no system pollution. Re-installing is a safe no-op. The binary
 * is run with the user's own login (never `--bare`).
 */
export async function installClaudeCli(): Promise<EnvCheck> {
  const r = await execFileSafe("npm", ["install", "-g", CLAUDE_PKG, "--prefix", MANAGED_DIR], {
    timeoutMs: 180_000,
  });
  if (r.spawnError) {
    return {
      id: "claude-install",
      label: "Claude Code",
      status: "fail",
      detail: "npm isn't available — the bundled Node runtime isn't ready",
      fix: RETRY,
    };
  }
  if (r.code !== 0) {
    return {
      id: "claude-install",
      label: "Claude Code",
      status: "fail",
      detail: r.stderr.trim().split("\n").pop() || "Install failed",
      fix: RETRY,
    };
  }
  // Verify it now resolves on PATH (managed bin is prepended at boot).
  const v = await execFileSafe("claude", ["--version"], { timeoutMs: 8000 });
  if (v.code === 0) {
    return { id: "claude-install", label: "Claude Code", status: "pass", detail: v.stdout.trim().split("\n")[0] || "installed" };
  }
  return {
    id: "claude-install",
    label: "Claude Code",
    status: "unknown",
    detail: "Installed into ~/.vortspec/bin — reopen setup if it isn't picked up",
    fix: RECHECK,
  };
}

/**
 * Trigger git via the platform's supported installer. On macOS that's
 * `xcode-select --install` (Apple's Command Line Tools dialog — the user clicks
 * Install once); the caller polls the git check until it succeeds. No sudo — Apple's
 * installer handles its own consent. "Already installed" is treated as success.
 */
export async function installGit(): Promise<EnvCheck> {
  if (process.platform !== "darwin") {
    return { id: "git", label: "Git", status: "fail", detail: "Auto-install is macOS-only for now", fix: GIT_LINK };
  }
  const r = await execFileSafe("xcode-select", ["--install"], { timeoutMs: 15_000 });
  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();
  if (/already installed/.test(out)) {
    const v = await execFileSafe("git", ["--version"], { timeoutMs: 8000 });
    if (v.code === 0) {
      return { id: "git", label: "Git", status: "pass", detail: v.stdout.trim().replace(/^git version /, "v") };
    }
  }
  if (r.spawnError) {
    return { id: "git", label: "Git", status: "fail", detail: "Couldn't launch the Command Line Tools installer", fix: GIT_LINK };
  }
  // The Apple installer is now open (or the CLT are mid-install) — wait for the user.
  return {
    id: "git",
    label: "Git",
    status: "unknown",
    detail: "Approve Apple's Command Line Tools installer, then re-check",
    fix: RECHECK,
  };
}
