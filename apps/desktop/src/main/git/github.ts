import { execFileSafe } from "../util/exec";
import type { ProviderAuth } from "../../shared/git";

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
