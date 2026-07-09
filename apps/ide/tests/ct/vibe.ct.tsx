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

test("slash menu opens from the composer and /model runs a model card", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  const input = c.getByPlaceholder(/tighten Button/);
  // Typing a slash token opens the command menu.
  await input.fill("/mo");
  await expect(c.getByRole("button", { name: /\/model/ })).toBeVisible();
  // Enter picks the highlighted command → an inline model card with the models.
  await input.press("Enter");
  await expect(c.getByText(/\/model — model/)).toBeVisible();
  await expect(c.getByText("Claude Opus 4.8")).toBeVisible();
  await expect(c.getByText("Claude Haiku 4.5")).toBeVisible();
});

test("/mcp card reflects the session's MCP server status", async ({ mount }) => {
  const INIT_RUN: RunEvent[] = [
    {
      kind: "system-init",
      sessionId: "s",
      model: "claude-opus-4-8[1m]",
      tools: ["Read"],
      mcpServers: ["figma-console"],
      mcpErrors: [],
      skills: [],
      agents: [],
      plugins: [],
      slashCommands: ["commit"],
      permissionMode: "default",
      mcpStatuses: [{ name: "figma-console", status: "failed" }],
    },
    { kind: "result", isError: false, text: "done", sessionId: "s" },
  ];
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, runScript: INIT_RUN } } });
  await open(c);
  // Start a session so the /mcp card has data.
  await c.getByPlaceholder(/tighten Button/).fill("hi");
  await c.getByRole("button", { name: "Send" }).click();
  // Now call /mcp.
  await c.getByPlaceholder(/tighten Button/).fill("/mcp");
  await c.getByPlaceholder(/tighten Button/).press("Enter");
  await expect(c.getByText(/\/mcp — MCP servers/)).toBeVisible();
  await expect(c.getByText("figma-console")).toBeVisible();
  await expect(c.getByText("failed", { exact: true })).toBeVisible();
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

test("sends the open file as hidden grounding without echoing it in the bubble", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: base } });
  await open(c);
  await c.getByRole("button", { name: "README.md" }).click();
  await c.getByPlaceholder(/tighten Button/).fill("explain this");
  await c.getByRole("button", { name: "Send" }).click();
  // The prompt actually sent to Claude carries the live IDE grounding…
  const prompts = await c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);
  expect(prompts[0]).toContain("[IDE context] The open file is README.md.");
  expect(prompts[0]).toContain("explain this");
  // …but the visible user bubble shows only what the user typed.
  const bubble = c.getByText("explain this", { exact: true });
  await expect(bubble).toBeVisible();
  await expect(c.getByText(/\[IDE context\]/)).toHaveCount(0);
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
