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

test("opening a file adds a tab; opening a second adds another", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  await expect(c.getByRole("tab", { name: /README\.md/ })).toBeVisible();
  // Expand src and open index.ts → a second tab.
  await c.getByRole("button", { name: "src", exact: true }).click();
  await c.getByRole("button", { name: "index.ts" }).click();
  await expect(c.getByRole("tab", { name: /index\.ts/ })).toBeVisible();
  await expect(c.getByRole("tab")).toHaveCount(2);
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
