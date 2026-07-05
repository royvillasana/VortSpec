import { z } from "zod";
import { agentRunOptionsSchema } from "./run-events";
import { flowSchema, stageStatusSchema } from "./flow";
import { setupAnswersSchema } from "./setup";

export type { SetupAnswers } from "./setup";

// Re-exported so renderer code can import run + IPC types from one module.
export type {
  RunEvent,
  AgentRunOptions,
  AgentEventEnvelope,
  AgentRawEnvelope,
} from "./run-events";
export type {
  Flow,
  StageDef,
  StageState,
  StageStatus,
  StageKind,
} from "./flow";

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
  "workspace:createProject": {
    request: z.object({ path: z.string(), answers: setupAnswersSchema }),
    response: projectSchema,
  },

  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },

  "agent:startRun": {
    request: agentRunOptionsSchema,
    response: z.object({ runId: z.string() }),
  },
  "agent:cancelRun": { request: z.string(), response: z.void() },

  "flow:get": { request: z.string(), response: flowSchema },
  "flow:setStageStatus": {
    request: z.object({
      projectPath: z.string(),
      stageId: z.string(),
      status: stageStatusSchema,
    }),
    response: flowSchema,
  },
  "flow:approveStage": {
    request: z.object({ projectPath: z.string(), stageId: z.string() }),
    response: flowSchema,
  },
  "flow:requestChanges": {
    request: z.object({
      projectPath: z.string(),
      stageId: z.string(),
      notes: z.string(),
    }),
    response: flowSchema,
  },
  "flow:saveIntake": {
    request: z.object({ projectPath: z.string(), content: z.string() }),
    response: flowSchema,
  },
  "flow:completeInput": {
    request: z.object({ projectPath: z.string(), stageId: z.string() }),
    response: flowSchema,
  },
  "artifact:read": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.string().nullable(),
  },
  "artifact:findLatest": {
    request: z.object({ projectPath: z.string(), suffix: z.string() }),
    response: z.object({ path: z.string(), content: z.string() }).nullable(),
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]["request"]>;
export type IpcResponse<C extends IpcChannel> = z.infer<
  IpcContract[C]["response"]
>;
