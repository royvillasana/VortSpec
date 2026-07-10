import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
};

/** Open the workspace by clicking the seeded recent project. */
async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

test("opens on the workspace picker and lists recent projects", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await expect(c.getByRole("heading", { name: "VortSpec", exact: true })).toBeVisible();
  // VS Code–style Start links (not solid buttons) + the brand mark.
  await expect(c.getByRole("img", { name: "VortSpec" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Open Folder/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /Clone Repository/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /acme-design-system/ })).toBeVisible();
});

test("Create New Project opens the setup wizard for a fresh folder", async ({ mount }) => {
  const mock = {
    ...base,
    createFolderResult: { id: "np", name: "new-app", path: "/Users/dev/new-app", toolkit: { present: false, version: null, updateAvailable: false } } as Project,
  };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await c.getByRole("button", { name: "Create New Project" }).click();
  // The unified setup + intake stepper (same as the cockpit) takes over on step 1.
  await expect(c.getByRole("heading", { name: "Set up your stack" })).toBeVisible();
  await expect(c.getByText("Where do your components and design specs come from?")).toBeVisible();
});

test("the Clone Repository link reveals a repo-URL input", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("button", { name: /Clone Repository/ }).click();
  await expect(c.getByPlaceholder(/Repository URL/)).toBeVisible();
  await expect(c.getByRole("button", { name: /Choose folder & clone/ })).toBeVisible();
});

test("Settings is reachable from the initial (no-workspace) screen", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Settings (profile)" }).click();
  await expect(c.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
});

test("the assistant is available on the initial screen (grounded in Home)", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  // The assistant dock renders on the welcome screen so the user can chat before
  // opening a project (its empty-state prompt is shown).
  await expect(c.getByText(/Change a component|Ask about this project/)).toBeVisible();
});

test("opening a workspace reveals the four-region shell", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Activity bar (left rail) with the five activities.
  const rail = c.getByRole("navigation", { name: "Activity bar" });
  await expect(rail.getByRole("button", { name: "Explorer" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Source Control" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Design tokens" })).toBeVisible();
  // The code activity's Explorer + editor + preview bar regions.
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
  await expect(c.getByText("No file open", { exact: true })).toBeVisible();
  await expect(c.getByText("Preview", { exact: true })).toBeVisible(); // the preview bar
  await expect(c.getByRole("button", { name: "Open Browser" })).toBeVisible();
  // The assistant chat (right rail) toggle.
  await expect(rail.getByRole("button", { name: "Toggle assistant" })).toBeVisible();
});

test("the activity bar switches to a reused @vortspec/ui panel", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Switch to Source Control → the code placeholders give way to the reused panel.
  const sc = c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Source Control" });
  await sc.click();
  await expect(sc).toHaveAttribute("aria-pressed", "true");
  // The code activity (Explorer's "No file open") gives way to the reused panel.
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
});

test("switching to a work panel hides the Explorer; Explorer restores it", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const rail = c.getByRole("navigation", { name: "Activity bar" });
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
  // Switch to a work panel — the editor and the Explorer sidebar give way to it.
  await rail.getByRole("button", { name: "Design tokens" }).click();
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toHaveCount(0);
  // Back to Explorer restores the sidebar.
  await rail.getByRole("button", { name: "Explorer" }).click();
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
});

test("the Explorer header chevron collapses the sidebar; the activity reopens it", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
  await c.getByRole("button", { name: "Collapse Explorer" }).click();
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toHaveCount(0);
  // Reopen via the Explorer activity icon.
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Explorer" }).click();
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
});

test("re-clicking the active Explorer activity collapses the sidebar", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const explorer = c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Explorer" });
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
  await explorer.click(); // active → collapse
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toHaveCount(0);
  await explorer.click(); // reopen
  await expect(c.locator("aside").getByText("Explorer", { exact: true })).toBeVisible();
});

test("the breadcrumb Home returns to the workspace picker", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const crumb = c.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumb.getByText(/acme-design-system/)).toBeVisible();
  await crumb.getByRole("button", { name: "Home" }).click();
  // Back to the picker.
  await expect(c.getByRole("heading", { name: "VortSpec", exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: /Open Folder/ })).toBeVisible();
});

test("the status bar shows the git branch and Explorer-only region toggles", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const footer = c.locator("footer");
  // The current git branch shows beside the project name.
  await expect(footer.getByText("main")).toBeVisible();
  // Region toggles are present in the Explorer activity, wrapped with an active state.
  await expect(footer.getByRole("button", { name: "Explorer" })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Editor" })).toBeVisible();
  const assistant = footer.getByRole("button", { name: "Assistant" });
  await expect(assistant).toHaveAttribute("aria-pressed", "true"); // visible by default
  await assistant.click();
  await expect(assistant).toHaveAttribute("aria-pressed", "false"); // now disabled/hidden
  // Switching to a non-Explorer activity hides the region toggles (branch stays).
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Design tokens" }).click();
  await expect(footer.getByRole("button", { name: "Editor" })).toHaveCount(0);
  await expect(footer.getByText("main")).toBeVisible();
});

test("the branch is a menu to switch branches and to create one in Source Control", async ({ mount }) => {
  const mock = {
    ...base,
    gitBranches: [
      { name: "main", current: true, remote: false, upstream: null },
      { name: "feature/x", current: false, remote: false, upstream: null },
    ],
  };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await open(c);
  const footer = c.locator("footer");
  // Open the branch menu → the other branch is listed; picking it checks it out.
  await footer.getByRole("button", { name: /main/ }).click();
  await c.getByRole("menuitem", { name: /feature\/x/ }).click();
  await expect(footer.getByRole("button", { name: /feature\/x/ })).toBeVisible();
  // Reopen → "Create new branch…" takes you to the Source Control section.
  await footer.getByRole("button", { name: /feature\/x/ }).click();
  await c.getByRole("menuitem", { name: /Create new branch/ }).click();
  await expect(
    c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Source Control" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("switching branches is blocked when the working tree is dirty", async ({ mount }) => {
  const mock = {
    ...base,
    gitStatus: { isRepo: true, branch: "main", upstream: null, ahead: 0, behind: 0, staged: [], unstaged: ["a.ts"], untracked: [], conflicts: [], clean: false },
    gitBranches: [
      { name: "main", current: true, remote: false, upstream: null },
      { name: "feature/x", current: false, remote: false, upstream: null },
    ],
  };
  const c = await mount(<App />, { hooksConfig: { mock } });
  await open(c);
  const footer = c.locator("footer");
  await footer.getByRole("button", { name: /main/ }).click();
  await c.getByRole("menuitem", { name: /feature\/x/ }).click();
  // Not switched — the branch is still main, and a warning offers to open SCM.
  await expect(c.getByText(/uncommitted changes/i)).toBeVisible();
  await expect(footer.getByRole("button", { name: /main/ })).toBeVisible();
  await c.getByRole("button", { name: /Open Source Control/ }).click();
  await expect(
    c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Source Control" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("can collapse the assistant chat", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const toggle = c.getByRole("button", { name: "Toggle assistant" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
