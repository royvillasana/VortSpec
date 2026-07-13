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

// A run with thinking + tools (with output), so Reasoning + Tool cards render.
const TOOLRUN: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read", "Bash"], mcpServers: [], mcpErrors: [] },
  { kind: "plan", items: [{ content: "Read the button", status: "completed" }, { content: "Run tests", status: "in_progress" }] },
  { kind: "thinking-delta", text: "I should read the button first." },
  { kind: "tool-use", id: "t1", name: "Read", path: "src/Button.tsx" },
  { kind: "tool-result", toolUseId: "t1", isError: false },
  { kind: "tool-use", id: "t2", name: "Bash", input: "npm test" },
  { kind: "tool-result", toolUseId: "t2", isError: true, text: "1 failing test" },
  { kind: "assistant-text", text: "All set." },
  { kind: "result", isError: false, text: "done", sessionId: "s" },
];

// A run that stops on the weekly usage limit (weekday label → no countdown, so
// Resume is immediately enabled).
const LIMIT: RunEvent[] = [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read"], mcpServers: [], mcpErrors: [] },
  { kind: "assistant-text", text: "Working on it…" },
  { kind: "result", isError: true, sessionId: "s" },
  { kind: "limit-reached", scope: "weekly", resetLabel: "Mon 12:00am", sessionId: "s" },
];

const noop = (): void => {};

test("a usage-limit stop pauses the run and offers Resume (continuing the session)", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={noop} />, {
    hooksConfig: { mock: { runScript: LIMIT } },
  });
  await c.getByPlaceholder(/@ a file/).fill("build the thing");
  await c.getByRole("button", { name: "Send" }).click();
  // The agnostic paused notice — reason + reset + the honesty note.
  await expect(c.getByText(/hit your weekly Claude usage limit/i)).toBeVisible();
  await expect(c.getByText(/Resets Mon 12:00am/)).toBeVisible();
  await expect(c.getByText(/VortSpec adds no usage and stores no keys/)).toBeVisible();
  // Resume continues the SAME session (a resume prompt is sent).
  const resume = c.getByRole("button", { name: "Resume" });
  await expect(resume).toBeEnabled();
  await resume.click();
  const prompts = await c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);
  expect(prompts.some((p) => p.includes("Continue where you left off"))).toBe(true);
});

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

test("auto-starts a handed-off task and shows a resume banner when the run finishes", async ({ mount }) => {
  let returned = 0;
  const c = await mount(
    <AssistantDock
      project={PROJECT}
      autoStart={{ prompt: "reconnect figma please", nonce: 1 }}
      taskReturn={{ origin: "the Foundation", onReturn: () => { returned++; } }}
    />,
    { hooksConfig: { mock: { runScript: REPLY } } },
  );
  // The task prompt auto-ran as the opening bubble — no typing, no Send click…
  await expect(c.getByText("reconnect figma please")).toBeVisible();
  // …and the transcript streamed the reply.
  await expect(c.getByText("Your project uses 45 design tokens.")).toBeVisible();
  const prompts = await c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);
  expect(prompts[0]).toContain("reconnect figma please");
  // When the run finishes, the resume banner points back to where the user was.
  const resume = c.getByRole("button", { name: /Resume the Foundation/ });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect.poll(() => returned).toBe(1);
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
  // The TodoWrite plan renders as a checklist.
  await expect(c.getByText(/Plan · 1\/2/)).toBeVisible();
  await expect(c.getByText("Run tests")).toBeVisible();
  // Extended thinking is captured in a Reasoning block.
  await expect(c.getByText("Reasoning")).toBeVisible();
  // The Bash card expands to its output.
  await c.getByText("Bash", { exact: true }).click();
  await expect(c.getByText("1 failing test")).toBeVisible();
  // The final answer still renders.
  await expect(c.getByText("All set.")).toBeVisible();
});

test("the model selector shows the ACTUAL model and switching applies next message", async ({ mount }) => {
  const c = await mount(<AssistantDock project={PROJECT} onClose={noop} />, {
    hooksConfig: { mock: { runScript: TOOLRUN } },
  });
  // After a run, the selector shows the model Claude actually used (from init).
  await c.getByPlaceholder(/@ a file/).fill("hi");
  await c.getByRole("button", { name: "Send" }).click();
  const selector = c.getByRole("button", { name: /opus-4-8/ });
  await expect(selector).toBeVisible();
  // Switch to Haiku — the label keeps showing the in-use model; the pick applies
  // to the next message.
  await selector.click();
  await c.getByRole("option", { name: /Claude Haiku 4.5/ }).click();
  await c.getByPlaceholder(/@ a file/).fill("again");
  await c.getByRole("button", { name: "Send" }).click();
  const opts = await c.page().evaluate(() => (window as unknown as { __runOpts: Array<Record<string, unknown>> }).__runOpts);
  expect(opts[opts.length - 1].model).toBe("haiku");
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
