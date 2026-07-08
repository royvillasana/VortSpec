import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { DevServerStatus, FsEntry, Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, version: "1.0.0", updateAvailable: false },
} as Project;

const fsTree: Record<string, FsEntry[]> = {
  "": [{ name: "README.md", path: "README.md", type: "file" }],
};
const RUNNING: DevServerStatus = { state: "running", url: "http://localhost:5199", script: "dev", message: null };

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

test("mounts a modify-capable assistant grounded in the workspace", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // The dock's modify-mode composer is present (vibe-engineering).
  await expect(c.getByPlaceholder(/tighten Button/)).toBeVisible();
  // Context starts with no open file.
  await expect(c.getByTestId("assistant-context")).toContainText("no file open");
});

test("seeds the assistant context with the open file", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  await expect(c.getByTestId("assistant-context")).toContainText("README.md");
});

test("surfaces the live preview URL in the assistant context", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, appStatus: RUNNING } } });
  await open(c);
  await expect(c.getByTestId("assistant-context")).toContainText("localhost:5199");
});

test("gated artifacts stay behind the reused Manifest approval path", async ({ mount }) => {
  // The IDE adds no bypass: DESIGN.md lives in the reused DesignManifest panel,
  // which routes edits through the shared approval/snapshot handlers.
  const c = await mount(<App />, {
    hooksConfig: { mock: { ...base, manifest: { path: "DESIGN.md", content: "# DS", exists: true } } },
  });
  await open(c);
  await c.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Design manifest" }).click();
  await expect(c.getByText("No file open", { exact: true })).toHaveCount(0);
});
