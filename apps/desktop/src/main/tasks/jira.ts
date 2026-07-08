import { platform } from "node:os";
import { execFileSafe } from "../util/exec";
import type { TaskAuth, TaskProject, TaskIssue, TaskResult, IssueType } from "../../shared/task";

/**
 * Jira via the community `jira` CLI (ankitpokhrel/jira-cli) — the user's own login,
 * no VortSpec-stored account. Pure arg-builders/parsers are unit-tested; the spawn
 * wrappers are thin. Every write is an explicit user action.
 */

// ── pure helpers (unit-tested) ───────────────────────────────────────

export function buildCreateIssueArgs(opts: {
  project: string;
  type: IssueType;
  summary: string;
  description?: string;
}): string[] {
  const args = ["issue", "create", "-t", opts.type, "-p", opts.project, "-s", opts.summary, "--no-input"];
  if (opts.description) args.push("-b", opts.description);
  return args;
}

const ISSUE_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function parseIssueRef(text: string): { key: string | null; url: string | null } {
  const url = /https?:\/\/\S+\/browse\/[A-Z][A-Z0-9]+-\d+/.exec(text)?.[0]?.replace(/[.,)]+$/, "") ?? null;
  const key = (url ? ISSUE_KEY.exec(url) : ISSUE_KEY.exec(text))?.[1] ?? null;
  return { key, url };
}

export function parseProjects(text: string): TaskProject[] {
  const out: TaskProject[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = /^([A-Z][A-Z0-9]+)[\s\t]+(.+?)\s*$/.exec(t);
    if (m) out.push({ key: m[1], name: m[2].trim() });
  }
  return out;
}

/** `jira me` prints the account email. */
export function parseAccount(text: string): string | null {
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
  return email ? email[0] : null;
}

/** Pull a Status value out of `jira issue view KEY --plain`. */
export function parseIssueStatus(text: string): string | null {
  const m = /status[:\s]+([A-Za-z][A-Za-z \-]*)/i.exec(text);
  return m ? m[1].trim() : null;
}

/** The install command we'd run for this platform (shown before running, with permission). */
export function installCommandFor(os: string, hasBrew: boolean): string | null {
  if (os === "darwin" && hasBrew) return "brew install ankitpokhrel/jira-cli/jira-cli";
  if (hasBrew) return "brew install ankitpokhrel/jira-cli/jira-cli";
  return null;
}

// ── spawn wrappers ───────────────────────────────────────────────────

async function jira(args: string[]): Promise<{ ok: boolean; out: string }> {
  const r = await execFileSafe("jira", args, { timeoutMs: 30_000 });
  return { ok: !r.spawnError && r.code === 0, out: `${r.stdout}\n${r.stderr}` };
}

export async function getJiraAuth(): Promise<TaskAuth> {
  const ver = await execFileSafe("jira", ["version"], { timeoutMs: 8000 });
  const brew = await execFileSafe("brew", ["--version"], { timeoutMs: 6000 });
  const hasBrew = !brew.spawnError;
  const installCommand = installCommandFor(platform(), hasBrew);
  if (ver.spawnError) {
    return {
      provider: "jira",
      cliInstalled: false,
      configured: false,
      account: null,
      sites: [],
      installCommand,
      hint: installCommand
        ? "The Jira CLI isn't installed. VortSpec can install it for you (with your permission), then run `jira init` to sign in."
        : "Install the Jira CLI (ankitpokhrel/jira-cli) and run `jira init`, then click Connect again.",
    };
  }
  const me = await execFileSafe("jira", ["me"], { timeoutMs: 10_000 });
  const account = me.spawnError || me.code !== 0 ? null : parseAccount(`${me.stdout}\n${me.stderr}`);
  return {
    provider: "jira",
    cliInstalled: true,
    configured: Boolean(account),
    account,
    sites: account ? [account] : [],
    installCommand: null,
    hint: account ? null : "The Jira CLI is installed but not signed in. Run `jira init` in your terminal, then click Connect again.",
  };
}

export async function installJira(): Promise<TaskResult> {
  const brew = await execFileSafe("brew", ["--version"], { timeoutMs: 6000 });
  if (brew.spawnError) {
    return { ok: false, message: "Homebrew isn't available. Install the Jira CLI from ankitpokhrel/jira-cli, then Connect." };
  }
  const r = await execFileSafe("brew", ["install", "ankitpokhrel/jira-cli/jira-cli"], { timeoutMs: 300_000 });
  if (r.spawnError || r.code !== 0) {
    return { ok: false, message: (r.stderr || r.stdout).trim().slice(0, 240) || "Install failed." };
  }
  return { ok: true, message: "Installed the Jira CLI. Now run `jira init` in your terminal to sign in, then Connect." };
}

export async function listJiraProjects(): Promise<TaskProject[]> {
  const r = await jira(["project", "list", "--plain", "--no-headers", "--columns", "key,name"]);
  return r.ok ? parseProjects(r.out) : [];
}

export async function createJiraIssue(opts: {
  project: string;
  type: IssueType;
  summary: string;
  description?: string;
}): Promise<TaskResult> {
  const r = await jira(buildCreateIssueArgs(opts));
  if (!r.ok) return { ok: false, message: r.out.trim().slice(0, 240) || "Could not create the issue." };
  const { key, url } = parseIssueRef(r.out);
  return { ok: true, message: key ? `Created ${key}.` : "Created the issue.", key, url };
}

export async function getJiraIssue(key: string): Promise<TaskIssue> {
  const r = await jira(["issue", "view", key, "--plain"]);
  return {
    key,
    url: null,
    summary: null,
    status: r.ok ? parseIssueStatus(r.out) : null,
  };
}
