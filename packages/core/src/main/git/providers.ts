import type { ProviderAuth, GitResult, RepoVisibility, ProviderId } from "@vortspec/core/git";
import * as git from "./git-adapter";
import { getGithubAuth, switchGithubAccount, createGithubRepo, createGithubPR } from "./github";
import { getGitlabAuth, switchGitlabAccount, createGitlabRepo, createGitlabMR } from "./gitlab";
import { getBitbucketAuth, createBitbucketRepo, createBitbucketPR } from "./bitbucket";

/**
 * The provider abstraction (M6): GitHub, GitLab, Bitbucket share the same Source
 * Control UI. Plain git ops (M1) work for all three; only auth-status, repo-create,
 * and PR/MR-create are provider-specific. The active provider is resolved from the
 * project's `origin` remote host (or picked when creating a new repo).
 */
export interface GitProvider {
  id: ProviderId;
  authStatus(): Promise<ProviderAuth>;
  switchAccount(account: string): Promise<GitResult>;
  createRepo(cwd: string, opts: { name: string; visibility: RepoVisibility; description?: string }): Promise<GitResult>;
  createPR(cwd: string, opts: { base?: string; title: string; body?: string }): Promise<GitResult>;
}

const github: GitProvider = {
  id: "github",
  authStatus: getGithubAuth,
  switchAccount: switchGithubAccount,
  createRepo: createGithubRepo,
  createPR: createGithubPR,
};
const gitlab: GitProvider = {
  id: "gitlab",
  authStatus: getGitlabAuth,
  switchAccount: switchGitlabAccount,
  createRepo: createGitlabRepo,
  createPR: createGitlabMR,
};
const bitbucket: GitProvider = {
  id: "bitbucket",
  authStatus: getBitbucketAuth,
  switchAccount: async () => ({ ok: false, message: "Bitbucket account switching isn't supported yet." }),
  createRepo: createBitbucketRepo,
  createPR: createBitbucketPR,
};

const REGISTRY: Record<ProviderId, GitProvider> = { github, gitlab, bitbucket };

export function providerFor(id: ProviderId): GitProvider {
  return REGISTRY[id];
}

/** Map a remote URL to its provider by host. */
export function providerIdFromUrl(url: string): ProviderId | null {
  if (/(^|@|\/\/)([\w.-]*\.)?github\.com[/:]/i.test(url) || /github\.com/i.test(url)) return "github";
  if (/gitlab\.com/i.test(url) || /(^|\/\/)gitlab\./i.test(url)) return "gitlab";
  if (/bitbucket\.org/i.test(url) || /(^|\/\/)bitbucket\./i.test(url)) return "bitbucket";
  return null;
}

/** Resolve the provider for a project from its `origin` remote; default GitHub. */
export async function resolveProvider(cwd: string): Promise<GitProvider> {
  const remotes = await git.getRemotes(cwd);
  const origin = remotes.find((r) => r.name === "origin")?.url;
  const id = origin ? providerIdFromUrl(origin) : null;
  return providerFor(id ?? "github");
}

// ── IPC entry points (resolve provider by project remote) ────────────

export function providerAuth(cwd: string): Promise<ProviderAuth> {
  return resolveProvider(cwd).then((p) => p.authStatus());
}
export function providerSwitchAccount(cwd: string, account: string): Promise<GitResult> {
  return resolveProvider(cwd).then((p) => p.switchAccount(account));
}
export function providerCreateRepo(
  cwd: string,
  opts: { providerId?: ProviderId; name: string; visibility: RepoVisibility; description?: string },
): Promise<GitResult> {
  const p = opts.providerId ? providerFor(opts.providerId) : null;
  return (p ? Promise.resolve(p) : resolveProvider(cwd)).then((prov) =>
    prov.createRepo(cwd, { name: opts.name, visibility: opts.visibility, description: opts.description }),
  );
}
export function providerCreatePR(cwd: string, opts: { base?: string; title: string; body?: string }): Promise<GitResult> {
  return resolveProvider(cwd).then((p) => p.createPR(cwd, opts));
}

/**
 * Gated push-back on a NEW branch + PR/MR — additive, never main, never force —
 * for whichever provider the project uses.
 */
export async function providerPublish(
  cwd: string,
  opts: { branch: string; title: string; body?: string },
): Promise<GitResult> {
  const created = await git.createBranch(cwd, opts.branch);
  if (!created.ok) {
    const sw = await git.checkout(cwd, opts.branch);
    if (!sw.ok) return { ok: false, message: `Could not create or switch to ${opts.branch}.` };
  }
  const staged = await git.stage(cwd, ["."]);
  if (!staged.ok) return staged;
  const committed = await git.commit(cwd, opts.title);
  const pushed = await git.push(cwd);
  if (!pushed.ok) return pushed;
  const provider = await resolveProvider(cwd);
  const pr = await provider.createPR(cwd, { title: opts.title, body: opts.body });
  if (!pr.ok) return { ok: false, message: `Pushed ${opts.branch}, but opening the PR/MR failed: ${pr.message}` };
  return {
    ok: true,
    message: committed.ok ? `Published to ${opts.branch} and opened a PR/MR.` : `Pushed ${opts.branch} and opened a PR/MR.`,
    url: pr.url,
  };
}
