import { describe, expect, it } from "vitest";
import { initialRun, reduceRun, type RunModel } from "./run-model";

/** Drive a fresh model through a sequence of actions. */
function run(...actions: Parameters<typeof reduceRun>[1][]): RunModel {
  return actions.reduce(reduceRun, initialRun);
}

describe("reduceRun — chat transcript", () => {
  it("gives each assistant message its own bubble (not one concatenated block)", () => {
    const model = run(
      { type: "start" },
      { type: "event", event: { kind: "assistant-text", text: "First message." } },
      { type: "event", event: { kind: "tool-use", id: "t1", name: "Read", path: "a.ts" } },
      { type: "event", event: { kind: "assistant-text", text: "Second message." } },
    );
    expect(model.messages).toHaveLength(2);
    expect(model.messages.map((m) => m.role)).toEqual(["assistant", "assistant"]);
    expect(model.messages.map((m) => m.text)).toEqual(["First message.", "Second message."]);
  });

  it("streams text-delta into a live preview, then finalizes it into a bubble without duplicating", () => {
    const streaming = run(
      { type: "start" },
      { type: "event", event: { kind: "text-delta", text: "Hel" } },
      { type: "event", event: { kind: "text-delta", text: "lo" } },
    );
    expect(streaming.streamingText).toBe("Hello");
    expect(streaming.messages).toHaveLength(0);

    const finalized = reduceRun(streaming, {
      type: "event",
      event: { kind: "assistant-text", text: "Hello" },
    });
    expect(finalized.streamingText).toBe("");
    expect(finalized.messages).toHaveLength(1);
    expect(finalized.messages[0]).toMatchObject({ role: "assistant", text: "Hello" });
  });

  it("appends a user bubble on send and keeps the prior transcript + session", () => {
    const base = run(
      { type: "start" },
      { type: "event", event: { kind: "system-init", tools: [], mcpServers: [], mcpErrors: [], sessionId: "sess-1" } },
      { type: "event", event: { kind: "assistant-text", text: "Done." } },
      { type: "event", event: { kind: "result", isError: false } },
    );
    const afterSend = reduceRun(base, { type: "send", text: "Please also fix D2." });
    expect(afterSend.status).toBe("running");
    expect(afterSend.sessionId).toBe("sess-1");
    expect(afterSend.messages.map((m) => m.role)).toEqual(["assistant", "user"]);
    expect(afterSend.messages[1].text).toBe("Please also fix D2.");
  });

  it("captures sessionId from init and result, and commits trailing stream on result", () => {
    const model = run(
      { type: "start" },
      { type: "event", event: { kind: "text-delta", text: "partial" } },
      { type: "event", event: { kind: "result", isError: false, sessionId: "sess-9" } },
    );
    expect(model.sessionId).toBe("sess-9");
    expect(model.status).toBe("done");
    expect(model.streamingText).toBe("");
    expect(model.messages).toEqual([expect.objectContaining({ role: "assistant", text: "partial" })]);
  });

  it("start wipes the transcript for a fresh stage run", () => {
    const withHistory = run(
      { type: "start" },
      { type: "event", event: { kind: "assistant-text", text: "old" } },
    );
    expect(reduceRun(withHistory, { type: "start" }).messages).toHaveLength(0);
  });

  it("a usage-limit stop pauses the run (paused wins over the error result) and keeps its reset", () => {
    const model = run(
      { type: "start" },
      { type: "event", event: { kind: "assistant-text", text: "working" } },
      // The CLI's terminal result looks like an error, then limit-reached follows.
      { type: "event", event: { kind: "result", isError: true, sessionId: "sess-x" } },
      {
        type: "event",
        event: { kind: "limit-reached", scope: "session", resetLabel: "3:45pm", sessionId: "sess-x" },
      },
      { type: "event", event: { kind: "exit", code: 1 } },
    );
    expect(model.status).toBe("paused");
    expect(model.limit).toEqual({ scope: "session", resetLabel: "3:45pm", resetsAt: undefined });
    expect(model.sessionId).toBe("sess-x"); // captured so we can --resume
    expect(model.messages).toEqual([expect.objectContaining({ text: "working" })]);
  });
});
