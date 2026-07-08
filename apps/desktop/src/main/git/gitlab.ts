import { execFileSafe } from "../util/exec";
import type { ProviderAuth, GitResult, RepoVisibility } from "../../shared/git";
import * as git from "./git-adapter";

/**
 * GitLab provider (M6) — the user's own `glab` CLI (no stored tokens). Mirrors the
 * GitHub provider: auth status (multi-account), create project + push, open MR.
 * Additive only — no delete/force. Pure arg-builders/parsers are unit-tested.
 */

export function parseGlabAccounts(text: string): string[] {
  const accounts = new Set<string>();
  for (const line of text.split("\n")) {
    // "✓ Logged in to gitlab.com as NAME (…)"  |  "Logged in to gitlab.com (username: NAME)"
    let m = /Logged in to \S+ as ([^\s(]+)/i.exec(line);
    if (!m) m = /username:\s*([^\s)]+)/i.exec(line);
    if (m) accounts.add(m[1].trim());
  }
  return [...accounts];
}

export function parseGlabUrl(text: string): string | null {
  const m = /https:\/\/gitlab\.com\/\S+/.exec(text);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}

/** `glab repo create` argv — creates the project; the caller sets the remote + pushes. */
export function buildGlabRepoCreateArgs(opts: { name: string; visibility: RepoVisibility; description?: string }): string[] {
  // GitLab visibility values: private | public | internal (same words).
  const args = ["repo", "create", opts.name, "--visibility", opts.visibility];
  if (opts.description) args.push("--description", opts.description);
  return args;
}

/** `glab mr create` argv. Never force / never targets a delete. */
export function buildGlabMrArgs(opts: { base?: string; title: string; body?: string }): string[] {
  const args = ["mr", "create", "--title", opts.title, "--description", opts.body ?? ""];
  if (opts.base) args.push("--target-branch", opts.base);
  return args;
}

export async function getGitlabAuth(): Promise<ProviderAuth> {
  const ver = await execFileSafe("glab", ["--version"], { timeoutMs: 8000 });
  if (ver.spawnError) {
    return {
      provider: "gitlab",
      cliInstalled: false,
      authenticated: false,
      accounts: [],
      activeAccount: null,
      hint: "Install the GitLab CLI (glab) to connect — https://gitlab.com/gitlab-org/cli — then click Connect again.",
    };
  }
  const st = await execFileSafe("glab", ["auth", "status"], { timeoutMs: 10_000 });
  const text = `${st.stdout}\n${st.stderr}`;
  const accounts = parseGlabAccounts(text);
  const authenticated = accounts.length > 0 || /Logged in/i.test(text);
  return {
    provider: "gitlab",
    cliInstalled: true,
    authenticated,
    accounts,
    activeAccount: accounts[0] ?? null,
    hint: authenticated ? null : "You're not signed in to GitLab. Run `glab auth login` in your terminal, then click Connect again.",
  };
}

export async function switchGitlabAccount(_account: string): Promise<GitResult> {
  // glab does not expose account switching like gh; guide the user instead.
  return { ok: false, message: "Switch GitLab accounts with `glab auth login` in your terminal, then re-check." };
}

export async function createGitlabRepo(
  cwd: string,
  opts: { name: string; visibility: RepoVisibility; description?: string },
): Promise<GitResult> {
  const r = await execFileSafe("glab", buildGlabRepoCreateArgs(opts), { cwd, timeoutMs: 120_000 });
  if (r.spawnError) return { ok: false, message: "The GitLab CLI (glab) isn't installed." };
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not create the project." };
  const url = parseGlabUrl(text);
  // glab creates the project; wire the remote + push the current folder.
  if (url) {
    await git.stage(cwd, ["."]);
    await execFileSafe("git", ["remote", "add", "origin", `${url}.git`], { cwd, timeoutMs: 10_000 });
    await git.push(cwd);
  }
  return { ok: true, message: `Created ${opts.name} and pushed.`, url };
}

export async function createGitlabMR(cwd: string, opts: { base?: string; title: string; body?: string }): Promise<GitResult> {
  const r = await execFileSafe("glab", buildGlabMrArgs(opts), { cwd, timeoutMs: 60_000 });
  if (r.spawnError) return { ok: false, message: "The GitLab CLI (glab) isn't installed." };
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not open the merge request." };
  return { ok: true, message: "Opened a merge request.", url: parseGlabUrl(text) };
}
