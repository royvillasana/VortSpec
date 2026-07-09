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
  await expect.poll(async () => (await fsOps(c)).find((o) => o.op === "createDir")?.path).toBe("lib");
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

test("Open Browser opens the selected preview tab's own server (App vs Storybook)", async ({ mount }) => {
  const mock = {
    ...base,
    appStatus: { state: "running", url: "http://localhost:4000", script: "dev", message: null },
    devStatus: { state: "stopped", url: null, script: null, message: null },
    devStartStatus: { state: "running", url: "http://localhost:6006", script: "storybook", message: null },
  } as typeof base & Record<string, unknown>;
  const c = await mount(<App />, { hooksConfig: { mock } });
  await open(c);
  const bar = c.getByTestId("preview-bar");
  const opens = (): Promise<string[]> => c.page().evaluate(() => (window as unknown as { __openInstalls: string[] }).__openInstalls);
  // App tab (default) → opens the app's URL.
  await bar.getByRole("button", { name: "Open Browser" }).click();
  await expect.poll(opens).toContain("http://localhost:4000");
  // Switch to Storybook → opens the Storybook URL (starting it), never the app's.
  await bar.getByRole("button", { name: "Storybook" }).click();
  await bar.getByRole("button", { name: "Open Browser" }).click();
  await expect.poll(opens).toContain("http://localhost:6006");
  // Back to App → opens the app again (state stays correct across switches).
  await bar.getByRole("button", { name: "App", exact: true }).click();
  await bar.getByRole("button", { name: "Open Browser" }).click();
  await expect.poll(async () => (await opens()).filter((u) => u === "http://localhost:4000").length).toBeGreaterThanOrEqual(2);
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

test("editor tracks its container both directions when the assistant toggles", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  const host = c.getByTestId("code-editor");
  await expect(host).toBeVisible();
  const width = async (): Promise<number> => (await host.boundingBox())!.width;
  const toggle = c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Toggle assistant" });

  const w0 = await width();
  // Close the assistant → the editor's container grows → Monaco re-lays out wider.
  await toggle.click();
  await expect.poll(width).toBeGreaterThan(w0);
  const w1 = await width();
  // Reopen it → the editor shrinks back (the bug was: it didn't re-layout on grow).
  await toggle.click();
  await expect.poll(width).toBeLessThan(w1);
});
