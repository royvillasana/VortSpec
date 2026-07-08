import { execFileSafe } from "../util/exec";
import type {
  GitStatus,
  GitChange,
  GitChangeStatus,
  GitBranch,
  GitRemote,
  GitLogEntry,
  GitResult,
} from "../../shared/git";

/**
 * The single place that knows `git`. Every call is an argument array confined to
 * the project folder (never a shell string, never interpolating user input).
 *
 * Guardrail (see the git-provider-integration plan): this adapter exposes NO
 * branch deletion and NO force-push / history rewrite — it is additive only.
 * There is deliberately no `deleteBranch` and no `--force` anywhere.
 */

async function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const r = await execFileSafe("git", args, { cwd, timeoutMs: 60_000 });
  if (r.spawnError) return { ok: false, stdout: "", stderr: "git is not installed or not on PATH." };
  return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr.trim() };
}

const CODE: Record<string, GitChangeStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange",
};
function toStatus(code: string): GitChangeStatus {
  return CODE[code] ?? "modified";
}

/**
 * Parse `git status --porcelain=v2 --branch` output into a structured status.
 * Pure + exported so it can be unit-tested against recorded git output.
 */
export function parseStatus(raw: string, isRepo: boolean): GitStatus {
  const status: GitStatus = {
    isRepo,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
    clean: true,
  };
  if (!isRepo) return status;

  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length).trim();
      status.branch = head === "(detached)" ? null : head;
    } else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const fields = line.split(" ");
      const xy = fields[1];
      const rename = line.startsWith("2 ");
      const rest = fields.slice(rename ? 9 : 8).join(" ");
      const path = rename ? rest.split("\t")[0] : rest;
      const x = xy[0];
      const y = xy[1];
      if (x !== ".") status.staged.push({ path, status: toStatus(x) });
      if (y !== ".") status.unstaged.push({ path, status: toStatus(y) });
    } else if (line.startsWith("u ")) {
      const fields = line.split(" ");
      status.conflicts.push(fields.slice(10).join(" "));
    } else if (line.startsWith("? ")) {
      status.untracked.push(line.slice(2));
    }
    // "! " (ignored) is intentionally skipped.
  }
  status.clean =
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicts.length === 0;
  return status;
}

export function parseBranches(raw: string, currentUpstream: string | null): GitBranch[] {
  // `git branch --all --format=%(refname:short)\t%(upstream:short)\t%(HEAD)`
  const out: GitBranch[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [name, upstream, head] = line.split("\t");
    if (!name || name.includes("HEAD ->")) continue;
    const remote = name.startsWith("origin/") || name.includes("/");
    out.push({
      name,
      current: head === "*",
      remote,
      upstream: upstream || (head === "*" ? currentUpstream : null) || null,
    });
  }
  return out;
}

export function parseLog(raw: string): GitLogEntry[] {
  // records separated by \x1e, fields by \x1f: %H %h %s %an %ad
  return raw
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, shortHash, subject, author, date] = rec.split("\x1f");
      return { hash, shortHash, subject, author, date };
    });
}

// ── Inspect ──────────────────────────────────────────────────────────

export async function isRepo(cwd: string): Promise<boolean> {
  const r = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  const repo = await isRepo(cwd);
  if (!repo) return parseStatus("", false);
  const r = await git(cwd, ["status", "--porcelain=v2", "--branch"]);
  return parseStatus(r.stdout, true);
}

export async function getBranches(cwd: string): Promise<GitBranch[]> {
  if (!(await isRepo(cwd))) return [];
  const r = await git(cwd, [
    "branch",
    "--all",
    "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)",
  ]);
  return parseBranches(r.stdout, null);
}

export async function getRemotes(cwd: string): Promise<GitRemote[]> {
  if (!(await isRepo(cwd))) return [];
  const r = await git(cwd, ["remote", "-v"]);
  const seen = new Map<string, string>();
  for (const line of r.stdout.split("\n")) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line);
    if (m) seen.set(m[1], m[2]);
  }
  return [...seen].map(([name, url]) => ({ name, url }));
}

export async function getLog(cwd: string, limit = 20): Promise<GitLogEntry[]> {
  if (!(await isRepo(cwd))) return [];
  const r = await git(cwd, ["log", `-${limit}`, "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad", "--date=short"]);
  const withRs = r.stdout.split("\n").join("\x1e");
  return parseLog(withRs + "\x1e");
}

export async function getDiff(cwd: string, path?: string, staged = false): Promise<string> {
  const args = ["diff"];
  if (staged) args.push("--staged");
  if (path) args.push("--", path);
  const r = await git(cwd, args);
  return r.stdout;
}

// ── Mutate (additive only — no delete, no force) ─────────────────────

function ok(message: string): GitResult {
  return { ok: true, message };
}
function fail(r: { stderr: string }, fallback: string): GitResult {
  return { ok: false, message: r.stderr || fallback };
}

export async function init(cwd: string): Promise<GitResult> {
  const r = await git(cwd, ["init"]);
  return r.ok ? ok("Initialized a git repository.") : fail(r, "git init failed.");
}

export async function stage(cwd: string, paths: string[]): Promise<GitResult> {
  const r = await git(cwd, ["add", "--", ...paths]);
  return r.ok ? ok(`Staged ${paths.length} path(s).`) : fail(r, "Staging failed.");
}

export async function unstage(cwd: string, paths: string[]): Promise<GitResult> {
  const r = await git(cwd, ["restore", "--staged", "--", ...paths]);
  return r.ok ? ok(`Unstaged ${paths.length} path(s).`) : fail(r, "Unstaging failed.");
}

export async function commit(cwd: string, message: string): Promise<GitResult> {
  const r = await git(cwd, ["commit", "-m", message]);
  return r.ok ? ok("Committed.") : fail(r, "Commit failed (nothing staged?).");
}

export async function checkout(cwd: string, name: string): Promise<GitResult> {
  const r = await git(cwd, ["checkout", name]);
  return r.ok ? ok(`Switched to ${name}.`) : fail(r, `Could not switch to ${name}.`);
}

/** Create a new branch and switch to it. There is intentionally no delete counterpart. */
export async function createBranch(cwd: string, name: string): Promise<GitResult> {
  const r = await git(cwd, ["checkout", "-b", name]);
  return r.ok ? ok(`Created and switched to ${name}.`) : fail(r, `Could not create ${name}.`);
}

export async function fetch(cwd: string): Promise<GitResult> {
  const r = await git(cwd, ["fetch", "--all"]);
  return r.ok ? ok("Fetched.") : fail(r, "Fetch failed.");
}

export async function pull(cwd: string): Promise<GitResult> {
  const r = await git(cwd, ["pull", "--ff-only"]);
  return r.ok ? ok("Pulled (fast-forward).") : fail(r, "Pull failed.");
}

/** Normal push only — never `--force`, never `--delete`. Sets upstream for new branches. */
export async function push(cwd: string): Promise<GitResult> {
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  let r = await git(cwd, ["push"]);
  if (!r.ok && /has no upstream branch|set-upstream/i.test(r.stderr) && branch) {
    r = await git(cwd, ["push", "--set-upstream", "origin", branch]);
  }
  return r.ok ? ok("Pushed.") : fail(r, "Push failed.");
}
