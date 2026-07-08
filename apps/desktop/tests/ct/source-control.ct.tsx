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

test("offers to initialize when the folder is not a repo", async ({ mount }) => {
  const c = await mount(<SourceControl {...props} />, {
    hooksConfig: {
      mock: { gitStatus: { ...DIRTY, isRepo: false, clean: true, staged: [], unstaged: [], untracked: [], conflicts: [] } },
    },
  });
  await expect(c.getByRole("button", { name: "Initialize repository" })).toBeVisible();
});
