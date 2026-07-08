import { execFileSafe } from "../util/exec";
import type { ProviderAuth, GitResult, RepoVisibility } from "../../shared/git";

/**
 * A light read of the GitHub CLI's auth state (M1) — enough to make the "Connect
 * to GitHub" affordance real: is `gh` installed, is the user logged in, and which
 * account(s) (so M2's multi-account picker has data). VortSpec never handles the
 * token — `gh` owns auth. The full provider (repo create, PR) lands in M2.
 */

/** Parse `gh auth status` for the logged-in account names (handles gh's variants). */
export function parseGhAccounts(text: string): string[] {
  const accounts = new Set<string>();
  for (const line of text.split("\n")) {
    // "✓ Logged in to github.com account NAME (keyring)"  |  "... as NAME"
    const m = /Logged in to \S+ (?:account|as) ([^\s(]+)/i.exec(line);
    if (m) accounts.add(m[1].trim());
  }
  return [...accounts];
}

export async function getGithubAuth(): Promise<ProviderAuth> {
  const ver = await execFileSafe("gh", ["--version"], { timeoutMs: 8000 });
  if (ver.spawnError) {
    return {
      provider: "github",
      cliInstalled: false,
      authenticated: false,
      accounts: [],
      activeAccount: null,
      hint: "Install the GitHub CLI (gh) to connect — https://cli.github.com — then click Connect again.",
    };
  }
  // `gh auth status` writes to stderr and exits 1 when signed out.
  const st = await execFileSafe("gh", ["auth", "status"], { timeoutMs: 10_000 });
  const text = `${st.stdout}\n${st.stderr}`;
  const accounts = parseGhAccounts(text);
  const authenticated = accounts.length > 0;
  return {
    provider: "github",
    cliInstalled: true,
    authenticated,
    accounts,
    activeAccount: accounts[0] ?? null,
    hint: authenticated
      ? null
      : "You're not signed in to GitHub. Run `gh auth login` in your terminal, then click Connect again.",
  };
}

// ── Provider actions (M2) — the user's own `gh`; args are arrays, never a shell string ──

/** Build `gh repo create` argv. Name/description travel as argv (never interpolated). */
export function buildRepoCreateArgs(opts: {
  name: string;
  visibility: RepoVisibility;
  description?: string;
}): string[] {
  const args = ["repo", "create", opts.name, `--${opts.visibility}`, "--source=.", "--remote=origin", "--push"];
  if (opts.description) args.push("--description", opts.description);
  return args;
}

/** Build `gh pr create` argv. Never force / never targets a delete. */
export function buildPrCreateArgs(opts: { base?: string; title: string; body?: string }): string[] {
  const args = ["pr", "create", "--title", opts.title, "--body", opts.body ?? ""];
  if (opts.base) args.push("--base", opts.base);
  return args;
}

/** Extract the first GitHub URL printed by `gh` (repo/PR create output). */
export function parseGithubUrl(text: string): string | null {
  const m = /https:\/\/github\.com\/\S+/.exec(text);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}

export async function switchGithubAccount(account: string): Promise<GitResult> {
  const r = await execFileSafe("gh", ["auth", "switch", "--user", account], { timeoutMs: 10_000 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  return r.code === 0
    ? { ok: true, message: `Switched to ${account}.` }
    : { ok: false, message: (r.stderr || r.stdout).trim() || "Could not switch account." };
}

export async function createGithubRepo(
  cwd: string,
  opts: { name: string; visibility: RepoVisibility; description?: string },
): Promise<GitResult> {
  const r = await execFileSafe("gh", buildRepoCreateArgs(opts), { cwd, timeoutMs: 120_000 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not create the repository." };
  return { ok: true, message: `Created ${opts.name} and pushed.`, url: parseGithubUrl(text) };
}

export async function createGithubPR(
  cwd: string,
  opts: { base?: string; title: string; body?: string },
): Promise<GitResult> {
  const r = await execFileSafe("gh", buildPrCreateArgs(opts), { cwd, timeoutMs: 60_000 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not open the pull request." };
  return { ok: true, message: "Opened a pull request.", url: parseGithubUrl(text) };
}
