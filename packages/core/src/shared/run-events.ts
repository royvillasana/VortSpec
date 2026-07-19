import { z } from "zod";
import { usageLimitScopeSchema } from "./usage-limit";

/**
 * Token usage for one run — captured from the CLI result line's `usage` block so
 * the app can show real token/cost/cache numbers (and measure model-routing
 * savings). Cache reads are the cheap re-reads of the static prompt prefix.
 */
export const runUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
});
export type RunUsage = z.infer<typeof runUsageSchema>;

/**
 * VortSpec's typed, friendly run events — the app-facing shape the renderer
 * consumes. The main-process parser (`src/main/agent/events.ts`) maps raw
 * Claude Code `stream-json` lines into these; nothing outside that parser knows
 * the raw CLI shapes.
 */
export const runEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system-init"),
    sessionId: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.string()),
    mcpErrors: z.array(z.string()),
    // Extended session status (Claude Code parity) — all optional/defensive.
    skills: z.array(z.string()).optional(),
    agents: z.array(z.string()).optional(),
    plugins: z.array(z.string()).optional(),
    slashCommands: z.array(z.string()).optional(),
    permissionMode: z.string().optional(),
    /** MCP servers with their connection status (connected/pending/failed/needs-auth). */
    mcpStatuses: z.array(z.object({ name: z.string(), status: z.string() })).optional(),
  }),
  z.object({ kind: z.literal("text-delta"), text: z.string() }),
  z.object({ kind: z.literal("thinking-delta"), text: z.string() }),
  z.object({ kind: z.literal("assistant-text"), text: z.string() }),
  z.object({
    kind: z.literal("tool-use"),
    id: z.string(),
    name: z.string(),
    path: z.string().optional(),
    /** A short summary of the tool input (e.g. a Bash command). */
    input: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    toolUseId: z.string(),
    isError: z.boolean(),
    /** The tool's output text (trimmed), for richer result rendering. */
    text: z.string().optional(),
  }),
  z.object({
    kind: z.literal("api-retry"),
    attempt: z.number(),
    maxRetries: z.number(),
    errorCategory: z.string(),
    retryDelayMs: z.number().optional(),
  }),
  z.object({
    kind: z.literal("plan"),
    items: z.array(z.object({ content: z.string(), status: z.string() })),
  }),
  z.object({ kind: z.literal("notice"), text: z.string() }),
  z.object({
    kind: z.literal("result"),
    isError: z.boolean(),
    text: z.string().optional(),
    costUsd: z.number().optional(),
    sessionId: z.string().optional(),
    /** Token usage for the run (from the CLI result line), for cost/cache visibility. */
    usage: runUsageSchema.optional(),
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("exit"), code: z.number().nullable() }),
  // The run stopped because the user hit their Claude usage limit — a PAUSE, not
  // an error: it can be resumed once the limit resets. Carries when it resets.
  z.object({
    kind: z.literal("limit-reached"),
    scope: usageLimitScopeSchema,
    /** Human reset label as the CLI printed it (e.g. "3:45pm"), when given. */
    resetLabel: z.string().optional(),
    /** Reset time as epoch ms, when known explicitly (the legacy pipe form). */
    resetsAt: z.number().optional(),
    sessionId: z.string().optional(),
    raw: z.string().optional(),
  }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

/** Persisted usage-limit info for a paused run (drives the resume notice). */
export const runLimitSchema = z.object({
  scope: usageLimitScopeSchema,
  resetLabel: z.string().optional(),
  resetsAt: z.number().optional(),
});
export type RunLimit = z.infer<typeof runLimitSchema>;

/** Options for launching one SDD-DE step through Claude Code headless. */
export const agentRunOptionsSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().min(1),
  appendSystemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  resumeSessionId: z.string().optional(),
  /**
   * Bypass Claude Code permission prompts for this run
   * (`--dangerously-skip-permissions`). Headless `-p` mode cannot show
   * interactive prompts, so MCP tools (Figma, Stitch…) and Bash are otherwise
   * auto-denied. The guided flow sets this because the user explicitly triggers
   * each stage; the run is confined to the project folder.
   */
  bypassPermissions: z.boolean().optional(),
  /** Model alias/id for this run (`--model`, e.g. "opus"/"sonnet"/"haiku"). */
  model: z.string().optional(),
  /**
   * Path to a Claude Code `--mcp-config` JSON file to load for this run (e.g. the
   * VortSpec IDE MCP server, so the assistant can open/clone/switch the workspace
   * and read editor state). The file is written and owned by the caller.
   */
  mcpConfigPath: z.string().optional(),
  /**
   * Load ONLY the `--mcp-config` servers, ignoring the user's globally-configured
   * MCP servers (`--strict-mcp-config`). Used for small, self-contained source
   * edits (the Run-canvas Apply) that only need Read/Edit/Write — skipping the
   * user's Figma/other MCP connections removes most of the session-startup cost.
   * Independent of `--bare`: skills, CLAUDE.md, and the user's login still load.
   */
  strictMcp: z.boolean().optional(),
  /**
   * Ground this run with the precomputed design-system index (Plan B3). When set,
   * the main process prepends a compact digest — the component roster (file paths,
   * dependsOn, figma keys, tokens used) and the token map (name → value → variableKey)
   * — to `--append-system-prompt`, so the agent edits from the map instead of
   * re-discovering the codebase. Read from the B2 scan cache, so it's near-free.
   */
  groundWithIndex: z.boolean().optional(),
  /**
   * Renderer-supplied labels persisted with the run so an interrupted run can be
   * resumed later with its original stage view (kind) and scope (total). Opaque
   * to the main process except for persistence.
   */
  meta: z
    .object({
      kind: z.string().optional(),
      label: z.string().optional(),
      total: z.number().optional(),
    })
    .optional(),
});
export type AgentRunOptions = z.infer<typeof agentRunOptionsSchema>;

/**
 * The last run recorded for a project, used to offer "resume where it left off".
 * `status: "running"` persisted with no live process (after an app restart) means
 * the run was interrupted; `sessionId` lets Claude Code `--resume` that session.
 */
export const lastRunSchema = z.object({
  sessionId: z.string().nullable(),
  title: z.string(),
  kind: z.string().optional(),
  label: z.string().optional(),
  total: z.number().nullable().optional(),
  // "paused" = stopped on the usage limit; resumable once it resets (like an
  // interrupted "running", but with a known reason + reset time).
  status: z.enum(["running", "passed", "cancelled", "failed", "paused"]),
  /** Set when status is "paused" — the usage-limit reason + reset time. */
  limit: runLimitSchema.optional(),
  updatedAt: z.string(),
});
export type LastRun = z.infer<typeof lastRunSchema>;

// ── main→renderer push channels (outside the invoke contract) ─────────

export const AGENT_EVENT_CHANNEL = "agent:event";
export const AGENT_RAW_CHANNEL = "agent:raw";

export const agentEventEnvelopeSchema = z.object({
  runId: z.string(),
  event: runEventSchema,
});
export type AgentEventEnvelope = z.infer<typeof agentEventEnvelopeSchema>;

export const agentRawEnvelopeSchema = z.object({
  runId: z.string(),
  line: z.string(),
});
export type AgentRawEnvelope = z.infer<typeof agentRawEnvelopeSchema>;
