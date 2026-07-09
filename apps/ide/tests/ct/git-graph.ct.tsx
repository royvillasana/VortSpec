import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project, GitGraphResult } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const graph: GitGraphResult = {
  commits: [
    { hash: "m1", shortHash: "m1", parents: ["c1", "d1"], author: "dev", date: "now", subject: "merge: feature", refs: ["HEAD -> main"] },
    { hash: "d1", shortHash: "d1", parents: ["b1"], author: "dev", date: "1h", subject: "feat: on a branch", refs: [] },
    { hash: "c1", shortHash: "c1", parents: ["b1"], author: "dev", date: "2h", subject: "fix: on main", refs: ["origin/main"] },
    { hash: "b1", shortHash: "b1", parents: [], author: "dev", date: "1d", subject: "init", refs: ["tag: v0"] },
  ],
  stats: { commits: 4, branches: 2, remoteBranches: 1, merges: 1, tags: 1 },
  truncated: false,
};

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
  gitGraph: graph,
};

test("Source Control shows the Commit Graph with stats and commits", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Source Control" }).click();

  await expect(c.getByRole("heading", { name: "Commit Graph" })).toBeVisible();
  // Stats (value + label rendered together in a pill).
  await expect(c.getByText("commits")).toBeVisible();
  await expect(c.getByText("merges")).toBeVisible();
  // The commit subjects render in the graph.
  await expect(c.getByText("merge: feature")).toBeVisible();
  await expect(c.getByText("feat: on a branch")).toBeVisible();
  // Ref decorations show as badges — the tag and remote branch are unambiguous.
  await expect(c.getByText("v0", { exact: true })).toBeVisible();
  await expect(c.getByText("origin/main", { exact: true })).toBeVisible();
});
