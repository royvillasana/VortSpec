import { test, expect } from "@playwright/experimental-ct-react";
import { AssistantDock } from "../../src/renderer/src/components/AssistantDock";
import { PROJECT } from "./support/fixtures";
import type { RunEvent } from "../../src/shared/run-events";

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
  await c.getByPlaceholder(/Ask about tokens/).fill("What tokens does this use?");
  await c.getByRole("button", { name: "Send" }).click();

  // The user's message appears as a bubble…
  await expect(c.getByText("What tokens does this use?")).toBeVisible();
  // …and the assistant's reply streams in from the transcript.
  await expect(c.getByText("Your project uses 45 design tokens.")).toBeVisible();
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
