import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { DevServerStatus, FsEntry, Project } from "@vortspec/core/ipc";
import type { RunEvent } from "@vortspec/core/run-events";

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

test("the assistant session panel shows model, skills, and MCP status", async ({ mount }) => {
  const INIT_RUN: RunEvent[] = [
    {
      kind: "system-init",
      sessionId: "s",
      model: "claude-opus-4-8[1m]",
      tools: ["Read", "Bash"],
      mcpServers: ["figma-console"],
      mcpErrors: [],
      skills: ["commit", "storybook"],
      agents: ["Explore"],
      plugins: ["vercel"],
      slashCommands: ["init"],
      permissionMode: "default",
      mcpStatuses: [{ name: "figma-console", status: "failed" }],
    },
    { kind: "result", isError: false, text: "done", sessionId: "s" },
  ];
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, runScript: INIT_RUN } } });
  await open(c);
  await c.getByPlaceholder(/tighten Button/).fill("hi");
  await c.getByRole("button", { name: "Send" }).click();
  // The model chip appears; open the session panel.
  const chip = c.getByRole("button", { name: /opus-4-8/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(c.getByText(/Skills \(2\)/)).toBeVisible();
  await expect(c.getByText(/commit, storybook/)).toBeVisible();
  await expect(c.getByText(/·failed/)).toBeVisible();
});

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
