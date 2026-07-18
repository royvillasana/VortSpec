import { test, expect } from "@playwright/experimental-ct-react";
import { ComposeHarness } from "./support/compose-harness";
import type { RunEvent } from "@vortspec/core/run-events";

// A composition run that returns two options as a fenced JSON result.
const OPTIONS_JSON = JSON.stringify({
  options: [
    { index: 0, title: "Filters row", axis: "components", componentsUsed: ["Button"], note: "buttons in a row" },
    { index: 1, title: "Segmented control", axis: "layout", componentsUsed: ["Card", "Button"], note: "grouped" },
  ],
  fewerReason: null,
  noMatch: null,
  writtenFile: "src/Home.tsx",
});
const runWith = (text: string): RunEvent[] => [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read", "Edit", "Write"], mcpServers: [], mcpErrors: [] },
  { kind: "result", isError: false, text, sessionId: "s" },
];
// A realistic multi-step run: the JSON lands in an assistant message, and the final
// `result` event is just a summary — the parser must find it in the transcript.
const runWithAssistantJson = (json: string): RunEvent[] => [
  { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read", "Edit", "Write"], mcpServers: [], mcpErrors: [] },
  { kind: "assistant-text", text: `I composed two options.\n\`\`\`json\n${json}\n\`\`\`` },
  { kind: "result", isError: false, text: "Done — wrote 2 options to src/Home.tsx.", sessionId: "s" },
];

const composeOps = (c: import("@playwright/test").Locator): Promise<Array<Record<string, unknown>>> =>
  c.page().evaluate(() => (window as unknown as { __composeOps: Array<Record<string, unknown>> }).__composeOps);
const runPrompts = (c: import("@playwright/test").Locator): Promise<string[]> =>
  c.page().evaluate(() => (window as unknown as { __runPrompts: string[] }).__runPrompts);

test("an empty roster blocks 'into gap' but allows a new container (§4)", async ({ mount }) => {
  const c = await mount(<ComposeHarness roster="empty" />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``) } },
  });
  // Into gap with no roster → the empty-roster message, no Generate.
  await expect(c.getByTestId("compose-empty-roster")).toBeVisible();
  // Switch to New row → the message goes and Generate works WITHOUT an intent.
  await c.getByRole("button", { name: "New row" }).click();
  await expect(c.getByTestId("compose-empty-roster")).toHaveCount(0);
  await c.getByRole("button", { name: "Generate" }).click();
  await expect(c.getByTestId("compose-option-index")).toBeVisible();
  const sent = await runPrompts(c);
  expect(sent[0]).toContain("Create a NEW row container");
});

test("Generate is gated on an expressed intent", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, { hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``) } } });
  const generate = c.getByRole("button", { name: "Generate" });
  await expect(generate).toBeDisabled();
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await expect(generate).toBeEnabled();
});

test("the layout controls set the insert axis and slot count (not the option count)", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``) } },
  });
  // Override the inferred axis (row → column) and bump the slot count to 3.
  await c.getByRole("button", { name: "Column", exact: true }).click();
  await c.getByRole("button", { name: "More slots" }).click();
  await c.getByRole("button", { name: "More slots" }).click();
  await expect(c.getByTestId("compose-slot-count")).toHaveText("3");
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters column");
  await c.getByRole("button", { name: "Generate" }).click();
  const sent = await runPrompts(c);
  expect(sent[0]).toContain("vertical (column) flow");
  expect(sent[0]).toContain("Insert as a column");
  expect(sent[0]).toContain("Create 3 items"); // the layout slot count
  expect(sent[0]).toMatch(/at most 3 option/); // AI option count unaffected
});

test("the close button cancels the insert (drops the placeholder)", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, { hooksConfig: { mock: {} } });
  await c.getByRole("button", { name: "Cancel insert" }).click();
  const closed = await c.page().evaluate(() => (window as unknown as { __closed?: boolean }).__closed);
  expect(closed).toBe(true);
});

test("the Components tab multi-selects components as context for Generate", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``) } },
  });
  await expect(c.getByRole("tab", { name: "Generate" })).toBeVisible();
  await c.getByRole("tab", { name: /Components/ }).click();
  const list = c.getByTestId("component-picker-list");
  await expect(list).toContainText("Card");
  await expect(list).toContainText("Button");
  // Selecting components adds them as context chips (not an immediate insert).
  await list.getByRole("button", { name: /Card/ }).click();
  await list.getByRole("button", { name: /^Button/ }).click();
  await expect(c.getByTestId("compose-context-chips")).toContainText("Card");
  await expect(c.getByTestId("compose-context-chips")).toContainText("Button");
  // No run started just from selecting.
  expect(await runPrompts(c)).toEqual([]);
  // Describe it in Generate → the run carries the chosen components as preferred.
  await c.getByRole("tab", { name: "Generate" }).click();
  await c.getByPlaceholder(/Describe what to build with/).fill("a filters toolbar");
  await c.getByRole("button", { name: "Generate" }).click();
  const sent = await runPrompts(c);
  expect(sent[0]).toContain("a filters toolbar");
  expect(sent[0]).toContain("specifically chose these components");
  expect(sent[0]).toContain("Card, Button");
});

test("a context chip is removable", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, { hooksConfig: { mock: {} } });
  await c.getByRole("tab", { name: /Components/ }).click();
  await c.getByTestId("component-picker-list").getByRole("button", { name: /Card/ }).click();
  await expect(c.getByTestId("compose-context-chips")).toContainText("Card");
  await c.getByRole("button", { name: "Remove Card" }).click();
  await expect(c.getByTestId("compose-context-chips")).toHaveCount(0);
});

test("the hover preview shows the component's Storybook story when available", async ({ mount }) => {
  const c = await mount(<ComposeHarness storyUrl="http://localhost:6006/iframe.html" />, { hooksConfig: { mock: {} } });
  await c.getByRole("tab", { name: /Components/ }).click();
  await c.getByTestId("component-picker-list").getByRole("button", { name: /Card/ }).hover();
  await expect(c.getByTestId("component-preview-frame")).toHaveAttribute("src", /iframe\.html\?c=Card/);
});

test("generating snapshots first, then cycles options with provenance and accepts one", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``) } },
  });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();

  // Options appear, with per-option provenance.
  await expect(c.getByTestId("compose-option-index")).toContainText("Option 1 of 2");
  await expect(c.getByTestId("compose-provenance")).toContainText("Button");

  // A snapshot was taken before the run wrote anything (restore-able).
  const prompts = await runPrompts(c);
  expect(prompts[0]).toContain("compose"); // the composition prompt ran
  expect(prompts[0]).toContain("VORTSPEC:COMPOSE"); // instructed to write markers

  // Cycle to option 2, then accept it → composeAccept records keepOption 1.
  await c.getByRole("button", { name: "Next option" }).click();
  await expect(c.getByTestId("compose-option-index")).toContainText("Option 2 of 2");
  await c.getByRole("button", { name: "Accept" }).click();

  const ops = await composeOps(c);
  const accept = ops.find((o) => o.op === "accept");
  expect(accept).toMatchObject({ file: "src/Home.tsx", keepOption: 1 });
  // Accept surfaces the owed Screen Creation update, naming the screen.
  await expect(c.getByTestId("compose-screen-update")).toContainText("src/Home.tsx");
});

test("while generating, the button is a Stop that cancels and restores", async ({ mount }) => {
  // A run that never emits a result stays in flight, so the Stop state is stable.
  const stuck: RunEvent[] = [
    { kind: "system-init", model: "claude-opus-4-8", sessionId: "s", tools: ["Read"], mcpServers: [], mcpErrors: [] },
  ];
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: stuck, snapshot: [{ path: "src/Home.tsx", content: "original" }] } },
  });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();
  // The Generate button became Stop, with a thinking indicator.
  await expect(c.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Generate" })).toHaveCount(0);
  await expect(c.getByTestId("compose-progress")).toBeVisible();
  // Stop cancels the run and restores the snapshot.
  await c.getByRole("button", { name: "Stop" }).click();
  const ops = await composeOps(c);
  expect(ops.some((o) => o.op === "restore")).toBe(true);
});

test("parses the result from the transcript when it's not in the final result event", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWithAssistantJson(OPTIONS_JSON) } },
  });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();
  // Options surface even though the JSON was in an assistant message, not result.text.
  await expect(c.getByTestId("compose-option-index")).toContainText("Option 1 of 2");
});

test("discard restores the snapshot and writes no accept", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``), snapshot: [{ path: "src/Home.tsx", content: "original" }] } },
  });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();
  await expect(c.getByTestId("compose-option-index")).toBeVisible();
  await c.getByRole("button", { name: "Discard" }).click();

  const ops = await composeOps(c);
  expect(ops.some((o) => o.op === "restore")).toBe(true);
  expect(ops.some((o) => o.op === "accept")).toBe(false);
});

test("a generated/git-ignored target is refused, offering only discard (§6.8)", async ({ mount }) => {
  const c = await mount(<ComposeHarness />, {
    hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${OPTIONS_JSON}\n\`\`\``), composeTargetOk: false } },
  });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();
  // The run wrote into a non-committable file → refused before any accept is offered.
  await expect(c.getByTestId("compose-error")).toContainText("git-ignored");
  await expect(c.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Discard" })).toBeVisible();
});

test("an ambiguous/not-found anchor stops with a human sentence (§6.9)", async ({ mount }) => {
  const stopped = JSON.stringify({
    options: [],
    stopped: { reason: "The anchor matched two Card siblings and I would not guess.", candidates: ["Home.tsx:20", "Home.tsx:41"] },
    writtenFile: null,
  });
  const c = await mount(<ComposeHarness />, { hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${stopped}\n\`\`\``) } } });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a filters row");
  await c.getByRole("button", { name: "Generate" }).click();
  await expect(c.getByTestId("compose-error")).toContainText("would not guess");
  await expect(c.getByTestId("compose-error")).toContainText("Home.tsx:20");
  // Nothing was written, so there's no accept — only discard.
  await expect(c.getByRole("button", { name: "Accept" })).toHaveCount(0);
});

test("a no-component-match result routes into extract-component", async ({ mount }) => {
  const noMatch = JSON.stringify({ options: [], noMatch: { reason: "Nothing in the roster fits a testimonial.", suggestedName: "Testimonial" }, writtenFile: null });
  const c = await mount(<ComposeHarness />, { hooksConfig: { mock: { runScript: runWith(`\`\`\`json\n${noMatch}\n\`\`\``) } } });
  await c.getByPlaceholder(/Describe what belongs here/).fill("a testimonial");
  await c.getByRole("button", { name: "Generate" }).click();
  await expect(c.getByTestId("compose-no-match")).toContainText("testimonial");
  await c.getByRole("button", { name: "Extract a new component" }).click();
  const extracted = await c.page().evaluate(() => (window as unknown as { __extract?: string }).__extract);
  expect(extracted).toBe("Testimonial");
});
