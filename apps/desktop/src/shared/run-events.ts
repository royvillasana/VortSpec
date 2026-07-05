import { z } from "zod";

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
  }),
  z.object({ kind: z.literal("text-delta"), text: z.string() }),
  z.object({ kind: z.literal("assistant-text"), text: z.string() }),
  z.object({
    kind: z.literal("tool-use"),
    id: z.string(),
    name: z.string(),
    path: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    toolUseId: z.string(),
    isError: z.boolean(),
  }),
  z.object({
    kind: z.literal("api-retry"),
    attempt: z.number(),
    maxRetries: z.number(),
    errorCategory: z.string(),
    retryDelayMs: z.number().optional(),
  }),
  z.object({ kind: z.literal("notice"), text: z.string() }),
  z.object({
    kind: z.literal("result"),
    isError: z.boolean(),
    text: z.string().optional(),
    costUsd: z.number().optional(),
    sessionId: z.string().optional(),
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("exit"), code: z.number().nullable() }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

/** Options for launching one SDD-DE step through Claude Code headless. */
export const agentRunOptionsSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().min(1),
  appendSystemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  resumeSessionId: z.string().optional(),
});
export type AgentRunOptions = z.infer<typeof agentRunOptionsSchema>;

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
