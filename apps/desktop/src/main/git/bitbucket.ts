import type { ProviderAuth, GitResult, RepoVisibility } from "../../shared/git";

/**
 * Bitbucket provider (M6, foundation). Bitbucket has no universal local CLI like
 * gh/glab, so plain git (clone/fetch/pull/push/branch/commit) already works via the
 * user's own git credentials (M1). Repo/PR creation needs a Bitbucket app password;
 * that lands with the keychain work (shared with Jira, M7). For now we detect the
 * provider and guide the user.
 */
export async function getBitbucketAuth(): Promise<ProviderAuth> {
  return {
    provider: "bitbucket",
    cliInstalled: false,
    authenticated: false,
    accounts: [],
    activeAccount: null,
    hint:
      "Bitbucket uses your own git credentials for clone/fetch/pull/push (all available here). " +
      "Creating a repository or PR from VortSpec needs a Bitbucket app password — coming with the " +
      "credential store; for now create the repo on bitbucket.org and push from Source Control.",
  };
}

const notYet: GitResult = {
  ok: false,
  message: "Bitbucket repo/PR creation is coming soon (needs an app password). Push works today via Source Control.",
};

export async function createBitbucketRepo(_cwd: string, _opts: { name: string; visibility: RepoVisibility; description?: string }): Promise<GitResult> {
  return notYet;
}
export async function createBitbucketPR(_cwd: string, _opts: { base?: string; title: string; body?: string }): Promise<GitResult> {
  return notYet;
}
