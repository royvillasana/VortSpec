import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { FsEntry, Project } from "@vortspec/core/ipc";

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
  fsTree: { "": [{ name: "README.md", path: "README.md", type: "file" }] } as Record<string, FsEntry[]>,
  fsFiles: { "README.md": "# Acme\n" },
};

async function open(c: import("@playwright/test").Locator): Promise<void> {
  await c.getByRole("button", { name: /acme-design-system/ }).click();
}

const active = (c: import("@playwright/test").Locator) => c.getByTestId("active-conversation");
const runOpts = (c: import("@playwright/test").Locator): Promise<Array<Record<string, unknown>>> =>
  c.page().evaluate(() => (window as unknown as { __runOpts: Array<Record<string, unknown>> }).__runOpts);

test("conversations are independent tabs with persistent, isolated transcripts", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Conversation 1 → "alpha".
  await active(c).getByPlaceholder(/@ a file/).fill("alpha");
  await active(c).getByRole("button", { name: "Send" }).click();
  await expect(active(c).getByText("alpha")).toBeVisible();
  // New conversation → "beta"; "alpha" is not in it.
  await c.getByRole("button", { name: "New conversation" }).click();
  await expect(c.getByRole("tab", { name: /Conversation 2/ })).toBeVisible();
  await expect(active(c).getByText("alpha")).toHaveCount(0);
  await active(c).getByPlaceholder(/@ a file/).fill("beta");
  await active(c).getByRole("button", { name: "Send" }).click();
  await expect(active(c).getByText("beta")).toBeVisible();
  // Back to Conversation 1: "alpha" persisted, "beta" isolated to conversation 2.
  await c.getByRole("button", { name: "Conversation 1", exact: true }).click();
  await expect(active(c).getByText("alpha")).toBeVisible();
  await expect(active(c).getByText("beta")).toHaveCount(0);
});

test("the per-conversation agent shapes the run (Review = read-only + reviewer prompt)", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  // Switch the agent to Review.
  await active(c).getByRole("button", { name: /Build/ }).click();
  await active(c).getByRole("option", { name: /Review/ }).click();
  await active(c).getByPlaceholder(/@ a file/).fill("look at this");
  await active(c).getByRole("button", { name: "Send" }).click();
  const opts = await runOpts(c);
  const last = opts[opts.length - 1];
  expect(String(last.appendSystemPrompt)).toContain("code reviewer");
  // Read-only toolset — no Write/Edit/Bash.
  expect(last.allowedTools).not.toContain("Write");
  expect(last.allowedTools).toContain("Read");
});

test("a conversation tab can be renamed and closed", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "New conversation" }).click();
  // Rename Conversation 2 via double-click.
  await c.getByRole("button", { name: "Conversation 2", exact: true }).dblclick();
  const input = c.locator("input:focus");
  await input.fill("Bugfix");
  await input.press("Enter");
  await expect(c.getByRole("tab", { name: /Bugfix/ })).toBeVisible();
  // Close it → back to a single conversation.
  await c.getByRole("button", { name: "Close Bugfix" }).click();
  await expect(c.getByRole("tab", { name: /Bugfix/ })).toHaveCount(0);
  await expect(c.getByRole("tab", { name: /Conversation 1/ })).toBeVisible();
});
