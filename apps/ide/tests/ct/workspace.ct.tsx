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
