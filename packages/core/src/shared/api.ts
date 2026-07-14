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
import type { IpcResponse, StageStatus, SetupAnswers, FileSnapshot, Profile, PushPlan } from "./ipc";
import type { CommentThread } from "./comment";
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
  guestPreloadUrl(): Promise<IpcResponse<"system:guestPreloadUrl">>;
  /** Read an image from the OS clipboard → temp PNG path + thumbnail (or null). */
  clipboardImage(): Promise<IpcResponse<"system:clipboardImage">>;
  /** Absolute path of a File dragged in from the OS (Finder). Synchronous. */
  getPathForFile(file: File): string;
  checkUpdate(): Promise<IpcResponse<"system:checkUpdate">>;

  // environment
  checkEnvironment(): Promise<IpcResponse<"env:check">>;
  verifyLogin(): Promise<IpcResponse<"env:verifyLogin">>;
  verifyFigmaMcp(): Promise<IpcResponse<"env:verifyFigmaMcp">>;
  openInstall(url: string): Promise<IpcResponse<"env:openInstall">>;

  // workspace / projects
  pickFolder(create?: boolean): Promise<IpcResponse<"workspace:pickFolder">>;
  createFolder(): Promise<IpcResponse<"workspace:createFolder">>;
  pickFile(filters?: { name: string; extensions: string[] }[]): Promise<IpcResponse<"workspace:pickFile">>;
  listProjects(): Promise<IpcResponse<"workspace:listProjects">>;
  /** Forget a project from the recent-workspaces list (never deletes the folder). */
  removeProject(id: string): Promise<IpcResponse<"workspace:removeProject">>;
  openFolder(path: string): Promise<IpcResponse<"workspace:openFolder">>;
  revealPath(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:revealPath">>;
  refreshProject(path: string): Promise<IpcResponse<"workspace:refreshProject">>;
  envStatus(projectPath: string): Promise<IpcResponse<"workspace:envStatus">>;
  createEnv(projectPath: string, example: string): Promise<IpcResponse<"workspace:createEnv">>;
  openWalkthrough(destPath: string): Promise<IpcResponse<"workspace:openWalkthrough">>;
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
  gitGraph(projectPath: string): Promise<IpcResponse<"git:graph">>;
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
  storybookStatus(projectPath: string): Promise<IpcResponse<"storybook:status">>;
  ensureStorybook(projectPath: string): Promise<IpcResponse<"storybook:ensure">>;

  // artifacts / config
  readArtifact(projectPath: string, relPath: string): Promise<IpcResponse<"artifact:read">>;
  findLatestArtifact(projectPath: string, suffix: string): Promise<IpcResponse<"artifact:findLatest">>;
  projectConfig(projectPath: string): Promise<IpcResponse<"project:config">>;

  // inspector (tokens / components / verification)
  inspectorTokens(
    projectPath: string,
    preferredCollection?: string,
  ): Promise<IpcResponse<"inspector:getTokens">>;
  inspectorComponents(projectPath: string): Promise<IpcResponse<"inspector:getComponents">>;
  setTokenValue(
    projectPath: string,
    name: string,
    value: string,
    context?: string,
  ): Promise<IpcResponse<"inspector:setTokenValue">>;
  /** Persist the figma-mode → code-context map (transparent-cockpit editor). */
  setTokenModeMap(
    projectPath: string,
    map: Record<string, string>,
  ): Promise<IpcResponse<"inspector:setTokenModeMap">>;
  /** Create a new design token (name + value); refuses a name/value that already exists in Figma unless allowDuplicate. */
  createToken(
    projectPath: string,
    name: string,
    value: string,
    allowDuplicate?: boolean,
  ): Promise<IpcResponse<"inspector:createToken">>;
  /** Sanitation report: code-only tokens (orphans, with where-used) + value duplicates. */
  getSanitation(projectPath: string): Promise<IpcResponse<"inspector:getSanitation">>;
  /** Re-point a duplicate/flattened token to alias a canonical one (`var(--canonical)`), gated. */
  collapseToken(
    projectPath: string,
    tokenName: string,
    canonicalName: string,
  ): Promise<IpcResponse<"inspector:collapseToken">>;
  /** Persist a code-token → Figma-variable link so the match survives future renames. */
  linkToken(
    projectPath: string,
    codeToken: string,
    figmaPath: string,
  ): Promise<IpcResponse<"inspector:linkToken">>;
  getVerification(projectPath: string): Promise<IpcResponse<"inspector:getVerification">>;
  snapshotComponent(projectPath: string, file: string): Promise<IpcResponse<"inspector:snapshotComponent">>;
  snapshotTokenScope(projectPath: string): Promise<IpcResponse<"inspector:snapshotTokenScope">>;
  restoreFiles(projectPath: string, files: FileSnapshot[]): Promise<IpcResponse<"inspector:restoreFiles">>;

  // run-canvas comments (repo-backed threads under .vortspec/comments/)
  listComments(projectPath: string): Promise<IpcResponse<"comments:list">>;
  upsertComment(projectPath: string, thread: CommentThread): Promise<IpcResponse<"comments:upsert">>;
  resolveComment(projectPath: string, id: string, resolved: boolean): Promise<IpcResponse<"comments:resolve">>;
  /** Repo collaborators/contributors for the @mention autocomplete. */
  commentCollaborators(projectPath: string): Promise<IpcResponse<"comments:collaborators">>;
  /** Notify a message's @mentions via the user's GitHub; returns a receipt or a fix-it. */
  notifyComment(projectPath: string, threadId: string, messageId: string): Promise<IpcResponse<"comments:notify">>;
  /** Push the auto-committed comment commits (manual Share). */
  shareComments(projectPath: string): Promise<IpcResponse<"comments:share">>;

  // workspace filesystem (IDE)
  listDir(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:listDir">>;
  readFile(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:readFile">>;
  readAsset(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:readAsset">>;
  /** Fuzzy-search workspace files + folders (for the composer's @-mention picker). */
  searchFiles(projectPath: string, query: string, limit?: number): Promise<IpcResponse<"workspace:searchFiles">>;
  /** Create an empty file (Explorer "New File"). */
  createFile(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:createFile">>;
  /** Create a folder (Explorer "New Folder"). */
  createDir(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:createDir">>;
  /** Rename or move a file/folder (Explorer rename + drag-to-move). */
  renamePath(projectPath: string, from: string, to: string): Promise<IpcResponse<"workspace:rename">>;
  /** Send a file/folder to the OS trash (reversible). */
  trashPath(projectPath: string, relPath: string): Promise<IpcResponse<"workspace:trash">>;
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
  /** Ensure figma-cli is connected, auto-connecting if needed (warm-up on project open + self-heal). */
  figmaEnsureConnected(): Promise<IpcResponse<"figma:ensureConnected">>;
  figmaOpenAppManagement(): Promise<IpcResponse<"figma:openAppManagement">>;
  figmaConnect(mode: FigmaCliMode): Promise<IpcResponse<"figma:connect">>;
  /** Read design variables from Figma into the reconcile cache (figma-cli primary). */
  figmaSyncVariables(projectPath: string): Promise<IpcResponse<"figma:syncVariables">>;
  /** Read design-system components from Figma into the reconcile cache (figma-cli primary). */
  figmaSyncComponents(projectPath: string): Promise<IpcResponse<"figma:syncComponents">>;
  /** Read the node(s) currently selected in Figma Desktop (figma-cli). */
  figmaSelection(): Promise<IpcResponse<"figma:selection">>;
  /** Validate that the Figma read path (token + Desktop Bridge) can actually read variables + styles. */
  checkFigmaHealth(req: { projectPath: string; figmaFileUrl?: string }): Promise<IpcResponse<"figma:checkHealth">>;
  /** Whether a Figma token is configured (presence only — never the value). */
  figmaTokenStatus(): Promise<IpcResponse<"figma:tokenStatus">>;
  /** Write-through a new Figma token into the user's own Figma MCP config (VortSpec keeps no copy). */
  setFigmaToken(req: { token: string }): Promise<IpcResponse<"figma:setToken">>;
  /** Compute the code→Figma push plan locally (diff token file vs. Figma-variable cache). Never calls Figma. */
  figmaComputePushPlan(projectPath: string): Promise<IpcResponse<"figma:computePushPlan">>;
  /** Apply a confirmed push plan to Figma Variables via figma-cli (source: null → use the MCP fallback). */
  figmaPushVariables(projectPath: string, plan: PushPlan): Promise<IpcResponse<"figma:pushVariables">>;

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
