import { test, expect } from "@playwright/experimental-ct-react";
import { SourceControl } from "../../src/renderer/src/views/SourceControl";
import { PROJECT } from "./support/fixtures";
import type { GitStatus } from "../../src/shared/ipc";

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onFlow: noop,
  onRun: noop,
  onPlayground: noop,
  onTokens: noop,
  onManifest: noop,
  onHistory: noop,
};

const DIRTY: GitStatus = {
  isRepo: true,
  branch: "feature/x",
  upstream: "origin/feature/x",
  ahead: 1,
  behind: 0,
  staged: [{ path: "src/staged.ts", status: "modified" }],
  unstaged: [{ path: "src/edited.ts", status: "modified" }],
  untracked: ["src/new.ts"],
  conflicts: [],
  clean: false,
};

test("renders branch, changes, and additive git actions", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: { mock: { gitStatus: DIRTY, gitBranches: [{ name: "feature/x", current: true, remote: false, upstream: null }] } },
  });
  await expect(c.getByRole("heading", { name: "Source Control" })).toBeVisible();
  await expect(c.getByText("src/staged.ts")).toBeVisible();
  await expect(c.getByText("src/new.ts")).toBeVisible();
  await expect(c.getByRole("button", { name: /Commit \(1\)/ })).toBeVisible();
  await expect(c.getByRole("button", { name: "Push" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Create & switch" })).toBeVisible();
  // The guardrail is stated and there is no delete affordance anywhere.
  await expect(c.getByText(/never deletes a branch or rewrites history/)).toBeVisible();
  await expect(c.getByRole("button", { name: /delete/i })).toHaveCount(0);
});

test("shows the GitHub connect hint when not authenticated", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: {
        gitStatus: DIRTY,
        githubAuth: { provider: "github", cliInstalled: true, authenticated: false, accounts: [], activeAccount: null, hint: "Run `gh auth login` in your terminal." },
      },
    },
  });
  await expect(c.getByText(/gh auth login/)).toBeVisible();
});

const AUTHED_ONE = { provider: "github" as const, cliInstalled: true, authenticated: true, accounts: ["octocat"], activeAccount: "octocat", hint: null };
const AUTHED_MULTI = { provider: "github" as const, cliInstalled: true, authenticated: true, accounts: ["octocat", "hubber"], activeAccount: "octocat", hint: null };

test("offers Create repo (GitHub/GitLab picker) when connected with no remote (M2/M6)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: { mock: { gitStatus: DIRTY, gitRemotes: [], githubAuth: AUTHED_ONE } },
  });
  await expect(c.getByText("Connected")).toBeVisible();
  await c.getByRole("button", { name: /Create a repo/ }).click();
  await expect(c.getByPlaceholder("new-repo-name")).toBeVisible();
  await expect(c.getByRole("button", { name: "Create & push" })).toBeVisible();
  // The provider picker offers GitHub and GitLab.
  await expect(c.getByRole("option", { name: "GitLab" })).toBeAttached();
});

test("shows the resolved provider name — GitLab (M6)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: {
        gitStatus: DIRTY,
        gitRemotes: [{ name: "origin", url: "https://gitlab.com/me/app.git" }],
        githubAuth: { provider: "gitlab", cliInstalled: true, authenticated: true, accounts: ["me"], activeAccount: "me", hint: null },
      },
    },
  });
  await expect(c.getByText("GitLab", { exact: true })).toBeVisible();
});

test("shows the account picker for multiple accounts (M2)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: { mock: { gitStatus: DIRTY, githubAuth: AUTHED_MULTI } },
  });
  await expect(c.getByText(/2 accounts — pick which to use/)).toBeVisible();
});

test("offers Open pull request when connected with a remote (M2)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: { gitStatus: DIRTY, gitRemotes: [{ name: "origin", url: "https://github.com/me/app.git" }], githubAuth: AUTHED_ONE },
    },
  });
  await expect(c.getByRole("button", { name: /Open pull request for feature\/x/ })).toBeVisible();
});

test("offers to initialize and import a repo when the folder is not a repo (M3)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: { gitStatus: { ...DIRTY, isRepo: false, clean: true, staged: [], unstaged: [], untracked: [], conflicts: [] } },
    },
  });
  await expect(c.getByRole("button", { name: "Initialize repository" })).toBeVisible();
  await expect(c.getByPlaceholder("https://github.com/owner/repo")).toBeVisible();
  await expect(c.getByRole("button", { name: "Import from GitHub" })).toBeVisible();
});

const REMOTE_ONE = [{ name: "origin", url: "https://github.com/me/app.git" }];

test("gates push-back until the manifest is ready (M3)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: { gitStatus: DIRTY, gitRemotes: REMOTE_ONE, githubAuth: AUTHED_ONE, manifest: { path: "DESIGN.md", content: "", exists: false } },
    },
  });
  const pub = c.getByRole("button", { name: /Publish design system/ });
  await expect(pub).toBeVisible();
  await expect(pub).toBeDisabled();
  await expect(c.getByText(/Available once DESIGN.md is generated/)).toBeVisible();
});

test("enables push-back when the manifest exists (M3)", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: { gitStatus: DIRTY, gitRemotes: REMOTE_ONE, githubAuth: AUTHED_ONE, manifest: { path: "DESIGN.md", content: "# x", exists: true } },
    },
  });
  await expect(c.getByRole("button", { name: /Publish design system/ })).toBeEnabled();
});
