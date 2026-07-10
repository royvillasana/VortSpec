import { z } from "zod";
import { agentRunOptionsSchema, lastRunSchema } from "./run-events";
import { usageResultSchema } from "./usage";
import { profileSchema } from "./profile";
import {
  taskAuthSchema,
  taskProjectSchema,
  taskIssueSchema,
  taskResultSchema,
  createIssueRequestSchema,
  createFromSpecRequestSchema,
  issueLinksSchema,
} from "./task";
import {
  gitStatusSchema,
  gitBranchSchema,
  gitRemoteSchema,
  gitLogEntrySchema,
  gitGraphResultSchema,
  gitResultSchema,
  providerAuthSchema,
  gitCommitRequestSchema,
  gitPathsRequestSchema,
  gitBranchRequestSchema,
  repoCreateRequestSchema,
  prCreateRequestSchema,
  accountSwitchRequestSchema,
  importRequestSchema,
  publishRequestSchema,
} from "./git";
import { flowSchema, stageStatusSchema, runHistoryResultSchema } from "./flow";
import { devServerStatusSchema } from "./dev-server";
import { manifestResultSchema, manifestVersionsResultSchema } from "./manifest";
import { updateInfoSchema } from "./update";
import { commentThreadSchema, commentCollaboratorSchema, notifyResultSchema } from "./comment";

export type { DevServerStatus, DevServerState, DevServerUpdate } from "./dev-server";
export { DEV_SERVER_UPDATE_CHANNEL, devServerUpdateSchema } from "./dev-server";
import { fsEntrySchema, fsFileSchema, fsWriteResultSchema } from "./fs";
export {
  WORKSPACE_CHANGE_CHANNEL,
  workspaceChangeSchema,
  fsEntrySchema,
  fsFileSchema,
  fsWriteResultSchema,
} from "./fs";
export type { FsEntry, FsFile, FsWriteResult, WorkspaceChange } from "./fs";
export { TERMINAL_DATA_CHANNEL, terminalDataSchema } from "./terminal";
export type { TerminalData } from "./terminal";
import { ideStateSchema, ideActionResultSchema, ideConfigResultSchema, ideOkSchema } from "./ide-mcp";
export {
  IDE_ACTION_CHANNEL,
  ideStateSchema,
  ideActionSchema,
  ideActionResultSchema,
  ideSelectionSchema,
} from "./ide-mcp";
export type { IdeState, IdeAction, IdeActionResult, IdeSelection } from "./ide-mcp";
import {
  figmaConnectionSchema,
  figmaConnectRequestSchema,
  figmaSyncRequestSchema,
  figmaSyncResultSchema,
  figmaSelectionSchema,
} from "./figma";
export {
  figmaConnectionSchema,
  figmaCliModeSchema,
  figmaConnectRequestSchema,
  figmaSyncRequestSchema,
  figmaSyncResultSchema,
  figmaSelectionSchema,
} from "./figma";
export type {
  FigmaConnection,
  FigmaCliMode,
  FigmaSyncResult,
  FigmaComponent,
  FigmaNode,
  FigmaSelection,
} from "./figma";
export { figmaComponentSchema } from "./figma";
import { setupAnswersSchema, projectConfigSchema } from "./setup";
import {
  inspectorTokensResultSchema,
  inspectorComponentsResultSchema,
  verificationResultSchema,
  fileSnapshotListSchema,
} from "./inspector";

export type { SetupAnswers, ProjectConfig } from "./setup";
export type {
  InspectorToken,
  InspectorTokensResult,
  TokenType,
  TokenSource,
  TokenUsage,
  TokenDrift,
  FigmaVariable,
} from "./inspector";
export type {
  InspectorComponent,
  InspectorComponentsResult,
  PropControl,
  ComponentStatus,
} from "./inspector";
export type {
  VerificationFinding,
  VerificationResult,
  FindingSeverity,
} from "./inspector";
export type { FileSnapshot } from "./inspector";
export type {
  BridgeNode,
  BridgeTree,
  Rect,
  NodeReadout,
  FieldKind,
  SectionField,
  DesignSectionId,
  DesignSection,
  VariantControl,
  Selection,
  BridgeCommand,
  BridgeEvent,
} from "./inspector-bridge";
export {
  INSPECTOR_BRIDGE_CHANNEL,
  bridgeCommandSchema,
  bridgeEventSchema,
} from "./inspector-bridge";
export type {
  ManifestResult,
  ManifestVersion,
  ManifestVersionsResult,
  SnapshotReason,
} from "./manifest";
export type { UpdateInfo } from "./update";

// Re-exported so renderer code can import run + IPC types from one module.
export type {
  RunEvent,
  AgentRunOptions,
  AgentEventEnvelope,
  AgentRawEnvelope,
  LastRun,
} from "./run-events";
export type { TaskAuth, TaskProject, TaskIssue, TaskResult, IssueType, IssueLinks } from "./task";
export type { UsageResult, UsageLimit } from "./usage";
export type { Profile, ProfilePreferences } from "./profile";
export type {
  GitStatus,
  GitChange,
  GitBranch,
  GitRemote,
  GitLogEntry,
  GitGraphCommit,
  GitGraphStats,
  GitGraphResult,
  GitResult,
  ProviderAuth,
  ProviderId,
} from "./git";
export type {
  Flow,
  StageDef,
  StageState,
  StageStatus,
  StageKind,
  RunSummary,
  RunStageSummary,
  RunHistoryResult,
} from "./flow";

/**
 * The typed, zod-validated contract between the main and renderer processes.
 * Every IPC channel has a request schema and a response schema; the main
 * process validates both at the boundary (see `src/main/ipc.ts`). This is the
 * only place channel names and payload shapes are defined.
 */

/** One entry from a running Storybook's story index (`index.json`). */
export const storybookEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  name: z.string(),
  type: z.enum(["docs", "story"]),
  importPath: z.string().optional(),
});
export type StorybookEntry = z.infer<typeof storybookEntrySchema>;

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
  "figma-mcp",
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
  "system:homeDir": { request: z.void(), response: z.string() },
  // file:// URL of the Run-Canvas <webview> guest preload (inspector bridge).
  "system:guestPreloadUrl": { request: z.void(), response: z.string() },
  "system:clipboardImage": {
    request: z.void(),
    response: z.object({ path: z.string(), dataUrl: z.string() }).nullable(),
  },
  "system:checkUpdate": { request: z.void(), response: updateInfoSchema },

  "env:check": { request: z.void(), response: envReportSchema },
  "env:verifyLogin": { request: z.void(), response: envCheckSchema },
  "env:verifyFigmaMcp": { request: z.void(), response: envCheckSchema },
  "env:openInstall": { request: z.string().url(), response: z.void() },

  "workspace:pickFolder": {
    request: z.object({ create: z.boolean().default(false) }).optional(),
    response: projectSchema.nullable(),
  },
  "workspace:createFolder": { request: z.void(), response: projectSchema.nullable() },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:openFolder": { request: z.string(), response: z.void() },
  "workspace:revealPath": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.void(),
  },
  "workspace:refreshProject": { request: z.string(), response: projectSchema },
  "workspace:envStatus": {
    request: z.string(),
    response: z.object({
      hasEnv: z.boolean(),
      examples: z.array(z.string()),
      placeholders: z.array(z.string()).default([]),
    }),
  },
  "workspace:createEnv": {
    request: z.object({ projectPath: z.string(), example: z.string() }),
    response: gitResultSchema,
  },
  "workspace:openWalkthrough": { request: z.string(), response: gitResultSchema },
  "workspace:createProject": {
    request: z.object({ path: z.string(), answers: setupAnswersSchema }),
    response: projectSchema,
  },
  "workspace:listDir": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.array(fsEntrySchema),
  },
  "workspace:readFile": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: fsFileSchema,
  },
  // Read an image/asset as a `data:` URL for the Explorer preview (null when the
  // file isn't a previewable image, or is too large).
  "workspace:readAsset": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.object({ dataUrl: z.string().nullable(), tooLarge: z.boolean() }),
  },
  "workspace:searchFiles": {
    request: z.object({ projectPath: z.string(), query: z.string(), limit: z.number().optional() }),
    response: z.array(fsEntrySchema),
  },
  "workspace:writeFile": {
    request: z.object({ projectPath: z.string(), relPath: z.string(), content: z.string() }),
    response: fsWriteResultSchema,
  },
  "workspace:createFile": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: fsWriteResultSchema,
  },
  "workspace:createDir": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: fsWriteResultSchema,
  },
  "workspace:rename": {
    request: z.object({ projectPath: z.string(), from: z.string(), to: z.string() }),
    response: fsWriteResultSchema,
  },
  "workspace:trash": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: fsWriteResultSchema,
  },
  "workspace:watchStart": { request: z.string(), response: z.void() },
  "workspace:watchStop": { request: z.string(), response: z.void() },
  "git:fileAtHead": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.string().nullable(),
  },
  "terminal:create": {
    request: z.object({
      id: z.string(),
      projectPath: z.string(),
      cols: z.number().optional(),
      rows: z.number().optional(),
    }),
    response: z.void(),
  },
  "terminal:write": {
    request: z.object({ id: z.string(), data: z.string() }),
    response: z.void(),
  },
  "terminal:resize": {
    request: z.object({ id: z.string(), cols: z.number(), rows: z.number() }),
    response: z.void(),
  },
  "terminal:kill": { request: z.string(), response: z.void() },

  // IDE MCP integration (IDE app only; cockpit never calls these)
  "ide:mcpConfigPath": { request: z.object({ projectPath: z.string() }), response: ideConfigResultSchema },
  "ide:reportState": { request: ideStateSchema, response: ideOkSchema },
  "ide:resolveAction": { request: ideActionResultSchema, response: ideOkSchema },

  "figma:status": { request: z.void(), response: figmaConnectionSchema },
  "figma:openAppManagement": { request: z.void(), response: z.void() },
  "figma:connect": { request: figmaConnectRequestSchema, response: figmaConnectionSchema },
  "figma:syncVariables": { request: figmaSyncRequestSchema, response: figmaSyncResultSchema },
  "figma:syncComponents": { request: figmaSyncRequestSchema, response: figmaSyncResultSchema },
  "figma:selection": { request: z.void(), response: figmaSelectionSchema },

  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },

  "agent:startRun": {
    request: agentRunOptionsSchema,
    response: z.object({ runId: z.string() }),
  },
  "agent:cancelRun": { request: z.string(), response: z.void() },
  "agent:hasActiveRun": { request: z.string(), response: z.boolean() },
  "agent:lastRun": { request: z.string(), response: lastRunSchema.nullable() },
  "usage:get": { request: z.void(), response: usageResultSchema },

  // Git (M1) — additive only; no delete/force channels exist.
  "git:status": { request: z.string(), response: gitStatusSchema },
  "git:branches": { request: z.string(), response: z.array(gitBranchSchema) },
  "git:remotes": { request: z.string(), response: z.array(gitRemoteSchema) },
  "git:log": { request: z.string(), response: z.array(gitLogEntrySchema) },
  "git:graph": { request: z.string(), response: gitGraphResultSchema },
  "git:stage": { request: gitPathsRequestSchema, response: gitResultSchema },
  "git:unstage": { request: gitPathsRequestSchema, response: gitResultSchema },
  "git:commit": { request: gitCommitRequestSchema, response: gitResultSchema },
  "git:checkout": { request: gitBranchRequestSchema, response: gitResultSchema },
  "git:createBranch": { request: gitBranchRequestSchema, response: gitResultSchema },
  "git:fetch": { request: z.string(), response: gitResultSchema },
  "git:pull": { request: z.string(), response: gitResultSchema },
  "git:push": { request: z.string(), response: gitResultSchema },
  "git:init": { request: z.string(), response: gitResultSchema },
  "provider:auth": { request: z.string(), response: providerAuthSchema },
  "provider:switchAccount": { request: accountSwitchRequestSchema, response: gitResultSchema },
  "provider:createRepo": { request: repoCreateRequestSchema, response: gitResultSchema },
  "provider:createPR": { request: prCreateRequestSchema, response: gitResultSchema },
  "git:import": { request: importRequestSchema, response: gitResultSchema },
  "provider:publish": { request: publishRequestSchema, response: gitResultSchema },

  // Tasks (Jira, M7)
  "task:auth": { request: z.void(), response: taskAuthSchema },
  "task:install": { request: z.void(), response: taskResultSchema },
  "task:projects": { request: z.void(), response: z.array(taskProjectSchema) },
  "task:createIssue": { request: createIssueRequestSchema, response: taskResultSchema },
  "task:createFromSpec": { request: createFromSpecRequestSchema, response: taskResultSchema },
  "task:links": { request: z.string(), response: issueLinksSchema },
  "task:issueStatus": { request: z.string(), response: taskIssueSchema },
  "profile:get": { request: z.void(), response: profileSchema },
  "profile:save": { request: profileSchema, response: profileSchema },

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
  "flow:getHistory": { request: z.string(), response: runHistoryResultSchema },
  "devserver:start": { request: z.string(), response: devServerStatusSchema },
  "devserver:stop": { request: z.string(), response: z.void() },
  "devserver:status": { request: z.string(), response: devServerStatusSchema },
  "appserver:start": { request: z.string(), response: devServerStatusSchema },
  "appserver:stop": { request: z.string(), response: z.void() },
  "appserver:status": { request: z.string(), response: devServerStatusSchema },
  "devserver:previewInfo": {
    request: z.string(),
    response: z.object({ hasStorybook: z.boolean(), script: z.string().nullable() }),
  },
  "devserver:storybookIndex": {
    request: z.string(),
    response: z.array(storybookEntrySchema),
  },
  "manifest:get": { request: z.string(), response: manifestResultSchema },
  "manifest:save": {
    request: z.object({ projectPath: z.string(), content: z.string() }),
    response: manifestResultSchema,
  },
  "manifest:listVersions": { request: z.string(), response: manifestVersionsResultSchema },
  "manifest:readVersion": {
    request: z.object({ projectPath: z.string(), id: z.string() }),
    response: z.string().nullable(),
  },
  "manifest:restoreVersion": {
    request: z.object({ projectPath: z.string(), id: z.string() }),
    response: manifestResultSchema,
  },
  "manifest:snapshot": {
    request: z.object({
      projectPath: z.string(),
      reason: z.enum(["generate", "edit", "approve", "restore"]),
      runId: z.string().optional(),
    }),
    response: manifestResultSchema,
  },
  "flow:setPublishTarget": {
    request: z.object({ projectPath: z.string(), repoUrl: z.string() }),
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
  "project:config": {
    request: z.string(),
    response: projectConfigSchema.nullable(),
  },
  "inspector:getTokens": {
    request: z.string(),
    response: inspectorTokensResultSchema,
  },
  "inspector:getComponents": {
    request: z.string(),
    response: inspectorComponentsResultSchema,
  },
  "inspector:setTokenValue": {
    request: z.object({
      projectPath: z.string(),
      name: z.string(),
      value: z.string(),
    }),
    response: inspectorTokensResultSchema,
  },
  "inspector:getVerification": {
    request: z.string(),
    response: verificationResultSchema,
  },
  "inspector:snapshotComponent": {
    request: z.object({ projectPath: z.string(), file: z.string() }),
    response: fileSnapshotListSchema,
  },
  "inspector:snapshotTokenScope": {
    request: z.string(),
    response: fileSnapshotListSchema,
  },
  "inspector:restoreFiles": {
    request: z.object({ projectPath: z.string(), files: fileSnapshotListSchema }),
    response: z.void(),
  },
  // Run-canvas comments — repo-backed threads under .vortspec/comments/.
  "comments:list": {
    request: z.string(),
    response: z.array(commentThreadSchema),
  },
  "comments:upsert": {
    request: z.object({ projectPath: z.string(), thread: commentThreadSchema }),
    response: z.object({ thread: commentThreadSchema, path: z.string() }),
  },
  "comments:resolve": {
    request: z.object({ projectPath: z.string(), id: z.string(), resolved: z.boolean() }),
    response: z.object({ thread: commentThreadSchema, path: z.string() }).nullable(),
  },
  "comments:collaborators": {
    request: z.string(),
    response: z.array(commentCollaboratorSchema),
  },
  "comments:notify": {
    request: z.object({ projectPath: z.string(), threadId: z.string(), messageId: z.string() }),
    response: notifyResultSchema,
  },
  "comments:share": {
    request: z.string(),
    response: gitResultSchema,
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]["request"]>;
export type IpcResponse<C extends IpcChannel> = z.infer<
  IpcContract[C]["response"]
>;
