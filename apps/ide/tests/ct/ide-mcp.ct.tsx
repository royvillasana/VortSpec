import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { FsEntry, Project } from "@vortspec/core/ipc";
import type { IdeAction } from "@vortspec/core/ide-mcp";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
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

async function pushAction(c: import("@playwright/test").Locator, action: IdeAction): Promise<void> {
  await c.page().evaluate((a) => {
    (window as unknown as { __pushIdeAction: (x: IdeAction) => void }).__pushIdeAction(a);
  }, action);
}

async function resolutions(c: import("@playwright/test").Locator): Promise<Array<{ ok: boolean; message: string }>> {
  return c.page().evaluate(() => (window as unknown as { __ideResolutions: Array<{ ok: boolean; message: string }> }).__ideResolutions);
}

test("a workspace-changing tool call is gated behind a confirmation", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await pushAction(c, { requestId: "r1", tool: "open_folder", args: { path: "/Users/dev/acme-design-system" } });
  // The assistant's request surfaces a confirmation — nothing has happened yet.
  await expect(c.getByRole("dialog", { name: "Open a folder?" })).toBeVisible();
  expect(await resolutions(c)).toHaveLength(0);
  // Approving performs it and replies ok.
  await c.getByRole("button", { name: "Open folder" }).click();
  await expect.poll(async () => (await resolutions(c)).length).toBe(1);
  expect((await resolutions(c))[0].ok).toBe(true);
});

test("declining a gated tool leaves the workspace unchanged and replies declined", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await pushAction(c, { requestId: "r2", tool: "switch_project", args: { name: "something-else" } });
  await expect(c.getByRole("dialog", { name: "Switch project?" })).toBeVisible();
  await c.getByRole("button", { name: "Cancel" }).click();
  await expect(c.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await resolutions(c)).length).toBe(1);
  const r = (await resolutions(c))[0];
  expect(r.ok).toBe(false);
  expect(r.message).toContain("declined");
});

test("a read/navigation tool (open_file) runs without a confirmation", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await pushAction(c, { requestId: "r3", tool: "open_file", args: { path: "README.md" } });
  // No dialog; it just opens and replies ok.
  await expect(c.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await resolutions(c)).length).toBe(1);
  expect((await resolutions(c))[0].ok).toBe(true);
});
