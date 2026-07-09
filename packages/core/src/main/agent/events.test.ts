import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseStreamLine, runEventSchema, type RunEvent } from "./events";

function parseTranscript(path: string): RunEvent[] {
  const text = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  return text
    .split("\n")
    .flatMap((line) => parseStreamLine(line));
}

describe("parseStreamLine", () => {
  const events = parseTranscript("./__fixtures__/enrich-brief.stream.jsonl");

  it("maps every event to the RunEvent contract", () => {
    for (const event of events) {
      expect(() => runEventSchema.parse(event)).not.toThrow();
    }
  });

  it("parses the system/init event with model, tools and MCP servers", () => {
    const init = events.find((e) => e.kind === "system-init");
    expect(init).toMatchObject({
      kind: "system-init",
      sessionId: "sess_abc",
      model: "claude-opus-4",
      mcpServers: ["figma"],
      mcpErrors: [],
    });
    expect(init && "tools" in init && init.tools).toContain("Edit");
  });

  it("parses the extended init fields (skills, agents, plugins, mcp status, permission mode)", () => {
    const raw = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "s1",
      model: "claude-opus-4-8[1m]",
      tools: ["Read", "Bash"],
      mcp_servers: [
        { name: "figma-console", status: "pending" },
        { name: "pencil", status: "connected" },
      ],
      skills: ["commit", "storybook"],
      agents: ["Explore", "Plan"],
      plugins: [{ name: "vercel", path: "/x", source: "y" }],
      slash_commands: ["init", "review"],
      permissionMode: "default",
    });
    const [init] = parseStreamLine(raw);
    expect(init).toMatchObject({
      kind: "system-init",
      model: "claude-opus-4-8[1m]",
      skills: ["commit", "storybook"],
      agents: ["Explore", "Plan"],
      plugins: ["vercel"],
      slashCommands: ["init", "review"],
      permissionMode: "default",
      mcpStatuses: [
        { name: "figma-console", status: "pending" },
        { name: "pencil", status: "connected" },
      ],
    });
    expect(() => runEventSchema.parse(init)).not.toThrow();
  });

  it("tolerates a legacy init with no extended fields", () => {
    const [init] = parseStreamLine(JSON.stringify({ type: "system", subtype: "init", tools: [], mcp_servers: [] }));
    expect(init.kind).toBe("system-init");
    expect(() => runEventSchema.parse(init)).not.toThrow();
  });

  it("coalesces partial text deltas in order", () => {
    const deltas = events.filter((e) => e.kind === "text-delta");
    expect(deltas.map((d) => (d.kind === "text-delta" ? d.text : ""))).toEqual([
      "Reading the ",
      "intake answers…",
    ]);
  });

  it("extracts tool_use with file paths", () => {
    const tools = events.filter((e) => e.kind === "tool-use");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ kind: "tool-use", name: "Read", path: "intake.md" });
    expect(tools[1]).toMatchObject({
      kind: "tool-use",
      name: "Write",
      path: "brief.enriched.md",
    });
  });

  it("maps tool results with error state", () => {
    const results = events.filter((e) => e.kind === "tool-result");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.kind === "tool-result" && !r.isError)).toBe(true);
  });

  it("surfaces api_retry with its error category", () => {
    const retry = events.find((e) => e.kind === "api-retry");
    expect(retry).toMatchObject({
      kind: "api-retry",
      attempt: 1,
      maxRetries: 3,
      errorCategory: "overloaded",
    });
  });

  it("turns a malformed line into an adapter error rather than throwing", () => {
    const errors = events.filter((e) => e.kind === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ kind: "error" });
  });

  it("parses the final result with cost and session id", () => {
    const result = events.find((e) => e.kind === "result");
    expect(result).toMatchObject({
      kind: "result",
      isError: false,
      costUsd: 0.0123,
      sessionId: "sess_abc",
    });
  });
});
