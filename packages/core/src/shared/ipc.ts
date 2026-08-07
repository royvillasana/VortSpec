import { z } from "zod";
import type { DrawGraph } from "./draw-graph";
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
import { canvasEditSchema, canvasWriteResultSchema } from "./canvas-edit";
import { flowSchema, stageStatusSchema, runHistoryResultSchema } from "./flow";
import { devServerStatusSchema } from "./dev-server";
import { manifestResultSchema, manifestVersionsResultSchema } from "./manifest";
import {
  updateInfoSchema,
  updateCheckRequestSchema,
  updateDismissalSchema,
} from "./update";
import { commentThreadSchema, commentCollaboratorSchema, notifyResultSchema } from "./comment";
import { routeDiscoverySchema } from "./routes";
export type { RouteDiscovery, RouteNode, RouterKind } from "./routes";
export { routeDiscoverySchema, routeNodeSchema, buildRouteTree, humanizeSegment } from "./routes";

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
  figmaHealthSchema,
  figmaHealthRequestSchema,
  figmaTokenStatusSchema,
  figmaSetTokenRequestSchema,
} from "./figma";
// The canonical token pipeline's on-demand routes (task 7.14).
import { tokenEmitResultSchema } from "./token-emit-ledger";
import { tokenIngestResultSchema } from "./canonical-ingest";
import { indexStalenessSchema, reportResultSchema } from "./inspector";
export { tokenEmitResultSchema } from "./token-emit-ledger";
export { tokenIngestResultSchema } from "./canonical-ingest";
export { indexStalenessSchema, reportResultSchema } from "./inspector";
export {
  figmaConnectionSchema,
  figmaCliModeSchema,
  figmaConnectRequestSchema,
  figmaSyncRequestSchema,
  figmaSyncResultSchema,
  figmaSelectionSchema,
  figmaHealthSchema,
  figmaHealthModeSchema,
  figmaTokenStatusSchema,
} from "./figma";
export type {
  FigmaConnection,
  FigmaCliMode,
  FigmaSyncResult,
  FigmaComponent,
  FigmaNode,
  FigmaSelection,
  FigmaHealth,
  FigmaHealthMode,
  FigmaTokenStatus,
} from "./figma";
export { figmaComponentSchema } from "./figma";
import { setupAnswersSchema, projectConfigSchema } from "./setup";
import { themeOverridesSchema, declBagSchema } from "./theme-overrides";
import { designSystemLibrarySchema, screenTokenDriftSchema } from "./design-library";
import { fontSourcesSchema } from "./fonts";
import { presetListSchema, presetPlanSchema, presetSchema } from "./presets";
import {
  inspectorTokensResultSchema,
  inspectorComponentsResultSchema,
  designAuditSchema,
  metadataPlanSchema,
  verificationResultSchema,
  fileSnapshotListSchema,
  pushPlanSchema,
  figmaPushResultSchema,
  tokenSanitationSchema,
  screenMapSchema,
  screenEntrySchema,
} from "./inspector";

export type { SetupAnswers, ProjectConfig } from "./setup";
export type {
  InspectorToken,
  InspectorTokensResult,
  TokenType,
  TokenSource,
  TokenUsage,
  TokenDrift,
  MatchSignal,
  TokenSanitation,
  OrphanToken,
  DuplicateGroup,
  FigmaVariable,
  FigmaCollection,
  FigmaMode,
  FigmaVariableModel,
  PushPlan,
  PushPlanEntry,
  FigmaPushResult,
  FigmaVariableType,
} from "./inspector";
export type {
  InspectorComponent,
  InspectorComponentsResult,
  PropControl,
  ComponentStatus,
  DesignAudit,
  AuditFinding,
  ComponentMetadata,
  MetadataStatus,
  MetadataPlan,
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
  InsertTargetWire,
  StructureSnapshotWire,
  StructureNodeWire,
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
  RunLimit,
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
  /** install-link → open an external URL; open-login → run login in the PTY; verify → re-run the check;
   *  figma-add → run `claude mcp add … figma …` for the user, then re-verify;
   *  run-install → auto-install the tool (git via the OS installer, Claude CLI into the managed prefix) */
  kind: z.enum(["install-link", "open-login", "verify", "figma-add", "run-install"]),
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
  /**
   * true when the folder is a set-up SDD-DE project (`.sdd-de/project.yaml`
   * exists). Distinct from `present` (toolkit skills scaffolded): an empty or
   * partially-scaffolded folder is falsy here and must go through intake, not
   * straight into the guided flow / component extraction. Optional so synthetic
   * and mock projects that never inspect disk can omit it (treated as false).
   */
  configured: z.boolean().optional(),
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
  // `force: true` bypasses the throttle — a user who clicks "Check for updates"
  // and receives a cached answer has been told something untrue.
  "system:checkUpdate": { request: updateCheckRequestSchema, response: updateInfoSchema },
  "system:getUpdateDismissal": { request: z.void(), response: updateDismissalSchema },
  "system:dismissUpdate": { request: z.string(), response: updateDismissalSchema },

  "env:check": { request: z.void(), response: envReportSchema },
  "env:verifyLogin": { request: z.void(), response: envCheckSchema },
  "env:verifyFigmaMcp": { request: z.void(), response: envCheckSchema },
  "env:addFigmaMcp": { request: z.void(), response: envCheckSchema },
  "env:installGit": { request: z.void(), response: envCheckSchema },
  "env:installClaude": { request: z.void(), response: envCheckSchema },
  "env:openInstall": { request: z.string().url(), response: z.void() },

  "workspace:pickFolder": {
    request: z.object({ create: z.boolean().default(false) }).optional(),
    response: projectSchema.nullable(),
  },
  "workspace:createFolder": { request: z.void(), response: projectSchema.nullable() },
  "workspace:pickFile": {
    request: z
      .object({
        filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional(),
      })
      .optional(),
    response: z.string().nullable(),
  },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:touchProject": { request: z.string(), response: z.void() },
  "workspace:removeProject": { request: z.string(), response: projectListSchema },
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
  "figma:ensureConnected": { request: z.void(), response: figmaConnectionSchema },
  "figma:openAppManagement": { request: z.void(), response: z.void() },

  // Screen ↔ Figma round-trip map (change: add-screen-to-figma).
  "screenMap:get": {
    request: z.object({ projectPath: z.string() }),
    response: z.object({ map: screenMapSchema, targetFileKey: z.string().nullable() }),
  },
  "screenMap:upsert": {
    request: z.object({
      projectPath: z.string(),
      screenKey: z.string(),
      entry: screenEntrySchema,
      fileKey: z.string().optional(),
    }),
    response: screenMapSchema,
  },
  "figma:connect": { request: figmaConnectRequestSchema, response: figmaConnectionSchema },
  "figma:syncVariables": { request: figmaSyncRequestSchema, response: figmaSyncResultSchema },
  "figma:syncComponents": { request: figmaSyncRequestSchema, response: figmaSyncResultSchema },
  // Re-emit `token_file` from `.vortspec/tokens.json` — the styling-switch route, which reads the
  // artifact and never the design source. `onDivergence` is how a reported divergence is resolved.
  "tokens:emit": {
    request: z.object({
      projectPath: z.string(),
      onDivergence: z.enum(["overwrite", "keep"]).optional(),
      tailwindVersion: z.union([z.literal(3), z.literal(4)]).optional(),
    }),
    response: tokenEmitResultSchema,
  },
  // Read the project's own token file as the design source, then emit (tasks 7.10 + 7.14).
  "tokens:ingest": { request: z.object({ projectPath: z.string() }), response: tokenIngestResultSchema },
  // The relationship index (group 2): build it, and ask whether it still describes the code.
  "index:build": {
    request: z.object({ projectPath: z.string() }),
    response: z.object({ written: z.array(z.string()).default([]), generatedAt: z.string() }),
  },
  "index:staleness": { request: z.object({ projectPath: z.string() }), response: indexStalenessSchema },
  "reports:generate": { request: z.object({ projectPath: z.string() }), response: reportResultSchema },
  "figma:selection": { request: z.void(), response: figmaSelectionSchema },
  "figma:checkHealth": { request: figmaHealthRequestSchema, response: figmaHealthSchema },
  "figma:tokenStatus": { request: z.void(), response: figmaTokenStatusSchema },
  "figma:setToken": {
    request: figmaSetTokenRequestSchema,
    response: z.object({ ok: z.boolean(), message: z.string() }),
  },
  // Code→Figma token push (change: add-code-to-figma-token-push).
  "figma:computePushPlan": { request: z.string(), response: pushPlanSchema },
  // Push plan for the CONFIRMED orphan set only (token-fidelity-sanitation 5.1) — gated push-back of
  // code-only tokens the user selected, layer-routed via computePushPlan.
  "figma:computeOrphanPushPlan": {
    request: z.object({ projectPath: z.string(), orphanNames: z.array(z.string()) }),
    response: pushPlanSchema,
  },
  "figma:pushVariables": {
    request: z.object({ projectPath: z.string(), plan: pushPlanSchema }),
    response: figmaPushResultSchema,
  },

  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:resync": { request: z.string(), response: projectSchema },

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
  // Deterministic Storybook provisioning (the cockpit backstop): report whether
  // real Storybook is set up + the story gap, and install it non-interactively.
  "storybook:status": {
    request: z.string(),
    response: z.object({
      installed: z.boolean(),
      hasConfig: z.boolean(),
      hasScript: z.boolean(),
      storyCount: z.number(),
      components: z.number(),
      missingStories: z.number(),
    }),
  },
  "storybook:ensure": {
    request: z.string(),
    response: z.object({
      state: z.enum(["present", "installed", "failed"]),
      installed: z.boolean(),
      storyCount: z.number(),
      error: z.string().optional(),
    }),
  },
  "styling:ensure": {
    request: z.string(),
    response: z.object({
      applicable: z.boolean(),
      created: z.array(z.string()),
      preExisting: z.array(z.string()),
      depsInstalled: z.boolean(),
      depsFixIt: z.string().optional(),
    }),
  },
  "styling:reconcileExports": {
    request: z.string(),
    response: z.object({
      filesChanged: z.number(),
      changes: z.array(z.object({ file: z.string(), detail: z.string() })),
    }),
  },
  "manifest:get": { request: z.string(), response: manifestResultSchema },
  // lite design system (light-design-system): derive the browsable palette / write designer.md /
  // build the Figma-stand-in agent prompt (the renderer runs it via useAgentRun).
  "lite:palette": { request: z.string(), response: z.string() },
  "lite:writeDesigner": { request: z.string(), response: z.string() },
  "lite:standInPrompt": { request: z.string(), response: z.string() },
  // two-track build prompt (4.2): light stand-ins first, then framework components, over one Figma read.
  "lite:twoTrackPrompt": { request: z.string(), response: z.string() },
  // serve a light page from a local http origin + return its URL, so the framework canvas webview can
  // load it with the guest inspector-bridge (light-pages-on-canvas, task 1).
  "lite:pageUrl": { request: z.object({ projectPath: z.string(), name: z.string() }), response: z.string() },
  // the Flow "Generate code" prompt: convert ALL screens to the selected framework + audit/validate (5).
  "lite:generatePrompt": { request: z.string(), response: z.string() },
  // per-page "Generate code" prompt (Sitemap per-row action): convert ONE screen to the selected framework.
  "lite:convertPage": { request: z.object({ projectPath: z.string(), name: z.string() }), response: z.string() },
  // Connect Enterprise Design System (change: connect-enterprise-design-system): resolve the client's
  // Storybook to an embeddable URL, and build the snapshot / generate prompts from the connected assets.
  "enterprise:storybookUrl": { request: z.string(), response: z.string().nullable() },
  "enterprise:snapshotPrompt": { request: z.string(), response: z.string() },
  "enterprise:generatePrompt": { request: z.string(), response: z.string() },
  // per-page framework-generation status: generated (has a framework version) + stale (edited since).
  "lite:genStatus": {
    request: z.string(),
    response: z.array(z.object({ name: z.string(), generated: z.boolean(), stale: z.boolean() })),
  },
  // record that a light page was generated to framework code (so later edits read as "needs update").
  "lite:markGenerated": { request: z.object({ projectPath: z.string(), name: z.string() }), response: z.boolean() },
  // insertable design-system stand-ins (component + variant + framework-free HTML) for the canvas Insert menu.
  "lite:standins": {
    request: z.string(),
    response: z.array(z.object({ component: z.string(), variant: z.string(), html: z.string() })),
  },
  // per-component readiness for the canvas: coded (framework-ready, Convert reuses) vs designed-only (light-only).
  "lite:readiness": {
    request: z.string(),
    response: z.array(z.object({ name: z.string(), readiness: z.enum(["light-only", "framework-ready"]) })),
  },
  // light page authoring (task 5.1): compose a page from the light design system, then read/list them.
  "lite:pagePrompt": { request: z.object({ projectPath: z.string(), name: z.string(), description: z.string() }), response: z.string() },
  "lite:page": { request: z.object({ projectPath: z.string(), name: z.string() }), response: z.string() },
  "lite:pages": { request: z.string(), response: z.array(z.string()) },
  "lite:writePage": { request: z.object({ projectPath: z.string(), name: z.string(), html: z.string() }), response: z.void() },
  // Draw tool (docs/draw-to-component-graph.md): persist the project's drawing graph + Excalidraw scene
  // and export a sketch to a PNG. The graph is validated by parseGraph in the canvas-store handler, so the
  // wire schema stays loose (z.custom) here. The scene is an opaque Excalidraw JSON string.
  "canvas:loadGraph": { request: z.string(), response: z.custom<DrawGraph>() },
  "canvas:saveGraph": { request: z.object({ projectPath: z.string(), graph: z.custom<DrawGraph>() }), response: z.void() },
  "canvas:loadScene": { request: z.string(), response: z.string().nullable() },
  "canvas:saveScene": { request: z.object({ projectPath: z.string(), scene: z.string() }), response: z.void() },
  "canvas:exportSketch": { request: z.object({ projectPath: z.string(), frameId: z.string(), dataUrl: z.string() }), response: z.string() },
  // Open (or focus) the separate Draw window for a project. The window itself is created by the app SHELL
  // (apps/ide, apps/desktop) via a registered opener — core just relays the request. Request = projectPath.
  "draw:open": { request: z.string(), response: z.void() },
  // Draw generate: persist the sketch to the graph, select the grounding subgraph, and build the
  // sketch→component prompt (the Draw window runs it with the sketch PNG attached). Then record the result.
  "draw:generatePrompt": {
    request: z.object({
      projectPath: z.string(),
      frameId: z.string(),
      label: z.string(),
      note: z.string().optional(),
      pngPath: z.string(),
      intent: z.enum(["create-new", "customize-existing"]).optional(),
    }),
    response: z.object({ prompt: z.string(), outputPath: z.string(), name: z.string(), sketchId: z.string() }),
  },
  "draw:recordGeneration": {
    request: z.object({ projectPath: z.string(), sketchId: z.string(), component: z.string(), outputRef: z.string().optional() }),
    response: z.string(),
  },
  // The Draw window hands a finished sketch back to the compose dialog: write the PNG, then broadcast
  // DRAW_SKETCH_READY to every window so the waiting dialog composes it into its slot. Returns the path.
  "draw:returnSketch": { request: z.object({ projectPath: z.string(), dataUrl: z.string() }), response: z.string() },
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
  // Real readiness for a `design_source: library` project — did the CLI copy source / does the
  // package resolve — replacing the component-count proxy (change: consume-component-libraries).
  "library:readiness": {
    request: z.string(),
    response: z.object({
      applicable: z.boolean(),
      ready: z.boolean(),
      kind: z.string().optional(),
      detail: z.string(),
    }),
  },
  // Inspect a target repo to auto-suggest the component library + consume kind at intake.
  "library:detect": {
    request: z.string(),
    response: z.object({
      library: z.string().optional(),
      kind: z.string().optional(),
      stylingOnly: z.boolean().optional(),
      detail: z.string(),
    }),
  },
  // Enumerate an installed component's real props + variants from its bundled .d.ts (AI grounding).
  "library:enumerateComponent": {
    request: z.object({ projectPath: z.string(), importBase: z.string(), component: z.string() }),
    response: z.object({
      component: z.string(),
      props: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          optional: z.boolean(),
          variants: z.array(z.string()).optional(),
        }),
      ),
    }),
  },
  // The durable design-system personalization overlay (change: consume-component-libraries).
  "theme:getOverrides": {
    request: z.string(),
    response: themeOverridesSchema,
  },
  "theme:setTokenOverride": {
    request: z.object({
      projectPath: z.string(),
      name: z.string(),
      value: z.string(),
      mode: z.string().optional(),
    }),
    response: themeOverridesSchema,
  },
  "theme:setComponentOverride": {
    request: z.object({
      projectPath: z.string(),
      component: z.string(),
      target: z.object({
        variant: z.string().optional(),
        option: z.string().optional(),
        slot: z.string().optional(),
      }),
      decls: declBagSchema,
    }),
    response: themeOverridesSchema,
  },
  // The design system grouped by style property — the Library tab's model.
  "designSystem:library": {
    request: z.string(),
    response: designSystemLibrarySchema,
  },
  // Tokens whose value in the SCREENS differs from the design system's — proposed on the row, never applied.
  "designSystem:tokenDrift": {
    request: z.string(),
    response: screenTokenDriftSchema,
  },
  // Font families this project can offer. `full` fetches the whole Google catalog (on demand only).
  "designSystem:fonts": {
    request: z.object({ projectPath: z.string(), full: z.boolean().optional() }),
    response: fontSourcesSchema,
  },
  // Presets. `activeId: null` means Default — the project's own source design system — is in effect.
  "preset:list": { request: z.string(), response: presetListSchema },
  // What applying would do, computed before anything is written.
  "preset:preview": {
    request: z.object({ projectPath: z.string(), presetId: z.string() }),
    response: presetPlanSchema,
  },
  "preset:apply": {
    request: z.object({ projectPath: z.string(), presetId: z.string() }),
    response: presetPlanSchema,
  },
  // Back to the project's own source design system: drops only what presets wrote.
  "preset:selectDefault": { request: z.string(), response: z.null() },
  "preset:createFromCurrent": {
    request: z.object({ projectPath: z.string(), name: z.string() }),
    response: presetSchema,
  },
  "preset:import": {
    request: z.object({ projectPath: z.string(), raw: z.unknown() }),
    response: presetSchema.nullable(),
  },
  // Choose a family for a token: writes the stack, and records a Google family so it is actually fetched.
  "theme:setFontFamily": {
    request: z.object({
      projectPath: z.string(),
      token: z.string(),
      stack: z.string(),
      google: z.string().optional(),
    }),
    response: themeOverridesSchema,
  },
  "inspector:getTokens": {
    request: z.union([
      z.string(),
      z.object({ projectPath: z.string(), preferredCollection: z.string().optional() }),
    ]),
    response: inspectorTokensResultSchema,
  },
  "inspector:getComponents": {
    request: z.string(),
    response: inspectorComponentsResultSchema,
  },
  "inspector:designAudit": {
    request: z.string(),
    response: designAuditSchema,
  },
  "inspector:metadataPlan": {
    request: z.string(),
    response: metadataPlanSchema,
  },
  "inspector:setTokenValue": {
    request: z.object({
      projectPath: z.string(),
      name: z.string(),
      value: z.string(),
      /** The code context (selector) to write into — for a per-mode edit. Omit → default `:root`. */
      context: z.string().optional(),
    }),
    response: inspectorTokensResultSchema,
  },
  "canvas:writeEdit": {
    request: z.object({
      projectPath: z.string(),
      file: z.string(),
      edit: canvasEditSchema,
      // The element's tag+className, so a stale anchor re-locates by identity at write time (DR-2).
      expect: z.object({ tag: z.string().optional(), className: z.string().optional() }).optional(),
    }),
    response: canvasWriteResultSchema,
  },
  "inspector:setTokenModeMap": {
    request: z.object({
      projectPath: z.string(),
      /** figma mode NAME → code context selector. */
      map: z.record(z.string(), z.string()),
    }),
    response: inspectorTokensResultSchema,
  },
  "inspector:createToken": {
    request: z.object({
      projectPath: z.string(),
      name: z.string(),
      value: z.string(),
      /** Override the dedup-before-create guard (create even though the value/name exists). */
      allowDuplicate: z.boolean().optional(),
    }),
    response: inspectorTokensResultSchema,
  },
  "inspector:getSanitation": {
    request: z.string(),
    response: tokenSanitationSchema,
  },
  "inspector:collapseToken": {
    request: z.object({
      projectPath: z.string(),
      /** The duplicate/flattened token to re-point. */
      tokenName: z.string(),
      /** The canonical token it should alias (`var(--canonical)`). */
      canonicalName: z.string(),
    }),
    response: inspectorTokensResultSchema,
  },
  "inspector:linkToken": {
    request: z.object({
      projectPath: z.string(),
      /** The code token being linked. */
      codeToken: z.string(),
      /** The Figma variable slash path to link it to. */
      figmaPath: z.string(),
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
  // Broader than the token scope: every source file under the project tree, so a
  // relocation whose origin/destination is a screen file (outside component_dir)
  // is still fully snapshotted and reversible (change: canvas-drag-move, Decision 6).
  "inspector:snapshotSourceScope": {
    request: z.string(),
    response: fileSnapshotListSchema,
  },
  // The app's page/route sitemap, read from source (change: sitemap-tree).
  "routes:discover": {
    request: z.string(),
    response: routeDiscoverySchema,
  },
  "inspector:restoreFiles": {
    request: z.object({ projectPath: z.string(), files: fileSnapshotListSchema }),
    response: z.void(),
  },
  // Composition preview scaffold — accept keeps one option, sweep clears all (§6).
  "compose:accept": {
    request: z.object({
      projectPath: z.string(),
      file: z.string(),
      runId: z.string(),
      keepOption: z.number().int().nonnegative(),
    }),
    response: z.object({ ok: z.boolean(), file: z.string(), message: z.string().optional() }),
  },
  "compose:sweep": {
    request: z.object({ projectPath: z.string(), files: z.array(z.string()) }),
    response: z.void(),
  },
  "compose:checkTarget": {
    request: z.object({ projectPath: z.string(), file: z.string() }),
    response: z.object({ ok: z.boolean(), reason: z.string().optional() }),
  },
  "compose:sweepProject": {
    request: z.string(),
    response: z.object({ swept: z.array(z.string()) }),
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
