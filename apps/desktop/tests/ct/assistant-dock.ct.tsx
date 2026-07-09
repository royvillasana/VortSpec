import { test, expect } from "@playwright/experimental-ct-react";
import { AssistantDock } from "@vortspec/ui/AssistantDock";
import { PROJECT } from "./support/fixtures";
import type { RunEvent } from "@vortspec/core/run-events";

// A short assistant reply transcript for the started session.
const REPLY: RunEvent[] = [
  {
    kind: "system-init",
    model: "claude-opus-4-8",
    sessionId: "sess-a1",
    tools: ["Read", "Grep", "Glob"],
    mcpServers: [],
    mcpErrors: [],
  },
  { kind: "assistant-text", text: "Your project uses 45 design tokens." },
  { kind: "result", isError: false, text: "done", sessionId: "sess-a1" },
];

// A run that uses tools, so the Tool cards render.
const TOOLRUN: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read", "Bash"], mcpServers: [], mcpErrors: [] },
  { kind: "tool-use", name: "Read", path: "src/Button.tsx" },
  { kind: "tool-result", isError: false },
  { kind: "tool-use", name: "Bash", path: "npm test" },
  { kind: "tool-result", isError: true },
  { kind: "assistant-text", text: "All set." },
  { kind: "result", isError: false, text: "done", sessionId: "s" },
];

const noop = (): void => {};

test("shows the empty prompt state and spends no usage until first send", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={noop} />, {
    hooksConfig: { mock: { runScript: REPLY } },
  });
  await expect(c.getByText("Ask about this project")).toBeVisible();
  await expect(c.getByText(/spends no usage until you send/)).toBeVisible();
  // Send button is disabled with an empty draft (no run started).
  await expect(c.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("first message starts a session and streams the reply", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={noop} />, {
    hooksConfig: { mock: { runScript: REPLY } },
  });
  await c.getByPlaceholder(/@ a file/).fill("What tokens does this use?");
  await c.getByRole("button", { name: "Send" }).click();

  // The user's message appears as a bubble…
  await expect(c.getByText("What tokens does this use?")).toBeVisible();
  // …and the assistant's reply streams in from the transcript.
  await expect(c.getByText("Your project uses 45 design tokens.")).toBeVisible();
});

test("an Open-in-Chat selection ref becomes a chip and rides in the prompt", async ({ mount }) => {
  const ref = { path: "src/Button.tsx", startLine: 2, endLine: 5, text: "const x = 1;", nonce: 1 };
  const c = await mount(<AssistantDock project={PROJECT} pendingRef={ref} onClose={noop} />, {
    hooksConfig: { mock: { runScript: REPLY } },
  });
  // The selection shows as an attachment chip with its line range.
  await expect(c.getByTestId("attachment-chip")).toContainText("Button.tsx:2-5");
  await c.getByPlaceholder(/@ a file/).fill("explain this selection");
  await c.getByRole("button", { name: "Send" }).click();
  const prompts = await c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);
  expect(prompts[0]).toContain("src/Button.tsx:L2-L5");
  expect(prompts[0]).toContain("const x = 1;");
});

test("tool calls render as Tool cards with per-tool status", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={noop} />, {
    hooksConfig: { mock: { runScript: TOOLRUN } },
  });
  await c.getByPlaceholder(/@ a file/).fill("do the thing");
  await c.getByRole("button", { name: "Send" }).click();
  // The tool activity is grouped and surfaced (previously invisible).
  await expect(c.getByText(/Worked · 2 steps/)).toBeVisible();
  await expect(c.getByText("Read", { exact: true })).toBeVisible();
  await expect(c.getByText("src/Button.tsx")).toBeVisible();
  await expect(c.getByText("Bash", { exact: true })).toBeVisible();
  // The final answer still renders.
  await expect(c.getByText("All set.")).toBeVisible();
});

test("close button fires onClose", async ({ mount }) => {
  let closed = false;
  const c = await mount(
    <AssistantDock project={PROJECT} onClose={() => (closed = true)} />,
    { hooksConfig: { mock: {} } },
  );
  await c.getByTitle("Close assistant").click();
  expect(closed).toBe(true);
});

test("modify mode relabels the dock and adapts the empty state", async ({ mount }) => {
  const c = await mount(
    <AssistantDock project={PROJECT} allowModify onClose={() => undefined} />,
    { hooksConfig: { mock: {} } },
  );
  await expect(c.getByText("Modify with Claude")).toBeVisible();
  await expect(c.getByText("Change a component")).toBeVisible();
  await expect(c.getByText(/Storybook reloads live/)).toBeVisible();
});

test("read-only mode is the default labelling", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={() => undefined} />, {
    hooksConfig: { mock: {} },
  });
  await expect(c.getByText("Assistant")).toBeVisible();
  await expect(c.getByText("Ask about this project")).toBeVisible();
});
