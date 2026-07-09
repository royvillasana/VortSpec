import { runEventSchema, type RunEvent } from "@vortspec/core/run-events";

/**
 * The parser that turns raw Claude Code `stream-json` NDJSON lines into
 * VortSpec's typed, friendly run events. This is the single place that knows
 * the shape of Claude Code's stream output — the rest of the app consumes
 * `RunEvent` only (drift isolation, design D4). Event shapes verified against
 * docs/launch-gate-claude-code-headless.md.
 */

// Re-exported so the parser and its contract are importable together.
export { runEventSchema, type RunEvent };

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(s: string, n = 200): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Pull a file path out of a tool_use input, for file-touching tools. */
function toolPath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "filePath", "notebook_path"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Turn a TodoWrite tool input into a `plan` event (its checklist), or null. */
function todoPlan(input: unknown): RunEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const todos = (input as Record<string, unknown>).todos;
  if (!Array.isArray(todos) || todos.length === 0) return null;
  const items = todos
    .map((t) => {
      const r = t as Record<string, unknown>;
      return { content: String(r.content ?? ""), status: String(r.status ?? "pending") };
    })
    .filter((i) => i.content);
  return items.length ? { kind: "plan", items } : null;
}

/** A short, human summary of a tool's input for the Tool card (e.g. the command). */
function toolInputSummary(name: unknown, input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const r = input as Record<string, unknown>;
  const n = typeof name === "string" ? name.toLowerCase() : "";
  if (n === "bash" && typeof r.command === "string") return r.command;
  if (typeof r.pattern === "string") return r.pattern; // Grep/Glob
  if (typeof r.description === "string") return r.description;
  return undefined;
}

/** Flatten a tool_result content (string or block array) to trimmed text. */
function toolResultText(content: unknown): string | undefined {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content
      .map((b) => (typeof b === "object" && b !== null && typeof (b as Record<string, unknown>).text === "string" ? (b as Record<string, unknown>).text : ""))
      .join("");
  }
  text = text.trim();
  return text ? text.slice(0, 4000) : undefined;
}

function mapAssistant(message: unknown): RunEvent[] {
  if (typeof message !== "object" || message === null) return [];
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const events: RunEvent[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
      events.push({ kind: "assistant-text", text: b.text });
    } else if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) {
      events.push({ kind: "thinking-delta", text: b.thinking });
    } else if (b.type === "tool_use" && b.name === "TodoWrite") {
      // Represent the plan as a checklist rather than a bare tool card.
      const plan = todoPlan(b.input);
      if (plan) events.push(plan);
    } else if (b.type === "tool_use") {
      events.push({
        kind: "tool-use",
        id: typeof b.id === "string" ? b.id : "",
        name: typeof b.name === "string" ? b.name : "tool",
        path: toolPath(b.input),
        input: toolInputSummary(b.name, b.input),
      });
    }
  }
  return events;
}

function mapToolResults(message: unknown): RunEvent[] {
  if (typeof message !== "object" || message === null) return [];
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const events: RunEvent[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === "tool_result") {
      events.push({
        kind: "tool-result",
        toolUseId: typeof b.tool_use_id === "string" ? b.tool_use_id : "",
        isError: b.is_error === true,
        text: toolResultText(b.content),
      });
    }
  }
  return events;
}

function mapObject(obj: Record<string, unknown>): RunEvent[] {
  switch (obj.type) {
    case "system": {
      if (obj.subtype === "init") {
        const mcp = Array.isArray(obj.mcp_servers) ? obj.mcp_servers : [];
        const pluginErrors = Array.isArray(obj.plugin_errors) ? obj.plugin_errors : [];
        const strList = (v: unknown): string[] =>
          (Array.isArray(v) ? v : []).map(String).filter(Boolean);
        const nameList = (v: unknown): string[] =>
          (Array.isArray(v) ? v : [])
            .map((x) =>
              typeof x === "object" && x !== null
                ? String((x as Record<string, unknown>).name ?? "")
                : String(x),
            )
            .filter(Boolean);
        const mcpStatuses = mcp
          .map((m) =>
            typeof m === "object" && m !== null
              ? {
                  name: String((m as Record<string, unknown>).name ?? ""),
                  status: String((m as Record<string, unknown>).status ?? "unknown"),
                }
              : { name: String(m), status: "unknown" },
          )
          .filter((m) => m.name);
        return [
          {
            kind: "system-init",
            sessionId: typeof obj.session_id === "string" ? obj.session_id : undefined,
            model: typeof obj.model === "string" ? obj.model : undefined,
            tools: strList(obj.tools),
            mcpServers: mcpStatuses.map((m) => m.name),
            mcpErrors: pluginErrors.map((e) =>
              typeof e === "object" && e !== null
                ? String((e as Record<string, unknown>).message ?? "plugin error")
                : String(e),
            ),
            skills: strList(obj.skills),
            agents: strList(obj.agents),
            plugins: nameList(obj.plugins),
            slashCommands: strList(obj.slash_commands),
            permissionMode:
              typeof obj.permissionMode === "string"
                ? obj.permissionMode
                : typeof obj.permission_mode === "string"
                  ? obj.permission_mode
                  : undefined,
            mcpStatuses,
          },
        ];
      }
      if (obj.subtype === "api_retry") {
        return [
          {
            kind: "api-retry",
            attempt: Number(obj.attempt ?? 0),
            maxRetries: Number(obj.max_retries ?? 0),
            errorCategory: typeof obj.error === "string" ? obj.error : "unknown",
            retryDelayMs:
              typeof obj.retry_delay_ms === "number" ? obj.retry_delay_ms : undefined,
          },
        ];
      }
      if (obj.subtype === "plugin_install") {
        return [
          {
            kind: "notice",
            text: `Plugin ${String(obj.name ?? "")} ${String(obj.status ?? "")}`.trim(),
          },
        ];
      }
      return [];
    }
    case "assistant":
      return mapAssistant(obj.message);
    case "user":
      return mapToolResults(obj.message);
    case "stream_event": {
      const event = obj.event as Record<string, unknown> | undefined;
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return [{ kind: "text-delta", text: delta.text }];
      }
      if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        return [{ kind: "thinking-delta", text: delta.thinking }];
      }
      return [];
    }
    case "result":
      return [
        {
          kind: "result",
          isError: obj.is_error === true || obj.subtype === "error",
          text: typeof obj.result === "string" ? obj.result : undefined,
          costUsd: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
          sessionId: typeof obj.session_id === "string" ? obj.session_id : undefined,
        },
      ];
    default:
      return [];
  }
}

/** Parse one NDJSON line into zero or more typed run events. */
export function parseStreamLine(line: string): RunEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return [{ kind: "error", message: `Unparseable stream line: ${truncate(trimmed)}` }];
  }
  if (typeof obj !== "object" || obj === null) return [];
  return mapObject(obj as Record<string, unknown>);
}
