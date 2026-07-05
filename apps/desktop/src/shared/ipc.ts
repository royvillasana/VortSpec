import { z } from "zod";

/**
 * The typed, zod-validated contract between the main and renderer processes.
 * Every IPC channel has a request schema and a response schema; the main
 * process validates both at the boundary (see `src/main/ipc.ts`). This is the
 * only place channel names and payload shapes are defined.
 */

// ── Environment check ────────────────────────────────────────────────

export const checkStatusSchema = z.enum(["pass", "fail", "unknown", "checking"]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const fixActionSchema = z.object({
  /** install-link → open an external URL; open-login → run login in the PTY; verify → re-run the check */
  kind: z.enum(["install-link", "open-login", "verify"]),
  label: z.string(),
  url: z.string().url().optional(),
});
export type FixAction = z.infer<typeof fixActionSchema>;

export const envCheckIdSchema = z.enum([
  "node",
  "git",
  "claude-install",
  "claude-login",
]);
export type EnvCheckId = z.infer<typeof envCheckIdSchema>;

export const envCheckSchema = z.object({
  id: envCheckIdSchema,
  label: z.string(),
  status: checkStatusSchema,
  detail: z.string(),
  fix: fixActionSchema.optional(),
});
export type EnvCheck = z.infer<typeof envCheckSchema>;

export const envReportSchema = z.object({
  checks: z.array(envCheckSchema),
  /** true when every required check passes */
  ready: z.boolean(),
});
export type EnvReport = z.infer<typeof envReportSchema>;

// ── Workspace / projects ─────────────────────────────────────────────

export const toolkitStatusSchema = z.object({
  present: z.boolean(),
  version: z.string().nullable(),
  /** true when a newer toolkit version is available to install */
  updateAvailable: z.boolean(),
});
export type ToolkitStatus = z.infer<typeof toolkitStatusSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  toolkit: toolkitStatusSchema,
  lastRunStatus: z
    .enum(["none", "running", "needs-review", "approved", "failed"])
    .default("none"),
  addedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectListSchema = z.array(projectSchema);

// ── Channel map: request → response schemas ──────────────────────────

export const ipcContract = {
  "system:isElectron": { request: z.void(), response: z.boolean() },
  "system:getVersion": { request: z.void(), response: z.string() },

  "env:check": { request: z.void(), response: envReportSchema },
  "env:verifyLogin": { request: z.void(), response: envCheckSchema },
  "env:openInstall": { request: z.string().url(), response: z.void() },

  "workspace:pickFolder": {
    request: z.object({ create: z.boolean().default(false) }).optional(),
    response: projectSchema.nullable(),
  },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:openFolder": { request: z.string(), response: z.void() },
  "workspace:refreshProject": { request: z.string(), response: projectSchema },

  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]["request"]>;
export type IpcResponse<C extends IpcChannel> = z.infer<
  IpcContract[C]["response"]
>;
