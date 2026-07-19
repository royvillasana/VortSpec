import { ipcMain, shell, app, type WebContents } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ipcContract, type IpcChannel } from "@vortspec/core/ipc";
import { checkEnvironment, verifyClaudeLogin, verifyFigmaMcp } from "./environment/env-manager";
import {
  listProjects,
  removeProject,
  pickFolder,
  createFolder,
  pickFile,
  refreshProject,
  openFolder,
  revealPath,
} from "./workspace/workspace-manager";
import { getToolkitStatus, installToolkit } from "./workspace/toolkit-manager";
import { createProject } from "./workspace/setup-manager";
import * as fsw from "./workspace/fs-workspace";
import * as pty from "./terminal/pty-manager";
import { ideMcpConfigPath, reportIdeState, resolveIdeAction } from "./ide-mcp/host";
import { readClipboardImage } from "./system/clipboard";
import type { IdeState, IdeActionResult } from "@vortspec/core/ide-mcp";
import * as figmaCli from "./figma/figma-cli";
import { checkFigmaHealth } from "./figma/figma-health";
import { getFigmaTokenStatus, setFigmaToken } from "./figma/figma-token";
import type { FigmaCliMode } from "@vortspec/core/figma";
import { readProjectConfig } from "./workspace/config-manager";
import { getEnvStatus, createEnvFromExample } from "./workspace/env-files";
import { ensureStorybook, storybookReadiness, storyGap } from "./workspace/storybook-setup";
import { extractWalkthrough } from "./workspace/walkthrough";
import {
  getInspectorTokens,
  setInspectorTokenValue,
  createInspectorToken,
  snapshotTokenScope,
  snapshotSourceScope,
  writeTokenModeMap,
  collapseTokenToAlias,
} from "./inspector/token-parser";
import { getTokenSanitation } from "./inspector/token-sanitation";
import { writeTokenLink } from "./inspector/token-resolver";
import { discoverRoutes } from "./routes/route-discovery";
import { computePushPlan, VORTSPEC_COLLECTION } from "./inspector/figma-push";
import { readFigmaVariables } from "./inspector/figma-reconcile";
import type { PushPlan } from "@vortspec/core/ipc";
import {
  getInspectorComponents,
  snapshotComponent,
  restoreFiles,
} from "./inspector/component-reader";
import {
  acceptComposition,
  sweepComposition,
  checkComposeTarget,
  sweepProjectScaffold,
} from "./compose/compose-apply";
import type { FileSnapshot } from "@vortspec/core/ipc";
import { listThreads } from "./workspace/comment-store";
import { postComment, resolveComment, shareComments } from "./workspace/comment-sync";
import { collaborators, notify } from "./workspace/comment-mentions";
import type { CommentThread } from "@vortspec/core/comment";
import { getVerification } from "./inspector/verification-reader";
import type { SetupAnswers } from "@vortspec/core/setup";
import { startRun, cancelRun, hasActiveRun, getLastRun } from "./agent/run-manager";
import { getUsage } from "./usage/usage-reader";
import * as gitAdapter from "./git/git-adapter";
import { providerAuth, providerSwitchAccount, providerCreateRepo, providerCreatePR, providerPublish } from "./git/providers";
import type { RepoVisibility, ProviderId } from "@vortspec/core/git";
import { getJiraAuth, installJira, listJiraProjects, createJiraIssue, getJiraIssue } from "./tasks/jira";
import { createIssueFromSpec } from "./tasks/manager";
import { readLinks } from "./tasks/link-store";
import type { IssueType } from "@vortspec/core/task";
import { readProfile, saveProfile } from "./settings/profile-manager";
import type { Profile } from "@vortspec/core/profile";
import {
  getFlow,
  setStageStatus,
  approveStage,
  requestChanges,
  saveIntake,
  completeInput,
  setPublishTarget,
  readArtifact,
  findLatestArtifact,
} from "./flow/flow-manager";
import { getRunHistory } from "./flow/history-reader";
import { checkForUpdate } from "./update/update-checker";
import {
  getManifest,
  saveManifest,
  listManifestVersions,
  readManifestVersion,
  restoreManifestVersion,
  snapshotManifest,
} from "./manifest/manifest-reader";
import type { SnapshotReason } from "@vortspec/core/manifest";
import {
  startDevServer,
  stopDevServer,
  getDevServerStatus,
  startAppServer,
  stopAppServer,
  getAppServerStatus,
  getPreviewInfo,
  getStorybookIndex,
} from "./workspace/dev-server";
import type { AgentRunOptions } from "@vortspec/core/run-events";
import type { StageStatus } from "@vortspec/core/flow";

/**
 * The single place IPC handlers are registered. Every request and response is
 * validated against the zod contract at the boundary, so a bug on either side
 * surfaces as a clear validation error rather than a silent bad payload.
 *
 * Handlers receive the validated request plus the sender's WebContents (used by
 * agent runs to stream events back to the originating window).
 */
type Handler = (req: never, sender: WebContents) => unknown;

const handlers: Record<IpcChannel, Handler> = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),
  "system:homeDir": () => homedir(),
  // Core is bundled into the app's main process, so __dirname is the app's
  // out/main; the IDE emits the guest preload beside it at out/preload/guest.mjs.
  "system:guestPreloadUrl": () => pathToFileURL(join(__dirname, "../preload/guest.mjs")).href,
  "system:clipboardImage": (() => readClipboardImage()) as Handler,
  "system:checkUpdate": () => checkForUpdate(),

  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:verifyFigmaMcp": () => verifyFigmaMcp(),
  "env:openInstall": ((url: string) =>
    shell.openExternal(url).then(() => undefined)) as Handler,

  "workspace:pickFolder": ((req?: { create: boolean }) =>
    pickFolder(req ?? { create: false })) as Handler,
  "workspace:createFolder": (() => createFolder()) as Handler,
  "workspace:pickFile": ((req?: { filters?: { name: string; extensions: string[] }[] }) =>
    pickFile(req?.filters ?? [])) as Handler,
  "workspace:listProjects": () => listProjects(),
  "workspace:removeProject": ((id: string) => removeProject(id)) as Handler,
  "workspace:openFolder": ((path: string) => openFolder(path)) as Handler,
  "workspace:revealPath": ((req: { projectPath: string; relPath: string }) => {
    revealPath(req.projectPath, req.relPath);
    return undefined;
  }) as Handler,
  "workspace:refreshProject": ((path: string) => refreshProject(path)) as Handler,
  "workspace:envStatus": ((path: string) => getEnvStatus(path)) as Handler,
  "workspace:createEnv": ((req: { projectPath: string; example: string }) =>
    createEnvFromExample(req.projectPath, req.example)) as Handler,
  "workspace:openWalkthrough": ((destPath: string) => extractWalkthrough(destPath)) as Handler,
  "workspace:createProject": ((req: { path: string; answers: SetupAnswers }) =>
    createProject(req.path, req.answers)) as Handler,
  "workspace:listDir": ((r: { projectPath: string; relPath: string }) =>
    fsw.listDir(r.projectPath, r.relPath)) as Handler,
  "workspace:readFile": ((r: { projectPath: string; relPath: string }) =>
    fsw.readFile(r.projectPath, r.relPath)) as Handler,
  "workspace:readAsset": ((r: { projectPath: string; relPath: string }) =>
    fsw.readAsset(r.projectPath, r.relPath)) as Handler,
  "workspace:searchFiles": ((r: { projectPath: string; query: string; limit?: number }) =>
    fsw.searchFiles(r.projectPath, r.query, r.limit)) as Handler,
  "workspace:createFile": ((r: { projectPath: string; relPath: string }) =>
    fsw.createFile(r.projectPath, r.relPath)) as Handler,
  "workspace:createDir": ((r: { projectPath: string; relPath: string }) =>
    fsw.createDir(r.projectPath, r.relPath)) as Handler,
  "workspace:rename": ((r: { projectPath: string; from: string; to: string }) =>
    fsw.renamePath(r.projectPath, r.from, r.to)) as Handler,
  "workspace:trash": ((r: { projectPath: string; relPath: string }) =>
    fsw.trashPath(r.projectPath, r.relPath)) as Handler,
  "workspace:writeFile": ((r: { projectPath: string; relPath: string; content: string }) =>
    fsw.writeFile(r.projectPath, r.relPath, r.content)) as Handler,
  "workspace:watchStart": ((projectPath: string, sender: WebContents) => {
    fsw.startWatch(sender, projectPath);
    return undefined;
  }) as Handler,
  "workspace:watchStop": ((projectPath: string) => {
    fsw.stopWatch(projectPath);
    return undefined;
  }) as Handler,
  "git:fileAtHead": ((r: { projectPath: string; relPath: string }) =>
    gitAdapter.getFileAtHead(r.projectPath, r.relPath)) as Handler,
  "terminal:create": ((r: { id: string; projectPath: string; cols?: number; rows?: number }, sender: WebContents) => {
    pty.createSession(sender, { id: r.id, cwd: r.projectPath, cols: r.cols, rows: r.rows });
    return undefined;
  }) as Handler,
  "terminal:write": ((r: { id: string; data: string }) => {
    pty.writeSession(r.id, r.data);
    return undefined;
  }) as Handler,
  "terminal:resize": ((r: { id: string; cols: number; rows: number }) => {
    pty.resizeSession(r.id, r.cols, r.rows);
    return undefined;
  }) as Handler,
  "terminal:kill": ((id: string) => {
    pty.killSession(id);
    return undefined;
  }) as Handler,

  "ide:mcpConfigPath": ((_r: { projectPath: string }, sender: WebContents) =>
    ideMcpConfigPath(sender)) as Handler,
  "ide:reportState": ((r: IdeState) => reportIdeState(r)) as Handler,
  "ide:resolveAction": ((r: IdeActionResult) => resolveIdeAction(r)) as Handler,

  "figma:status": (() => figmaCli.getConnection()) as Handler,
  // Auto-connect (warm-up on project open + self-heal); never throws.
  "figma:ensureConnected": (() => figmaCli.ensureConnected()) as Handler,
  "figma:openAppManagement": (() =>
    figmaCli.openAppManagementSettings().then(() => undefined)) as Handler,
  "figma:connect": ((r: { mode: FigmaCliMode }) => figmaCli.connect(r.mode)) as Handler,
  "figma:syncVariables": ((r: { projectPath: string }) =>
    figmaCli.syncVariablesToCache(r.projectPath)) as Handler,
  "figma:syncComponents": ((r: { projectPath: string }) =>
    figmaCli.syncComponentsToCache(r.projectPath)) as Handler,
  "figma:selection": (() => figmaCli.getSelection()) as Handler,
  "figma:checkHealth": ((r: { projectPath: string; figmaFileUrl?: string }) =>
    checkFigmaHealth(r)) as Handler,
  "figma:tokenStatus": (() => getFigmaTokenStatus()) as Handler,
  "figma:setToken": ((r: { token: string }) => setFigmaToken(r.token)) as Handler,
  // Code→Figma push: plan is computed locally (never calls Figma); apply is delegated to figma-cli.
  "figma:computePushPlan": (async (projectPath: string) => {
    const [result, figmaVars] = await Promise.all([
      getInspectorTokens(projectPath),
      readFigmaVariables(projectPath),
    ]);
    // Push into the collection currently in view (true two-way sync), falling back
    // to VortSpec's own auto-created collection when the project isn't synced —
    // writing into the active mode so per-mode values round-trip.
    return computePushPlan(result.tokens, figmaVars ?? [], {
      collection: result.activeCollection ?? VORTSPEC_COLLECTION,
      ...(result.activeMode ? { mode: result.activeMode } : {}),
    });
  }) as Handler,
  "figma:pushVariables": ((r: { projectPath: string; plan: PushPlan }) =>
    figmaCli.pushVariablesToFigma(r.plan)) as Handler,

  "toolkit:status": ((path: string) => getToolkitStatus(path)) as Handler,
  "toolkit:install": ((path: string) => installToolkit(path)) as Handler,

  "agent:startRun": ((opts: AgentRunOptions, sender: WebContents) =>
    startRun(sender, opts)) as Handler,
  "agent:cancelRun": ((runId: string) => {
    cancelRun(runId);
    return undefined;
  }) as Handler,
  "agent:hasActiveRun": ((projectPath: string) => hasActiveRun(projectPath)) as Handler,
  "agent:lastRun": ((projectPath: string) => getLastRun(projectPath)) as Handler,
  "usage:get": (() => getUsage()) as Handler,

  "git:status": ((p: string) => gitAdapter.getStatus(p)) as Handler,
  "git:branches": ((p: string) => gitAdapter.getBranches(p)) as Handler,
  "git:remotes": ((p: string) => gitAdapter.getRemotes(p)) as Handler,
  "git:log": ((p: string) => gitAdapter.getLog(p)) as Handler,
  "git:graph": ((p: string) => gitAdapter.getGraph(p)) as Handler,
  "git:stage": ((r: { projectPath: string; paths: string[] }) =>
    gitAdapter.stage(r.projectPath, r.paths)) as Handler,
  "git:unstage": ((r: { projectPath: string; paths: string[] }) =>
    gitAdapter.unstage(r.projectPath, r.paths)) as Handler,
  "git:commit": ((r: { projectPath: string; message: string }) =>
    gitAdapter.commit(r.projectPath, r.message)) as Handler,
  "git:checkout": ((r: { projectPath: string; name: string }) =>
    gitAdapter.checkout(r.projectPath, r.name)) as Handler,
  "git:createBranch": ((r: { projectPath: string; name: string }) =>
    gitAdapter.createBranch(r.projectPath, r.name)) as Handler,
  "git:fetch": ((p: string) => gitAdapter.fetch(p)) as Handler,
  "git:pull": ((p: string) => gitAdapter.pull(p)) as Handler,
  "git:push": ((p: string) => gitAdapter.push(p)) as Handler,
  "git:init": ((p: string) => gitAdapter.init(p)) as Handler,
  "provider:auth": ((projectPath: string) => providerAuth(projectPath)) as Handler,
  "provider:switchAccount": ((r: { projectPath: string; account: string }) =>
    providerSwitchAccount(r.projectPath, r.account)) as Handler,
  "provider:createRepo": ((r: { projectPath: string; providerId?: ProviderId; name: string; visibility: RepoVisibility; description?: string }) =>
    providerCreateRepo(r.projectPath, { providerId: r.providerId, name: r.name, visibility: r.visibility, description: r.description })) as Handler,
  "provider:createPR": ((r: { projectPath: string; base?: string; title: string; body?: string }) =>
    providerCreatePR(r.projectPath, { base: r.base, title: r.title, body: r.body })) as Handler,
  "git:import": ((r: { projectPath: string; url: string; branch?: string }) =>
    gitAdapter.importInto(r.projectPath, r.url, r.branch)) as Handler,
  "provider:publish": ((r: { projectPath: string; branch: string; title: string; body?: string }) =>
    providerPublish(r.projectPath, { branch: r.branch, title: r.title, body: r.body })) as Handler,

  "task:auth": (() => getJiraAuth()) as Handler,
  "task:install": (() => installJira()) as Handler,
  "task:projects": (() => listJiraProjects()) as Handler,
  "task:createIssue": ((r: { project: string; type: IssueType; summary: string; description?: string }) =>
    createJiraIssue(r)) as Handler,
  "task:createFromSpec": ((r: { projectPath: string; project: string; type: IssueType; specPath: string; ref: string }) =>
    createIssueFromSpec(r)) as Handler,
  "task:links": ((projectPath: string) => readLinks(projectPath)) as Handler,
  "task:issueStatus": ((key: string) => getJiraIssue(key)) as Handler,
  "profile:get": (() => readProfile()) as Handler,
  "profile:save": ((profile: Profile) => saveProfile(profile)) as Handler,

  "flow:get": ((projectPath: string) => getFlow(projectPath)) as Handler,
  "flow:setStageStatus": ((req: {
    projectPath: string;
    stageId: string;
    status: StageStatus;
  }) => setStageStatus(req.projectPath, req.stageId, req.status)) as Handler,
  "flow:approveStage": ((req: { projectPath: string; stageId: string }) =>
    approveStage(req.projectPath, req.stageId)) as Handler,
  "flow:requestChanges": ((req: {
    projectPath: string;
    stageId: string;
    notes: string;
  }) => requestChanges(req.projectPath, req.stageId, req.notes)) as Handler,
  "flow:saveIntake": ((req: { projectPath: string; content: string }) =>
    saveIntake(req.projectPath, req.content)) as Handler,
  "flow:completeInput": ((req: { projectPath: string; stageId: string }) =>
    completeInput(req.projectPath, req.stageId)) as Handler,
  "flow:getHistory": ((projectPath: string) => getRunHistory(projectPath)) as Handler,
  "manifest:get": ((projectPath: string) => getManifest(projectPath)) as Handler,
  "manifest:save": ((req: { projectPath: string; content: string }) =>
    saveManifest(req.projectPath, req.content, new Date().toISOString())) as Handler,
  "manifest:listVersions": ((projectPath: string) =>
    listManifestVersions(projectPath)) as Handler,
  "manifest:readVersion": ((req: { projectPath: string; id: string }) =>
    readManifestVersion(req.projectPath, req.id)) as Handler,
  "manifest:restoreVersion": ((req: { projectPath: string; id: string }) =>
    restoreManifestVersion(req.projectPath, req.id, new Date().toISOString())) as Handler,
  "manifest:snapshot": ((req: {
    projectPath: string;
    reason: SnapshotReason;
    runId?: string;
  }) =>
    snapshotManifest(req.projectPath, {
      reason: req.reason,
      runId: req.runId,
      timestamp: new Date().toISOString(),
    }).then(() => getManifest(req.projectPath))) as Handler,
  "devserver:start": ((projectPath: string, sender: WebContents) =>
    startDevServer(sender, projectPath)) as Handler,
  "devserver:stop": ((projectPath: string) => {
    stopDevServer(projectPath);
    return undefined;
  }) as Handler,
  "devserver:status": ((projectPath: string) => getDevServerStatus(projectPath)) as Handler,
  "appserver:start": ((projectPath: string, sender: WebContents) => startAppServer(sender, projectPath)) as Handler,
  "appserver:stop": ((projectPath: string) => {
    stopAppServer(projectPath);
    return undefined;
  }) as Handler,
  "appserver:status": ((projectPath: string) => getAppServerStatus(projectPath)) as Handler,
  "devserver:previewInfo": ((projectPath: string) => getPreviewInfo(projectPath)) as Handler,
  "storybook:status": ((projectPath: string) =>
    Promise.all([storybookReadiness(projectPath), storyGap(projectPath)]).then(([r, g]) => ({
      installed: r.installed,
      hasConfig: r.hasConfig,
      hasScript: r.hasScript,
      storyCount: r.storyCount,
      components: g.components,
      missingStories: g.missing,
    }))) as Handler,
  "storybook:ensure": ((projectPath: string) =>
    ensureStorybook({ projectPath }).then((res) => ({
      state: res.state,
      installed: res.readiness.installed,
      storyCount: res.readiness.storyCount,
      error: res.error,
    }))) as Handler,
  "devserver:storybookIndex": ((url: string) => getStorybookIndex(url)) as Handler,
  "flow:setPublishTarget": ((req: { projectPath: string; repoUrl: string }) =>
    setPublishTarget(req.projectPath, req.repoUrl)) as Handler,
  "artifact:read": ((req: { projectPath: string; relPath: string }) =>
    readArtifact(req.projectPath, req.relPath)) as Handler,
  "artifact:findLatest": ((req: { projectPath: string; suffix: string }) =>
    findLatestArtifact(req.projectPath, req.suffix)) as Handler,
  "project:config": ((projectPath: string) => readProjectConfig(projectPath)) as Handler,
  "inspector:getTokens": ((req: string | { projectPath: string; preferredCollection?: string }) =>
    typeof req === "string"
      ? getInspectorTokens(req)
      : getInspectorTokens(req.projectPath, req.preferredCollection)) as Handler,
  "inspector:getComponents": ((projectPath: string) =>
    getInspectorComponents(projectPath)) as Handler,
  "inspector:setTokenValue": ((req: {
    projectPath: string;
    name: string;
    value: string;
    context?: string;
  }) => setInspectorTokenValue(req.projectPath, req.name, req.value, req.context)) as Handler,
  "inspector:setTokenModeMap": ((req: { projectPath: string; map: Record<string, string> }) =>
    writeTokenModeMap(req.projectPath, req.map)) as Handler,
  "inspector:createToken": ((req: {
    projectPath: string;
    name: string;
    value: string;
    allowDuplicate?: boolean;
  }) => createInspectorToken(req.projectPath, req.name, req.value, req.allowDuplicate)) as Handler,
  "inspector:getSanitation": ((projectPath: string) => getTokenSanitation(projectPath)) as Handler,
  "inspector:collapseToken": ((req: {
    projectPath: string;
    tokenName: string;
    canonicalName: string;
  }) => collapseTokenToAlias(req.projectPath, req.tokenName, req.canonicalName)) as Handler,
  "inspector:linkToken": ((req: {
    projectPath: string;
    codeToken: string;
    figmaPath: string;
  }) =>
    writeTokenLink(req.projectPath, req.codeToken, req.figmaPath).then(() =>
      getInspectorTokens(req.projectPath),
    )) as Handler,
  "inspector:getVerification": ((projectPath: string) => getVerification(projectPath)) as Handler,
  "inspector:snapshotComponent": ((req: { projectPath: string; file: string }) =>
    snapshotComponent(req.projectPath, req.file)) as Handler,
  "inspector:snapshotTokenScope": ((projectPath: string) =>
    snapshotTokenScope(projectPath)) as Handler,
  "inspector:snapshotSourceScope": ((projectPath: string) =>
    snapshotSourceScope(projectPath)) as Handler,
  "routes:discover": ((projectPath: string) => discoverRoutes(projectPath)) as Handler,
  "inspector:restoreFiles": ((req: { projectPath: string; files: FileSnapshot[] }) =>
    restoreFiles(req.projectPath, req.files).then(() => undefined)) as Handler,
  "compose:accept": ((req: { projectPath: string; file: string; runId: string; keepOption: number }) =>
    acceptComposition(req.projectPath, req.file, req.runId, req.keepOption)) as Handler,
  "compose:sweep": ((req: { projectPath: string; files: string[] }) =>
    sweepComposition(req.projectPath, req.files).then(() => undefined)) as Handler,
  "compose:checkTarget": ((req: { projectPath: string; file: string }) =>
    checkComposeTarget(req.projectPath, req.file)) as Handler,
  "compose:sweepProject": ((projectPath: string) => sweepProjectScaffold(projectPath)) as Handler,
  "comments:list": ((projectPath: string) => listThreads(projectPath)) as Handler,
  "comments:upsert": ((req: { projectPath: string; thread: CommentThread }) =>
    postComment(req.projectPath, req.thread)) as Handler,
  "comments:resolve": ((req: { projectPath: string; id: string; resolved: boolean }) =>
    resolveComment(req.projectPath, req.id, req.resolved)) as Handler,
  "comments:collaborators": ((projectPath: string) => collaborators(projectPath)) as Handler,
  "comments:notify": ((req: { projectPath: string; threadId: string; messageId: string }) =>
    notify(req.projectPath, req.threadId, req.messageId)) as Handler,
  "comments:share": ((projectPath: string) => shareComments(projectPath)) as Handler,
};

export function registerIpc(): void {
  (Object.keys(ipcContract) as IpcChannel[]).forEach((channel) => {
    const contract = ipcContract[channel];
    ipcMain.handle(channel, async (event, rawRequest: unknown) => {
      const request = contract.request.parse(rawRequest);
      const result = await handlers[channel](request as never, event.sender);
      return contract.response.parse(result);
    });
  });
}
