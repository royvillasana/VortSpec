/**
 * The renderer-facing API surface: the shape of `window.vortspec`.
 *
 * This is the single source of truth for the bridge both app shells talk to.
 * It is renderer-safe (no Electron imports) so `@vortspec/ui` panels and both
 * app renderers can share it. The app's preload annotates its concrete `api`
 * object as `VortSpecApi`, so the implementation is checked against this type —
 * it cannot drift. Return types are derived from the zod IPC contract
 * (`IpcResponse<channel>`), so they cannot drift from the handlers either.
 */
import type { IpcResponse, StageStatus, SetupAnswers, FileSnapshot, Profile } from "./ipc";
import type { AgentRunOptions, AgentEventEnvelope, AgentRawEnvelope } from "./run-events";
import type { DevServerUpdate } from "./dev-server";
import type { WorkspaceChange } from "./fs";
import type { TerminalData } from "./terminal";
import type { IdeState, IdeAction, IdeActionResult } from "./ide-mcp";
import type { FigmaCliMode } from "./figma";
import type { ProviderId, RepoVisibility } from "./git";
import type { IssueType } from "./task";
import type { SnapshotReason } from "./manifest";

export interface VortSpecApi {
  // system / updates
  isElectron(): Promise<IpcResponse<"system:isElectron">>;
  getVersion(): Promise<IpcResponse<"system:getVersion">>;
  /** The user's home directory — a default cwd for a no-workspace assistant chat. */
  homeDir(): Promise<IpcResponse<"system:homeDir">>;
  checkUpdate(): Promise<IpcResponse<"system:checkUpdate">>;

  // environment
  checkEnvironment(): Promise<IpcResponse<"env:check">>;
  verifyLogin(): Promise<IpcResponse<"env:verifyLogin">>;
  verifyFigmaMcp(): Promise<IpcResponse<"env:verifyFigmaMcp">>;
  openInstall(url: string): Promise<IpcResponse<"env:openInstall">>;

  // workspace / projects
  pickFolder(create?: boolean): Promise<IpcResponse<"workspace:pickFolder">>;
  createFolder(): Promise<IpcResponse<"workspace:createFolder">>;
  listProjects(): Promise<IpcResponse<"workspace:listProjects">>;
  openFolder(path: string): Promise<IpcResponse<"workspace:openFolder">>;
  revealPath(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:revealPath">>;
  refreshProject(path: string): Promise<IpcResponse<"workspace:refreshProject">>;
  createProject(path: string, answers: SetupAnswers): Promise<IpcResponse<"workspace:createProject">>;

  toolkitStatus(path: string): Promise<IpcResponse<"toolkit:status">>;
  installToolkit(path: string): Promise<IpcResponse<"toolkit:install">>;

  // agent runs
  startRun(opts: AgentRunOptions): Promise<IpcResponse<"agent:startRun">>;
  cancelRun(runId: string): Promise<IpcResponse<"agent:cancelRun">>;
  hasActiveRun(projectPath: string): Promise<IpcResponse<"agent:hasActiveRun">>;
  lastRun(projectPath: string): Promise<IpcResponse<"agent:lastRun">>;
  getUsage(): Promise<IpcResponse<"usage:get">>;

  // git
  gitStatus(projectPath: string): Promise<IpcResponse<"git:status">>;
  gitBranches(projectPath: string): Promise<IpcResponse<"git:branches">>;
  gitRemotes(projectPath: string): Promise<IpcResponse<"git:remotes">>;
  gitLog(projectPath: string): Promise<IpcResponse<"git:log">>;
  gitStage(projectPath: string, paths: string[]): Promise<IpcResponse<"git:stage">>;
  gitUnstage(projectPath: string, paths: string[]): Promise<IpcResponse<"git:unstage">>;
  gitCommit(projectPath: string, message: string): Promise<IpcResponse<"git:commit">>;
  gitCheckout(projectPath: string, name: string): Promise<IpcResponse<"git:checkout">>;
  gitCreateBranch(projectPath: string, name: string): Promise<IpcResponse<"git:createBranch">>;
  gitFetch(projectPath: string): Promise<IpcResponse<"git:fetch">>;
  gitPull(projectPath: string): Promise<IpcResponse<"git:pull">>;
  gitPush(projectPath: string): Promise<IpcResponse<"git:push">>;
  gitInit(projectPath: string): Promise<IpcResponse<"git:init">>;
  gitImport(req: { projectPath: string; url: string; branch?: string }): Promise<IpcResponse<"git:import">>;

  // providers (github/gitlab/bitbucket)
  providerAuth(projectPath: string): Promise<IpcResponse<"provider:auth">>;
  providerSwitchAccount(projectPath: string, account: string): Promise<IpcResponse<"provider:switchAccount">>;
  providerCreateRepo(req: {
    projectPath: string;
    providerId?: ProviderId;
    name: string;
    visibility: RepoVisibility;
    description?: string;
  }): Promise<IpcResponse<"provider:createRepo">>;
  providerCreatePR(req: { projectPath: string; base?: string; title: string; body?: string }): Promise<IpcResponse<"provider:createPR">>;
  providerPublish(req: { projectPath: string; branch: string; title: string; body?: string }): Promise<IpcResponse<"provider:publish">>;

  // tasks (Jira)
  taskAuth(): Promise<IpcResponse<"task:auth">>;
  taskInstall(): Promise<IpcResponse<"task:install">>;
  taskProjects(): Promise<IpcResponse<"task:projects">>;
  taskCreateIssue(req: { project: string; type: IssueType; summary: string; description?: string }): Promise<IpcResponse<"task:createIssue">>;
  taskCreateFromSpec(req: { projectPath: string; project: string; type: IssueType; specPath: string; ref: string }): Promise<IpcResponse<"task:createFromSpec">>;
  taskLinks(projectPath: string): Promise<IpcResponse<"task:links">>;
  taskIssueStatus(key: string): Promise<IpcResponse<"task:issueStatus">>;

  // profile
  getProfile(): Promise<IpcResponse<"profile:get">>;
  saveProfile(profile: Profile): Promise<IpcResponse<"profile:save">>;

  // flow / gates
  getFlow(projectPath: string): Promise<IpcResponse<"flow:get">>;
  setStageStatus(projectPath: string, stageId: string, status: StageStatus): Promise<IpcResponse<"flow:setStageStatus">>;
  approveStage(projectPath: string, stageId: string): Promise<IpcResponse<"flow:approveStage">>;
  requestChanges(projectPath: string, stageId: string, notes: string): Promise<IpcResponse<"flow:requestChanges">>;
  saveIntake(projectPath: string, content: string): Promise<IpcResponse<"flow:saveIntake">>;
  completeInput(projectPath: string, stageId: string): Promise<IpcResponse<"flow:completeInput">>;
  getHistory(projectPath: string): Promise<IpcResponse<"flow:getHistory">>;
  setPublishTarget(projectPath: string, repoUrl: string): Promise<IpcResponse<"flow:setPublishTarget">>;

  // manifest (DESIGN.md)
  getManifest(projectPath: string): Promise<IpcResponse<"manifest:get">>;
  saveManifest(projectPath: string, content: string): Promise<IpcResponse<"manifest:save">>;
  listManifestVersions(projectPath: string): Promise<IpcResponse<"manifest:listVersions">>;
  readManifestVersion(projectPath: string, id: string): Promise<IpcResponse<"manifest:readVersion">>;
  restoreManifestVersion(projectPath: string, id: string): Promise<IpcResponse<"manifest:restoreVersion">>;
  snapshotManifest(projectPath: string, reason: SnapshotReason, runId?: string): Promise<IpcResponse<"manifest:snapshot">>;

  // dev / app servers + preview
  startDevServer(projectPath: string): Promise<IpcResponse<"devserver:start">>;
  stopDevServer(projectPath: string): Promise<IpcResponse<"devserver:stop">>;
  devServerStatus(projectPath: string): Promise<IpcResponse<"devserver:status">>;
  startAppServer(projectPath: string): Promise<IpcResponse<"appserver:start">>;
  stopAppServer(projectPath: string): Promise<IpcResponse<"appserver:stop">>;
  appServerStatus(projectPath: string): Promise<IpcResponse<"appserver:status">>;
  previewInfo(projectPath: string): Promise<IpcResponse<"devserver:previewInfo">>;
  storybookIndex(url: string): Promise<IpcResponse<"devserver:storybookIndex">>;

  // artifacts / config
  readArtifact(projectPath: string, relPath: string): Promise<IpcResponse<"artifact:read">>;
  findLatestArtifact(projectPath: string, suffix: string): Promise<IpcResponse<"artifact:findLatest">>;
  projectConfig(projectPath: string): Promise<IpcResponse<"project:config">>;

  // inspector (tokens / components / verification)
  inspectorTokens(projectPath: string): Promise<IpcResponse<"inspector:getTokens">>;
  inspectorComponents(projectPath: string): Promise<IpcResponse<"inspector:getComponents">>;
  setTokenValue(projectPath: string, name: string, value: string): Promise<IpcResponse<"inspector:setTokenValue">>;
  getVerification(projectPath: string): Promise<IpcResponse<"inspector:getVerification">>;
  snapshotComponent(projectPath: string, file: string): Promise<IpcResponse<"inspector:snapshotComponent">>;
  snapshotTokenScope(projectPath: string): Promise<IpcResponse<"inspector:snapshotTokenScope">>;
  restoreFiles(projectPath: string, files: FileSnapshot[]): Promise<IpcResponse<"inspector:restoreFiles">>;

  // workspace filesystem (IDE)
  listDir(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:listDir">>;
  readFile(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:readFile">>;
  writeFile(projectPath: string, relPath: string, content: string): Promise<IpcResponse<"workspace:writeFile">>;
  watchWorkspace(projectPath: string): Promise<IpcResponse<"workspace:watchStart">>;
  unwatchWorkspace(projectPath: string): Promise<IpcResponse<"workspace:watchStop">>;
  fileAtHead(projectPath: string, relPath: string): Promise<IpcResponse<"git:fileAtHead">>;

  // integrated terminal
  terminalCreate(req: { id: string; projectPath: string; cols?: number; rows?: number }): Promise<IpcResponse<"terminal:create">>;
  terminalWrite(id: string, data: string): Promise<IpcResponse<"terminal:write">>;
  terminalResize(id: string, cols: number, rows: number): Promise<IpcResponse<"terminal:resize">>;
  terminalKill(id: string): Promise<IpcResponse<"terminal:kill">>;

  // Figma connection (figma-cli — primary; MCP bridge + token are fallbacks)
  figmaStatus(): Promise<IpcResponse<"figma:status">>;
  figmaOpenAppManagement(): Promise<IpcResponse<"figma:openAppManagement">>;
  figmaConnect(mode: FigmaCliMode): Promise<IpcResponse<"figma:connect">>;
  /** Read design variables from Figma into the reconcile cache (figma-cli primary). */
  figmaSyncVariables(projectPath: string): Promise<IpcResponse<"figma:syncVariables">>;
  /** Read design-system components from Figma into the reconcile cache (figma-cli primary). */
  figmaSyncComponents(projectPath: string): Promise<IpcResponse<"figma:syncComponents">>;
  /** Read the node(s) currently selected in Figma Desktop (figma-cli). */
  figmaSelection(): Promise<IpcResponse<"figma:selection">>;

  // IDE MCP integration (IDE app only)
  /** Start (once) the IDE MCP bridge and get the `--mcp-config` path for runs. */
  ideMcpConfigPath(projectPath: string): Promise<IpcResponse<"ide:mcpConfigPath">>;
  /** Mirror the current editor state (workspace, open tabs, selection) to the bridge. */
  reportIdeState(state: IdeState): Promise<IpcResponse<"ide:reportState">>;
  /** Reply to an action Claude requested (after running or declining it). */
  resolveIdeAction(result: IdeActionResult): Promise<IpcResponse<"ide:resolveAction">>;
  /** Subscribe to IDE actions Claude requests (open/clone/switch/open-file). */
  onIdeMcpAction(callback: (payload: IdeAction) => void): () => void;

  // event subscriptions (return an unsubscribe fn)
  onAgentEvent(callback: (payload: AgentEventEnvelope) => void): () => void;
  onAgentRaw(callback: (payload: AgentRawEnvelope) => void): () => void;
  onDevServerUpdate(callback: (payload: DevServerUpdate) => void): () => void;
  onWorkspaceChange(callback: (payload: WorkspaceChange) => void): () => void;
  onTerminalData(callback: (payload: TerminalData) => void): () => void;
}

declare global {
  interface Window {
    vortspec: VortSpecApi;
  }
}
