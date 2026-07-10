import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  StageStatus,
  SetupAnswers,
  FileSnapshot,
  Profile,
} from "@vortspec/core/ipc";
import {
  AGENT_EVENT_CHANNEL,
  AGENT_RAW_CHANNEL,
  type AgentEventEnvelope,
  type AgentRawEnvelope,
  type AgentRunOptions,
} from "@vortspec/core/run-events";
import { DEV_SERVER_UPDATE_CHANNEL, type DevServerUpdate } from "@vortspec/core/dev-server";
import { WORKSPACE_CHANGE_CHANNEL, type WorkspaceChange } from "@vortspec/core/fs";
import { TERMINAL_DATA_CHANNEL, type TerminalData } from "@vortspec/core/terminal";
import { IDE_ACTION_CHANNEL, type IdeState, type IdeAction, type IdeActionResult } from "@vortspec/core/ide-mcp";
import type { FigmaCliMode } from "@vortspec/core/figma";
import type { CommentThread } from "@vortspec/core/comment";
import type { VortSpecApi } from "@vortspec/core/api";

/**
 * The safe bridge between the sandboxed renderer and the main process.
 * The renderer calls `window.vortspec.*`; each method routes through a typed
 * IPC channel that the main process validates with zod. No Node APIs are
 * exposed directly.
 */
function invoke<C extends IpcChannel>(
  channel: C,
  request?: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<C>>;
}

function subscribe<T>(
  channel: string,
  callback: (payload: T) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: VortSpecApi = {
  isElectron: () => invoke("system:isElectron"),
  getVersion: () => invoke("system:getVersion"),
  homeDir: () => invoke("system:homeDir"),
  guestPreloadUrl: () => invoke("system:guestPreloadUrl"),
  clipboardImage: () => invoke("system:clipboardImage"),
  // Resolve the absolute path of a File dropped from the OS (Electron 32+ removed
  // File.path). Not an IPC call — runs in the preload with webUtils.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  checkUpdate: () => invoke("system:checkUpdate"),

  checkEnvironment: () => invoke("env:check"),
  verifyLogin: () => invoke("env:verifyLogin"),
  verifyFigmaMcp: () => invoke("env:verifyFigmaMcp"),
  openInstall: (url: string) => invoke("env:openInstall", url),

  pickFolder: (create = false) => invoke("workspace:pickFolder", { create }),
  createFolder: () => invoke("workspace:createFolder"),
  listProjects: () => invoke("workspace:listProjects"),
  openFolder: (path: string) => invoke("workspace:openFolder", path),
  revealPath: (projectPath: string, relPath: string) =>
    invoke("workspace:revealPath", { projectPath, relPath }),
  refreshProject: (path: string) => invoke("workspace:refreshProject", path),
  envStatus: (projectPath: string) => invoke("workspace:envStatus", projectPath),
  createEnv: (projectPath: string, example: string) =>
    invoke("workspace:createEnv", { projectPath, example }),
  openWalkthrough: (destPath: string) => invoke("workspace:openWalkthrough", destPath),
  createProject: (path: string, answers: SetupAnswers) =>
    invoke("workspace:createProject", { path, answers }),

  toolkitStatus: (path: string) => invoke("toolkit:status", path),
  installToolkit: (path: string) => invoke("toolkit:install", path),

  startRun: (opts: AgentRunOptions) => invoke("agent:startRun", opts),
  cancelRun: (runId: string) => invoke("agent:cancelRun", runId),
  hasActiveRun: (projectPath: string) => invoke("agent:hasActiveRun", projectPath),
  lastRun: (projectPath: string) => invoke("agent:lastRun", projectPath),
  getUsage: () => invoke("usage:get", undefined),

  gitStatus: (projectPath: string) => invoke("git:status", projectPath),
  gitBranches: (projectPath: string) => invoke("git:branches", projectPath),
  gitRemotes: (projectPath: string) => invoke("git:remotes", projectPath),
  gitLog: (projectPath: string) => invoke("git:log", projectPath),
  gitGraph: (projectPath: string) => invoke("git:graph", projectPath),
  gitStage: (projectPath: string, paths: string[]) => invoke("git:stage", { projectPath, paths }),
  gitUnstage: (projectPath: string, paths: string[]) => invoke("git:unstage", { projectPath, paths }),
  gitCommit: (projectPath: string, message: string) => invoke("git:commit", { projectPath, message }),
  gitCheckout: (projectPath: string, name: string) => invoke("git:checkout", { projectPath, name }),
  gitCreateBranch: (projectPath: string, name: string) => invoke("git:createBranch", { projectPath, name }),
  gitFetch: (projectPath: string) => invoke("git:fetch", projectPath),
  gitPull: (projectPath: string) => invoke("git:pull", projectPath),
  gitPush: (projectPath: string) => invoke("git:push", projectPath),
  gitInit: (projectPath: string) => invoke("git:init", projectPath),
  providerAuth: (projectPath: string) => invoke("provider:auth", projectPath),
  providerSwitchAccount: (projectPath: string, account: string) => invoke("provider:switchAccount", { projectPath, account }),
  providerCreateRepo: (req: { projectPath: string; providerId?: "github" | "gitlab" | "bitbucket"; name: string; visibility: "private" | "public" | "internal"; description?: string }) =>
    invoke("provider:createRepo", req),
  providerCreatePR: (req: { projectPath: string; base?: string; title: string; body?: string }) =>
    invoke("provider:createPR", req),
  gitImport: (req: { projectPath: string; url: string; branch?: string }) => invoke("git:import", req),
  providerPublish: (req: { projectPath: string; branch: string; title: string; body?: string }) =>
    invoke("provider:publish", req),

  taskAuth: () => invoke("task:auth", undefined),
  taskInstall: () => invoke("task:install", undefined),
  taskProjects: () => invoke("task:projects", undefined),
  taskCreateIssue: (req: { project: string; type: "Story" | "Task" | "Bug"; summary: string; description?: string }) =>
    invoke("task:createIssue", req),
  taskCreateFromSpec: (req: { projectPath: string; project: string; type: "Story" | "Task" | "Bug"; specPath: string; ref: string }) =>
    invoke("task:createFromSpec", req),
  taskLinks: (projectPath: string) => invoke("task:links", projectPath),
  taskIssueStatus: (key: string) => invoke("task:issueStatus", key),
  getProfile: () => invoke("profile:get", undefined),
  saveProfile: (profile: Profile) => invoke("profile:save", profile),
  onAgentEvent: (callback: (payload: AgentEventEnvelope) => void) =>
    subscribe(AGENT_EVENT_CHANNEL, callback),
  onAgentRaw: (callback: (payload: AgentRawEnvelope) => void) =>
    subscribe(AGENT_RAW_CHANNEL, callback),

  getFlow: (projectPath: string) => invoke("flow:get", projectPath),
  setStageStatus: (projectPath: string, stageId: string, status: StageStatus) =>
    invoke("flow:setStageStatus", { projectPath, stageId, status }),
  approveStage: (projectPath: string, stageId: string) =>
    invoke("flow:approveStage", { projectPath, stageId }),
  requestChanges: (projectPath: string, stageId: string, notes: string) =>
    invoke("flow:requestChanges", { projectPath, stageId, notes }),
  saveIntake: (projectPath: string, content: string) =>
    invoke("flow:saveIntake", { projectPath, content }),
  completeInput: (projectPath: string, stageId: string) =>
    invoke("flow:completeInput", { projectPath, stageId }),
  getHistory: (projectPath: string) => invoke("flow:getHistory", projectPath),
  getManifest: (projectPath: string) => invoke("manifest:get", projectPath),
  saveManifest: (projectPath: string, content: string) =>
    invoke("manifest:save", { projectPath, content }),
  listManifestVersions: (projectPath: string) =>
    invoke("manifest:listVersions", projectPath),
  readManifestVersion: (projectPath: string, id: string) =>
    invoke("manifest:readVersion", { projectPath, id }),
  restoreManifestVersion: (projectPath: string, id: string) =>
    invoke("manifest:restoreVersion", { projectPath, id }),
  snapshotManifest: (projectPath: string, reason: "generate" | "edit" | "approve" | "restore", runId?: string) =>
    invoke("manifest:snapshot", { projectPath, reason, runId }),
  startDevServer: (projectPath: string) => invoke("devserver:start", projectPath),
  stopDevServer: (projectPath: string) => invoke("devserver:stop", projectPath),
  devServerStatus: (projectPath: string) => invoke("devserver:status", projectPath),
  startAppServer: (projectPath: string) => invoke("appserver:start", projectPath),
  stopAppServer: (projectPath: string) => invoke("appserver:stop", projectPath),
  appServerStatus: (projectPath: string) => invoke("appserver:status", projectPath),
  previewInfo: (projectPath: string) => invoke("devserver:previewInfo", projectPath),
  storybookIndex: (url: string) => invoke("devserver:storybookIndex", url),
  onDevServerUpdate: (callback: (payload: DevServerUpdate) => void) =>
    subscribe(DEV_SERVER_UPDATE_CHANNEL, callback),

  // Workspace filesystem (IDE)
  listDir: (projectPath: string, relPath: string) =>
    invoke("workspace:listDir", { projectPath, relPath }),
  readFile: (projectPath: string, relPath: string) =>
    invoke("workspace:readFile", { projectPath, relPath }),
  readAsset: (projectPath: string, relPath: string) =>
    invoke("workspace:readAsset", { projectPath, relPath }),
  searchFiles: (projectPath: string, query: string, limit?: number) =>
    invoke("workspace:searchFiles", { projectPath, query, limit }),
  createFile: (projectPath: string, relPath: string) =>
    invoke("workspace:createFile", { projectPath, relPath }),
  createDir: (projectPath: string, relPath: string) =>
    invoke("workspace:createDir", { projectPath, relPath }),
  renamePath: (projectPath: string, from: string, to: string) =>
    invoke("workspace:rename", { projectPath, from, to }),
  trashPath: (projectPath: string, relPath: string) =>
    invoke("workspace:trash", { projectPath, relPath }),
  writeFile: (projectPath: string, relPath: string, content: string) =>
    invoke("workspace:writeFile", { projectPath, relPath, content }),
  watchWorkspace: (projectPath: string) => invoke("workspace:watchStart", projectPath),
  unwatchWorkspace: (projectPath: string) => invoke("workspace:watchStop", projectPath),
  fileAtHead: (projectPath: string, relPath: string) =>
    invoke("git:fileAtHead", { projectPath, relPath }),
  onWorkspaceChange: (callback: (payload: WorkspaceChange) => void) =>
    subscribe(WORKSPACE_CHANGE_CHANNEL, callback),

  // Integrated terminal
  terminalCreate: (req: { id: string; projectPath: string; cols?: number; rows?: number }) =>
    invoke("terminal:create", req),
  terminalWrite: (id: string, data: string) => invoke("terminal:write", { id, data }),
  terminalResize: (id: string, cols: number, rows: number) =>
    invoke("terminal:resize", { id, cols, rows }),
  terminalKill: (id: string) => invoke("terminal:kill", id),
  onTerminalData: (callback: (payload: TerminalData) => void) =>
    subscribe(TERMINAL_DATA_CHANNEL, callback),

  // IDE MCP integration
  ideMcpConfigPath: (projectPath: string) => invoke("ide:mcpConfigPath", { projectPath }),
  reportIdeState: (state: IdeState) => invoke("ide:reportState", state),
  resolveIdeAction: (result: IdeActionResult) => invoke("ide:resolveAction", result),
  onIdeMcpAction: (callback: (payload: IdeAction) => void) => subscribe(IDE_ACTION_CHANNEL, callback),

  // Figma connection (figma-cli)
  figmaStatus: () => invoke("figma:status", undefined),
  figmaOpenAppManagement: () => invoke("figma:openAppManagement", undefined),
  figmaConnect: (mode: FigmaCliMode) => invoke("figma:connect", { mode }),
  figmaSyncVariables: (projectPath: string) => invoke("figma:syncVariables", { projectPath }),
  figmaSyncComponents: (projectPath: string) => invoke("figma:syncComponents", { projectPath }),
  figmaSelection: () => invoke("figma:selection", undefined),
  setPublishTarget: (projectPath: string, repoUrl: string) =>
    invoke("flow:setPublishTarget", { projectPath, repoUrl }),
  readArtifact: (projectPath: string, relPath: string) =>
    invoke("artifact:read", { projectPath, relPath }),
  findLatestArtifact: (projectPath: string, suffix: string) =>
    invoke("artifact:findLatest", { projectPath, suffix }),
  projectConfig: (projectPath: string) => invoke("project:config", projectPath),
  inspectorTokens: (projectPath: string) => invoke("inspector:getTokens", projectPath),
  inspectorComponents: (projectPath: string) => invoke("inspector:getComponents", projectPath),
  setTokenValue: (projectPath: string, name: string, value: string) =>
    invoke("inspector:setTokenValue", { projectPath, name, value }),
  getVerification: (projectPath: string) => invoke("inspector:getVerification", projectPath),
  snapshotComponent: (projectPath: string, file: string) =>
    invoke("inspector:snapshotComponent", { projectPath, file }),
  snapshotTokenScope: (projectPath: string) =>
    invoke("inspector:snapshotTokenScope", projectPath),
  restoreFiles: (projectPath: string, files: FileSnapshot[]) =>
    invoke("inspector:restoreFiles", { projectPath, files }),
  listComments: (projectPath: string) => invoke("comments:list", projectPath),
  upsertComment: (projectPath: string, thread: CommentThread) =>
    invoke("comments:upsert", { projectPath, thread }),
  resolveComment: (projectPath: string, id: string, resolved: boolean) =>
    invoke("comments:resolve", { projectPath, id, resolved }),
};

export type { VortSpecApi };

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vortspec", api);
  } catch (error) {
    console.error(error);
  }
} else {
  (globalThis as unknown as { vortspec: VortSpecApi }).vortspec = api;
}
