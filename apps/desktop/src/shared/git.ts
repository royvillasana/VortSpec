import { z } from "zod";

/**
 * Git contracts (M1). VortSpec drives the user's own `git` (and later `gh`/`glab`)
 * as argument arrays confined to the project folder — no stored credentials, no
 * VortSpec account. Guardrail: the surface exposes NO branch deletion and NO
 * force-push / history rewrite — it is additive only.
 */

export const gitChangeStatusSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "typechange",
  "untracked",
  "conflicted",
]);
export type GitChangeStatus = z.infer<typeof gitChangeStatusSchema>;

export const gitChangeSchema = z.object({
  path: z.string(),
  status: gitChangeStatusSchema,
});
export type GitChange = z.infer<typeof gitChangeSchema>;

export const gitStatusSchema = z.object({
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  /** Staged (index) changes. */
  staged: z.array(gitChangeSchema),
  /** Unstaged (worktree) changes to tracked files. */
  unstaged: z.array(gitChangeSchema),
  /** Untracked file paths. */
  untracked: z.array(z.string()),
  /** Paths with merge conflicts. */
  conflicts: z.array(z.string()),
  clean: z.boolean(),
});
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const gitBranchSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.boolean(),
  upstream: z.string().nullable(),
});
export type GitBranch = z.infer<typeof gitBranchSchema>;

export const gitRemoteSchema = z.object({ name: z.string(), url: z.string() });
export type GitRemote = z.infer<typeof gitRemoteSchema>;

export const gitLogEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  date: z.string(),
});
export type GitLogEntry = z.infer<typeof gitLogEntrySchema>;

/** Result of a mutating op (stage/commit/push/…): a human message + ok flag. */
export const gitResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  /** A URL produced by the op (repo/PR), when applicable. */
  url: z.string().nullable().optional(),
});
export type GitResult = z.infer<typeof gitResultSchema>;

export const repoVisibilitySchema = z.enum(["private", "public", "internal"]);
export type RepoVisibility = z.infer<typeof repoVisibilitySchema>;

export const repoCreateRequestSchema = z.object({
  projectPath: z.string(),
  name: z.string().min(1),
  visibility: repoVisibilitySchema,
  description: z.string().optional(),
});
export const prCreateRequestSchema = z.object({
  projectPath: z.string(),
  base: z.string().optional(),
  title: z.string().min(1),
  body: z.string().optional(),
});
export const accountSwitchRequestSchema = z.object({ account: z.string().min(1) });
export const importRequestSchema = z.object({
  projectPath: z.string(),
  url: z.string().min(1),
  branch: z.string().optional(),
});
export const publishRequestSchema = z.object({
  projectPath: z.string(),
  branch: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
});

/** Presence + auth of the GitHub CLI (a light M1 read; full provider is M2). */
export const providerAuthSchema = z.object({
  provider: z.enum(["github"]),
  cliInstalled: z.boolean(),
  authenticated: z.boolean(),
  /** Logged-in accounts (for the multi-account picker); [] when none. */
  accounts: z.array(z.string()),
  /** The active account, when known. */
  activeAccount: z.string().nullable(),
  /** A human next-step when not installed/authed. */
  hint: z.string().nullable(),
});
export type ProviderAuth = z.infer<typeof providerAuthSchema>;

// ── request payloads (paths/branches/messages travel as data, never interpolated) ──
export const gitCommitRequestSchema = z.object({ projectPath: z.string(), message: z.string().min(1) });
export const gitPathsRequestSchema = z.object({ projectPath: z.string(), paths: z.array(z.string()) });
export const gitBranchRequestSchema = z.object({ projectPath: z.string(), name: z.string().min(1) });
