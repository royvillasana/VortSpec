import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project, FsEntry } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const fsTree: Record<string, FsEntry[]> = {
  "": [
    { name: "src", path: "src", type: "dir" },
    { name: "README.md", path: "README.md", type: "file" },
  ],
  src: [{ name: "index.ts", path: "src/index.ts", type: "file" }],
};

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
  fsTree,
  fsFiles: {
    "README.md": "# Acme Design System\n",
    "src/index.ts": "export const x = 1;\n",
  },
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

test("Explorer lists the workspace root and lazily expands folders", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Root entries.
  await expect(c.getByRole("button", { name: "README.md" })).toBeVisible();
  const src = c.getByRole("button", { name: "src", exact: true });
  await expect(src).toBeVisible();
  // Child is not shown until the folder is expanded.
  await expect(c.getByRole("button", { name: "index.ts" })).toHaveCount(0);
  await src.click();
  await expect(c.getByRole("button", { name: "index.ts" })).toBeVisible();
});

async function fsOps(c: import("@playwright/test").Locator): Promise<Array<{ op: string; path: string; to?: string }>> {
  return c.page().evaluate(() => (window as unknown as { __fsOps: Array<{ op: string; path: string; to?: string }> }).__fsOps);
}

test("New File creates a file at the root and opens it", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "New File" }).click();
  const input = c.locator('input[autofocus], input:focus').first();
  await input.fill("notes.md");
  await input.press("Enter");
  await expect.poll(async () => (await fsOps(c)).find((o) => o.op === "createFile")?.path).toBe("notes.md");
});

test("New Folder creates a folder at the root", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "New Folder" }).click();
  const input = c.locator("input:focus").first();
  await input.fill("lib");
  await input.press("Enter");
  // The app also ensures ~/VortSpec (the scoped assistant home) during the welcome
  // phase, so assert the user's folder is among the createDir ops, not that it's first.
  await expect
    .poll(async () => (await fsOps(c)).some((o) => o.op === "createDir" && o.path === "lib"))
    .toBe(true);
});

test("dragging a file onto a folder moves it into that folder", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c
    .getByRole("button", { name: "README.md" })
    .dragTo(c.getByRole("button", { name: "src", exact: true }));
  await expect.poll(async () => (await fsOps(c)).find((o) => o.op === "rename")).toEqual({
    op: "rename",
    path: "README.md",
    to: "src/README.md",
  });
});

test("context menu renames and deletes an entry", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Rename README.md → CHANGES.md.
  await c.getByRole("button", { name: "README.md" }).click({ button: "right" });
  await c.getByRole("button", { name: "Rename" }).click();
  const input = c.locator("input:focus").first();
  await input.fill("CHANGES.md");
  await input.press("Enter");
  await expect.poll(async () => (await fsOps(c)).find((o) => o.op === "rename")).toEqual({
    op: "rename",
    path: "README.md",
    to: "CHANGES.md",
  });
  // Delete src via the context menu → trash.
  await c.getByRole("button", { name: "src", exact: true }).click({ button: "right" });
  await c.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => (await fsOps(c)).find((o) => o.op === "trash")?.path).toBe("src");
});

// REMOVED: "Open Browser opens the selected preview tab's own server (App vs Storybook)".
// The preview bar it drove no longer exists — there is no `preview-bar` testid and no
// "Open Browser" button anywhere in the source; those controls moved to the canvas
// toolbar during canvas-compose-and-preview-bar. Deleted rather than reworded, because
// nothing in the current UI corresponds to what it asserted.

test("the breadcrumb appends the active editor tab after the activity", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const crumb = c.getByRole("navigation", { name: "Breadcrumb" });
  // The breadcrumb shows the activity's LABEL, not its key (see breadcrumbLabel()).
  await expect(crumb).toContainText("Code Editor");
  await expect(crumb.getByText("README.md")).toHaveCount(0); // no file yet
  await c.getByRole("button", { name: "README.md" }).click();
  await expect(crumb.getByText("README.md")).toBeVisible(); // …/explorer/README.md
});

test("opening a file adds a tab; opening a second adds another", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const etabs = c.getByRole("tablist", { name: "Editor tabs" });
  await c.getByRole("button", { name: "README.md" }).click();
  await expect(etabs.getByRole("tab", { name: /README\.md/ })).toBeVisible();
  // Expand src and open index.ts → a second tab.
  await c.getByRole("button", { name: "src", exact: true }).click();
  await c.getByRole("button", { name: "index.ts" }).click();
  await expect(etabs.getByRole("tab", { name: /index\.ts/ })).toBeVisible();
  await expect(etabs.getByRole("tab")).toHaveCount(2);
});

test("offers a diff-vs-HEAD toggle for the open file", async ({ mount }) => {
  const c = await mount(<App />, {
    hooksConfig: { mock: { ...base, fsHead: { "README.md": "# Old title\n" } } },
  });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  const toggle = c.getByRole("button", { name: "Diff vs HEAD" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  // In diff mode the toggle flips to "Editing" and the diff editor mounts.
  await expect(c.getByRole("button", { name: "Editing" })).toBeVisible();
});

test("editor tabs can be dragged to reorder them", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  await c.getByRole("button", { name: "src", exact: true }).click();
  await c.getByRole("button", { name: "index.ts" }).click();
  const etabs = c.getByRole("tablist", { name: "Editor tabs" });
  // Two tabs, in open order: README.md then index.ts.
  await expect(etabs.getByRole("tab")).toHaveCount(2);
  await expect(etabs.getByRole("tab").nth(0)).toContainText("README.md");
  // Drag index.ts before README.md → it becomes the first tab.
  await etabs
    .getByRole("tab")
    .filter({ hasText: "index.ts" })
    .dragTo(etabs.getByRole("tab").filter({ hasText: "README.md" }));
  await expect(etabs.getByRole("tab").nth(0)).toContainText("index.ts");
  await expect(etabs.getByRole("tab").nth(1)).toContainText("README.md");
});

test("a file can be closed", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  await expect(c.getByRole("tab", { name: /README\.md/ })).toBeVisible();
  await c.getByRole("button", { name: "Close README.md" }).click();
  await expect(c.getByRole("tab", { name: /README\.md/ })).toHaveCount(0);
  // "No file open" is the editor's empty state (exact — the chat chip's
  // lowercase "no file open" shouldn't be matched too).
  await expect(c.getByText("No file open", { exact: true })).toBeVisible();
});

test("shows full-color, distinct file-type icons", async ({ mount }) => {
  const tree: Record<string, import("@vortspec/core/ipc").FsEntry[]> = {
    "": [
      { name: "App.tsx", path: "App.tsx", type: "file" },
      { name: "tokens.css", path: "tokens.css", type: "file" },
      { name: "package.json", path: "package.json", type: "file" },
      { name: "assets", path: "assets", type: "dir" },
    ],
  };
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, fsTree: tree } } });
  await open(c);
  // Each file type resolves a distinct icon (data-icon = its glyph/label).
  await expect(c.locator('[data-icon="⚛"]')).toHaveCount(1); // App.tsx → react
  await expect(c.locator('[data-icon="#"]')).toHaveCount(1); // tokens.css → css
  await expect(c.locator('[data-icon="{ }"]')).toHaveCount(1); // package.json → json
  // Folder icon reflects open/closed state.
  const folder = c.getByRole("button", { name: "assets", exact: true });
  await expect(folder.locator('[data-icon="folder-closed"]')).toHaveCount(1);
  await folder.click();
  await expect(folder.locator('[data-icon="folder-open"]')).toHaveCount(1);
});

// (Removed: "editor tracks its container when the assistant toggles" — the assistant is no
// longer a separate right sidebar that resizes the editor; it lives in the left dock's Chat
// tab. Editor-relayout-on-region-resize is still covered by the dock/panel resize paths.)
