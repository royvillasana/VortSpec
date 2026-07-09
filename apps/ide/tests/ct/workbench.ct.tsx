import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project, FsEntry } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const fsTree: Record<string, FsEntry[]> = {
  "": [{ name: "README.md", path: "README.md", type: "file" }],
};

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
  fsTree,
  fsFiles: { "README.md": "# Acme\n" },
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}
const rail = (c: import("@playwright/test").Locator) => c.getByRole("navigation", { name: "Activity bar" });

test("the Terminal opens as a panel tab, closes, and reopens", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Open the panel from the status bar → a Terminal tab appears.
  await c.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(c.getByRole("button", { name: "Close Terminal" })).toBeVisible();
  // Close the tab → panel closes.
  await c.getByRole("button", { name: "Close Terminal" }).click();
  await expect(c.getByRole("button", { name: "Close Terminal" })).toHaveCount(0);
  // Reopen from the status bar.
  await c.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(c.getByRole("button", { name: "Close Terminal" })).toBeVisible();
});

test("the panel can be docked to the side", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "Terminal", exact: true }).click();
  await c.getByRole("button", { name: "Move panel to the side" }).click();
  await expect(c.getByRole("button", { name: "Move panel to the bottom" })).toBeVisible();
});

test("closing the editor leaves the panel; reopening restores it", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "Terminal", exact: true }).click();
  // Close the editor via the status bar.
  await c.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Close Terminal" })).toBeVisible();
  // Reopen the editor.
  await c.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(c.getByText("No file open", { exact: true })).toBeVisible();
});

test("Source Control and Settings views are reachable and chromeless", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await rail(c).getByRole("button", { name: "Source Control" }).click();
  await expect(c.getByRole("heading", { name: "Source Control" })).toBeVisible();
  // Chromeless: the panel's internal ProjectRail (a "Flow" nav item) isn't rendered.
  await expect(c.getByRole("button", { name: "Flow", exact: true })).toHaveCount(0);
  // Settings → the user profile view.
  await rail(c).getByRole("button", { name: "Settings (profile)" }).click();
  await expect(c.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
});

test("the Storybook activity shows the Storybook runtime on localhost", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await rail(c).getByRole("button", { name: "Storybook" }).click();
  // The RunApp view in Storybook mode — its own header, distinct from "Run app".
  await expect(c.getByText("Storybook", { exact: true })).toBeVisible();
  await expect(c.getByText("localhost", { exact: true })).toBeVisible();
});

test("activity-bar icons expose hover tooltips (accessible names)", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  for (const name of ["Explorer", "Source Control", "Design tokens", "Settings (profile)"]) {
    await expect(rail(c).getByRole("button", { name })).toHaveAttribute("title", name);
  }
});
