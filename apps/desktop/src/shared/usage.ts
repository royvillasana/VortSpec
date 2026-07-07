import { z } from "zod";

/**
 * The plan-usage snapshot mirrored from the user's own Claude Code — captured by
 * running `claude -p "/usage" --output-format json` (a local command: no model
 * call, no token cost, the user's own login, nothing proxied). We surface the
 * same percentage bars Claude shows so the user never has to leave the app.
 */
export const usageLimitSchema = z.object({
  /** e.g. "Current session", "Current week (all models)", "Current week (Fable)". */
  label: z.string(),
  /** 0–100, as Claude reports it. */
  percent: z.number(),
  /** Human reset string exactly as Claude prints it, or null if none given. */
  resetsAt: z.string().nullable(),
});
export type UsageLimit = z.infer<typeof usageLimitSchema>;

export const usageResultSchema = z.object({
  /** True when `/usage` was read and parsed into at least one limit bar. */
  available: z.boolean(),
  /** The opening line (e.g. "You are currently using your subscription…"), if any. */
  headline: z.string().nullable(),
  /** The percentage bars (session, weekly, per-model). */
  limits: z.array(usageLimitSchema),
  /** Claude's own approximation disclaimer, if present. */
  note: z.string().nullable(),
  /** The full raw `/usage` text for a details view. */
  raw: z.string(),
  /** ISO timestamp of when this snapshot was captured. */
  capturedAt: z.string(),
  /** A human, next-step error message when usage couldn't be read (else null). */
  error: z.string().nullable(),
});
export type UsageResult = z.infer<typeof usageResultSchema>;
