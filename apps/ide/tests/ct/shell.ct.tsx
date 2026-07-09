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
  await expect(c.getByRole("heading", { name: "VortSpec IDE" })).toBeVisible();
  // VS Code–style Start links (not solid buttons) + the brand mark.
  await expect(c.getByRole("img", { name: "VortSpec" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Open Folder/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /Clone Repository/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /acme-design-system/ })).toBeVisible();
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
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
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
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
  // Switch to a work panel — the editor and the Explorer sidebar give way to it.
  await rail.getByRole("button", { name: "Design tokens" }).click();
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
  await expect(c.getByText("Explorer", { exact: true })).toHaveCount(0);
  // Back to Explorer restores the sidebar.
  await rail.getByRole("button", { name: "Explorer" }).click();
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
});

test("the Explorer header chevron collapses the sidebar; the activity reopens it", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
  await c.getByRole("button", { name: "Collapse Explorer" }).click();
  await expect(c.getByText("Explorer", { exact: true })).toHaveCount(0);
  // Reopen via the Explorer activity icon.
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Explorer" }).click();
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
});

test("re-clicking the active Explorer activity collapses the sidebar", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const explorer = c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Explorer" });
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
  await explorer.click(); // active → collapse
  await expect(c.getByText("Explorer", { exact: true })).toHaveCount(0);
  await explorer.click(); // reopen
  await expect(c.getByText("Explorer", { exact: true })).toBeVisible();
});

test("the breadcrumb Home returns to the workspace picker", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const crumb = c.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumb.getByText(/acme-design-system/)).toBeVisible();
  await crumb.getByRole("button", { name: "Home" }).click();
  // Back to the picker.
  await expect(c.getByRole("heading", { name: "VortSpec IDE" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Open Folder/ })).toBeVisible();
});

test("can collapse the assistant chat", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const toggle = c.getByRole("button", { name: "Toggle assistant" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
