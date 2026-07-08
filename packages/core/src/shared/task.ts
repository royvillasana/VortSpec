import { z } from "zod";

/**
 * Task-tracker contracts (M7) — Jira first, behind a provider-agnostic shape so
 * other trackers can follow. VortSpec drives the user's own Jira CLI (no stored
 * VortSpec account); it offers to install the CLI with explicit permission, and
 * only falls back to a keychain API token if the user declines.
 */

export const taskAuthSchema = z.object({
  provider: z.literal("jira"),
  /** The Jira/Atlassian CLI is installed. */
  cliInstalled: z.boolean(),
  /** The CLI is configured/authenticated (a login exists). */
  configured: z.boolean(),
  /** The logged-in account (email/username), when known. */
  account: z.string().nullable(),
  /** Known sites/accounts, for the multi-account picker. */
  sites: z.array(z.string()),
  /** A shell command that would install the CLI (shown before running, with permission). */
  installCommand: z.string().nullable(),
  /** A human next-step when not installed/configured. */
  hint: z.string().nullable(),
});
export type TaskAuth = z.infer<typeof taskAuthSchema>;

export const taskProjectSchema = z.object({ key: z.string(), name: z.string() });
export type TaskProject = z.infer<typeof taskProjectSchema>;

export const taskIssueSchema = z.object({
  key: z.string(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.string().nullable(),
});
export type TaskIssue = z.infer<typeof taskIssueSchema>;

/** Result of a task op (create/install/…): a human message + optional issue ref. */
export const taskResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  key: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});
export type TaskResult = z.infer<typeof taskResultSchema>;

export const issueTypeSchema = z.enum(["Story", "Task", "Bug"]);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const createIssueRequestSchema = z.object({
  project: z.string().min(1),
  type: issueTypeSchema,
  summary: z.string().min(1),
  description: z.string().optional(),
});
export const createFromSpecRequestSchema = z.object({
  projectPath: z.string(),
  project: z.string().min(1),
  type: issueTypeSchema,
  /** Project-relative path to the spec that becomes the story body. */
  specPath: z.string().min(1),
  /** The ref (component/screen name) to link the created issue to. */
  ref: z.string().min(1),
});
export const linkRequestSchema = z.object({ projectPath: z.string() });
export type IssueLinks = Record<string, string>;
export const issueLinksSchema = z.record(z.string(), z.string());
