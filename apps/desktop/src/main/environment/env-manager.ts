import { execFileSafe } from "../util/exec";
import type { EnvCheck, EnvReport, FixAction } from "../../shared/ipc";

/**
 * Detects the local environment VortSpec depends on: Node, git, the Claude Code
 * install, and the Claude Code login state. Detection is read-only and never
 * mutates anything. The login check is lazy (see `verifyClaudeLogin`) so a
 * routine environment scan never spends the user's Claude usage.
 */

const NODE_INSTALL: FixAction = {
  kind: "install-link",
  label: "Install Node.js",
  url: "https://nodejs.org/en/download",
};
const GIT_INSTALL: FixAction = {
  kind: "install-link",
  label: "Install Git",
  url: "https://git-scm.com/downloads",
};
const CLAUDE_INSTALL: FixAction = {
  kind: "install-link",
  label: "Install Claude Code",
  url: "https://code.claude.com/docs/en/overview",
};
const OPEN_LOGIN: FixAction = { kind: "open-login", label: "Open login" };
const VERIFY_LOGIN: FixAction = { kind: "verify", label: "Verify login" };

const MIN_NODE_MAJOR = 20;

async function checkNode(): Promise<EnvCheck> {
  const r = await execFileSafe("node", ["--version"], { timeoutMs: 8000 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      detail: "Not found on PATH",
      fix: NODE_INSTALL,
    };
  }
  const version = r.stdout.trim(); // e.g. "v22.3.0"
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
  if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      detail: `${version} — needs ≥ ${MIN_NODE_MAJOR}`,
      fix: NODE_INSTALL,
    };
  }
  return { id: "node", label: "Node.js", status: "pass", detail: version };
}

async function checkGit(): Promise<EnvCheck> {
  const r = await execFileSafe("git", ["--version"], { timeoutMs: 8000 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "git",
      label: "Git",
      status: "fail",
      detail: "Not found on PATH",
      fix: GIT_INSTALL,
    };
  }
  return {
    id: "git",
    label: "Git",
    status: "pass",
    detail: r.stdout.trim().replace(/^git version /, "v"),
  };
}

async function checkClaudeInstall(): Promise<EnvCheck> {
  const r = await execFileSafe("claude", ["--version"], { timeoutMs: 8000 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "claude-install",
      label: "Claude Code",
      status: "fail",
      detail: "Not found on PATH",
      fix: CLAUDE_INSTALL,
    };
  }
  return {
    id: "claude-install",
    label: "Claude Code",
    status: "pass",
    detail: r.stdout.trim().split("\n")[0] ?? "installed",
  };
}

/** Lazy login row: not probed automatically (would spend usage). */
function pendingLogin(): EnvCheck {
  return {
    id: "claude-login",
    label: "Claude Code login",
    status: "unknown",
    detail: "Not verified yet",
    fix: VERIFY_LOGIN,
  };
}

const AUTH_ERROR_RE =
  /authentication_failed|not logged in|please run.*login|oauth|unauthorized|invalid api key|401/i;

/**
 * Authoritative login check: a minimal headless probe against the user's own
 * Claude Code. Spends a tiny amount of usage, so it only runs on explicit
 * request (the "Verify login" action), never in the routine scan.
 * Uses non-bare `claude -p` so authentication comes from the user's own login.
 */
export async function verifyClaudeLogin(): Promise<EnvCheck> {
  const install = await checkClaudeInstall();
  if (install.status !== "pass") {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "fail",
      detail: "Claude Code is not installed",
      fix: CLAUDE_INSTALL,
    };
  }

  const r = await execFileSafe(
    "claude",
    ["-p", "Reply with the single word: ok", "--output-format", "json"],
    { timeoutMs: 30000 },
  );
  const haystack = `${r.stdout}\n${r.stderr}`;

  if (r.timedOut) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "unknown",
      detail: "Verification timed out",
      fix: VERIFY_LOGIN,
    };
  }
  if (AUTH_ERROR_RE.test(haystack)) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "fail",
      detail: "Not logged in",
      fix: OPEN_LOGIN,
    };
  }
  if (r.code === 0) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "pass",
      detail: "Logged in",
    };
  }
  return {
    id: "claude-login",
    label: "Claude Code login",
    status: "unknown",
    detail: "Could not verify",
    fix: VERIFY_LOGIN,
  };
}

/** Full environment scan (cheap checks + a lazy login row). */
export async function checkEnvironment(): Promise<EnvReport> {
  const [node, git, install] = await Promise.all([
    checkNode(),
    checkGit(),
    checkClaudeInstall(),
  ]);
  const checks: EnvCheck[] = [node, git, install, pendingLogin()];
  const ready = checks.every((c) => c.status === "pass");
  return { checks, ready };
}
