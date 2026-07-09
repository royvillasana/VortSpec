import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
const runEventSchema = z.discriminatedUnion("kind", [
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
    mcpStatuses: z.array(z.object({ name: z.string(), status: z.string() })).optional()
  }),
  z.object({ kind: z.literal("text-delta"), text: z.string() }),
  z.object({ kind: z.literal("assistant-text"), text: z.string() }),
  z.object({
    kind: z.literal("tool-use"),
    id: z.string(),
    name: z.string(),
    path: z.string().optional()
  }),
  z.object({
    kind: z.literal("tool-result"),
    toolUseId: z.string(),
    isError: z.boolean()
  }),
  z.object({
    kind: z.literal("api-retry"),
    attempt: z.number(),
    maxRetries: z.number(),
    errorCategory: z.string(),
    retryDelayMs: z.number().optional()
  }),
  z.object({ kind: z.literal("notice"), text: z.string() }),
  z.object({
    kind: z.literal("result"),
    isError: z.boolean(),
    text: z.string().optional(),
    costUsd: z.number().optional(),
    sessionId: z.string().optional()
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("exit"), code: z.number().nullable() })
]);
z.object({
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
   * Renderer-supplied labels persisted with the run so an interrupted run can be
   * resumed later with its original stage view (kind) and scope (total). Opaque
   * to the main process except for persistence.
   */
  meta: z.object({
    kind: z.string().optional(),
    label: z.string().optional(),
    total: z.number().optional()
  }).optional()
});
z.object({
  sessionId: z.string().nullable(),
  title: z.string(),
  kind: z.string().optional(),
  label: z.string().optional(),
  total: z.number().nullable().optional(),
  status: z.enum(["running", "passed", "cancelled", "failed"]),
  updatedAt: z.string()
});
const AGENT_EVENT_CHANNEL = "agent:event";
const AGENT_RAW_CHANNEL = "agent:raw";
z.object({
  runId: z.string(),
  event: runEventSchema
});
z.object({
  runId: z.string(),
  line: z.string()
});
const devServerStateSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "error",
  "no-script"
]);
const devServerStatusSchema = z.object({
  state: devServerStateSchema,
  /** The detected local URL once the server is up. */
  url: z.string().nullable(),
  /** The package.json script being run (e.g. "dev", "storybook"). */
  script: z.string().nullable(),
  /** A human message for error / no-script states. */
  message: z.string().nullable()
});
const serverKindSchema = z.enum(["storybook", "app"]);
const DEV_SERVER_UPDATE_CHANNEL = "devserver:update";
z.object({
  projectPath: z.string(),
  kind: serverKindSchema.default("storybook"),
  status: devServerStatusSchema
});
z.object({
  name: z.string(),
  /** path relative to the workspace root, using "/" separators */
  path: z.string(),
  type: z.enum(["file", "dir"])
});
z.object({
  path: z.string(),
  content: z.string(),
  /** true when the file was binary or too large to read as text */
  truncated: z.boolean()
});
z.object({
  ok: z.boolean(),
  message: z.string()
});
const WORKSPACE_CHANGE_CHANNEL = "workspace:change";
z.object({
  projectPath: z.string(),
  path: z.string().nullable(),
  kind: z.enum(["add", "change", "unlink", "refresh"])
});
const TERMINAL_DATA_CHANNEL = "terminal:data";
z.object({
  id: z.string(),
  data: z.string(),
  /** set on the final event when the shell process exits */
  exit: z.number().nullable().optional()
});
const IDE_ACTION_CHANNEL = "ide:action";
const ideSelectionSchema = z.object({
  path: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  text: z.string()
});
z.object({
  workspaceRoot: z.string().nullable(),
  activeFile: z.string().nullable(),
  openEditors: z.array(z.string()),
  selection: ideSelectionSchema.nullable()
});
z.object({
  requestId: z.string(),
  tool: z.string(),
  args: z.record(z.unknown())
});
z.object({
  requestId: z.string(),
  ok: z.boolean(),
  message: z.string()
});
z.object({ path: z.string() }).nullable();
z.object({ ok: z.boolean() });
function invoke(channel, request) {
  return ipcRenderer.invoke(channel, request);
}
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
const api = {
  isElectron: () => invoke("system:isElectron"),
  getVersion: () => invoke("system:getVersion"),
  homeDir: () => invoke("system:homeDir"),
  checkUpdate: () => invoke("system:checkUpdate"),
  checkEnvironment: () => invoke("env:check"),
  verifyLogin: () => invoke("env:verifyLogin"),
  verifyFigmaMcp: () => invoke("env:verifyFigmaMcp"),
  openInstall: (url) => invoke("env:openInstall", url),
  pickFolder: (create = false) => invoke("workspace:pickFolder", { create }),
  createFolder: () => invoke("workspace:createFolder"),
  listProjects: () => invoke("workspace:listProjects"),
  openFolder: (path) => invoke("workspace:openFolder", path),
  revealPath: (projectPath, relPath) => invoke("workspace:revealPath", { projectPath, relPath }),
  refreshProject: (path) => invoke("workspace:refreshProject", path),
  createProject: (path, answers) => invoke("workspace:createProject", { path, answers }),
  toolkitStatus: (path) => invoke("toolkit:status", path),
  installToolkit: (path) => invoke("toolkit:install", path),
  startRun: (opts) => invoke("agent:startRun", opts),
  cancelRun: (runId) => invoke("agent:cancelRun", runId),
  hasActiveRun: (projectPath) => invoke("agent:hasActiveRun", projectPath),
  lastRun: (projectPath) => invoke("agent:lastRun", projectPath),
  getUsage: () => invoke("usage:get", void 0),
  gitStatus: (projectPath) => invoke("git:status", projectPath),
  gitBranches: (projectPath) => invoke("git:branches", projectPath),
  gitRemotes: (projectPath) => invoke("git:remotes", projectPath),
  gitLog: (projectPath) => invoke("git:log", projectPath),
  gitStage: (projectPath, paths) => invoke("git:stage", { projectPath, paths }),
  gitUnstage: (projectPath, paths) => invoke("git:unstage", { projectPath, paths }),
  gitCommit: (projectPath, message) => invoke("git:commit", { projectPath, message }),
  gitCheckout: (projectPath, name) => invoke("git:checkout", { projectPath, name }),
  gitCreateBranch: (projectPath, name) => invoke("git:createBranch", { projectPath, name }),
  gitFetch: (projectPath) => invoke("git:fetch", projectPath),
  gitPull: (projectPath) => invoke("git:pull", projectPath),
  gitPush: (projectPath) => invoke("git:push", projectPath),
  gitInit: (projectPath) => invoke("git:init", projectPath),
  providerAuth: (projectPath) => invoke("provider:auth", projectPath),
  providerSwitchAccount: (projectPath, account) => invoke("provider:switchAccount", { projectPath, account }),
  providerCreateRepo: (req) => invoke("provider:createRepo", req),
  providerCreatePR: (req) => invoke("provider:createPR", req),
  gitImport: (req) => invoke("git:import", req),
  providerPublish: (req) => invoke("provider:publish", req),
  taskAuth: () => invoke("task:auth", void 0),
  taskInstall: () => invoke("task:install", void 0),
  taskProjects: () => invoke("task:projects", void 0),
  taskCreateIssue: (req) => invoke("task:createIssue", req),
  taskCreateFromSpec: (req) => invoke("task:createFromSpec", req),
  taskLinks: (projectPath) => invoke("task:links", projectPath),
  taskIssueStatus: (key) => invoke("task:issueStatus", key),
  getProfile: () => invoke("profile:get", void 0),
  saveProfile: (profile) => invoke("profile:save", profile),
  onAgentEvent: (callback) => subscribe(AGENT_EVENT_CHANNEL, callback),
  onAgentRaw: (callback) => subscribe(AGENT_RAW_CHANNEL, callback),
  getFlow: (projectPath) => invoke("flow:get", projectPath),
  setStageStatus: (projectPath, stageId, status) => invoke("flow:setStageStatus", { projectPath, stageId, status }),
  approveStage: (projectPath, stageId) => invoke("flow:approveStage", { projectPath, stageId }),
  requestChanges: (projectPath, stageId, notes) => invoke("flow:requestChanges", { projectPath, stageId, notes }),
  saveIntake: (projectPath, content) => invoke("flow:saveIntake", { projectPath, content }),
  completeInput: (projectPath, stageId) => invoke("flow:completeInput", { projectPath, stageId }),
  getHistory: (projectPath) => invoke("flow:getHistory", projectPath),
  getManifest: (projectPath) => invoke("manifest:get", projectPath),
  saveManifest: (projectPath, content) => invoke("manifest:save", { projectPath, content }),
  listManifestVersions: (projectPath) => invoke("manifest:listVersions", projectPath),
  readManifestVersion: (projectPath, id) => invoke("manifest:readVersion", { projectPath, id }),
  restoreManifestVersion: (projectPath, id) => invoke("manifest:restoreVersion", { projectPath, id }),
  snapshotManifest: (projectPath, reason, runId) => invoke("manifest:snapshot", { projectPath, reason, runId }),
  startDevServer: (projectPath) => invoke("devserver:start", projectPath),
  stopDevServer: (projectPath) => invoke("devserver:stop", projectPath),
  devServerStatus: (projectPath) => invoke("devserver:status", projectPath),
  startAppServer: (projectPath) => invoke("appserver:start", projectPath),
  stopAppServer: (projectPath) => invoke("appserver:stop", projectPath),
  appServerStatus: (projectPath) => invoke("appserver:status", projectPath),
  previewInfo: (projectPath) => invoke("devserver:previewInfo", projectPath),
  storybookIndex: (url) => invoke("devserver:storybookIndex", url),
  onDevServerUpdate: (callback) => subscribe(DEV_SERVER_UPDATE_CHANNEL, callback),
  // Workspace filesystem (IDE)
  listDir: (projectPath, relPath) => invoke("workspace:listDir", { projectPath, relPath }),
  readFile: (projectPath, relPath) => invoke("workspace:readFile", { projectPath, relPath }),
  searchFiles: (projectPath, query, limit) => invoke("workspace:searchFiles", { projectPath, query, limit }),
  createFile: (projectPath, relPath) => invoke("workspace:createFile", { projectPath, relPath }),
  createDir: (projectPath, relPath) => invoke("workspace:createDir", { projectPath, relPath }),
  renamePath: (projectPath, from, to) => invoke("workspace:rename", { projectPath, from, to }),
  trashPath: (projectPath, relPath) => invoke("workspace:trash", { projectPath, relPath }),
  writeFile: (projectPath, relPath, content) => invoke("workspace:writeFile", { projectPath, relPath, content }),
  watchWorkspace: (projectPath) => invoke("workspace:watchStart", projectPath),
  unwatchWorkspace: (projectPath) => invoke("workspace:watchStop", projectPath),
  fileAtHead: (projectPath, relPath) => invoke("git:fileAtHead", { projectPath, relPath }),
  onWorkspaceChange: (callback) => subscribe(WORKSPACE_CHANGE_CHANNEL, callback),
  // Integrated terminal
  terminalCreate: (req) => invoke("terminal:create", req),
  terminalWrite: (id, data) => invoke("terminal:write", { id, data }),
  terminalResize: (id, cols, rows) => invoke("terminal:resize", { id, cols, rows }),
  terminalKill: (id) => invoke("terminal:kill", id),
  onTerminalData: (callback) => subscribe(TERMINAL_DATA_CHANNEL, callback),
  // IDE MCP integration
  ideMcpConfigPath: (projectPath) => invoke("ide:mcpConfigPath", { projectPath }),
  reportIdeState: (state) => invoke("ide:reportState", state),
  resolveIdeAction: (result) => invoke("ide:resolveAction", result),
  onIdeMcpAction: (callback) => subscribe(IDE_ACTION_CHANNEL, callback),
  // Figma connection (figma-cli)
  figmaStatus: () => invoke("figma:status", void 0),
  figmaOpenAppManagement: () => invoke("figma:openAppManagement", void 0),
  figmaConnect: (mode) => invoke("figma:connect", { mode }),
  figmaSyncVariables: (projectPath) => invoke("figma:syncVariables", { projectPath }),
  figmaSyncComponents: (projectPath) => invoke("figma:syncComponents", { projectPath }),
  figmaSelection: () => invoke("figma:selection", void 0),
  setPublishTarget: (projectPath, repoUrl) => invoke("flow:setPublishTarget", { projectPath, repoUrl }),
  readArtifact: (projectPath, relPath) => invoke("artifact:read", { projectPath, relPath }),
  findLatestArtifact: (projectPath, suffix) => invoke("artifact:findLatest", { projectPath, suffix }),
  projectConfig: (projectPath) => invoke("project:config", projectPath),
  inspectorTokens: (projectPath) => invoke("inspector:getTokens", projectPath),
  inspectorComponents: (projectPath) => invoke("inspector:getComponents", projectPath),
  setTokenValue: (projectPath, name, value) => invoke("inspector:setTokenValue", { projectPath, name, value }),
  getVerification: (projectPath) => invoke("inspector:getVerification", projectPath),
  snapshotComponent: (projectPath, file) => invoke("inspector:snapshotComponent", { projectPath, file }),
  snapshotTokenScope: (projectPath) => invoke("inspector:snapshotTokenScope", projectPath),
  restoreFiles: (projectPath, files) => invoke("inspector:restoreFiles", { projectPath, files })
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vortspec", api);
  } catch (error) {
    console.error(error);
  }
} else {
  globalThis.vortspec = api;
}
