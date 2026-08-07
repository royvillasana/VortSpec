import { ipcMain, shell, app, BrowserWindow, type WebContents } from "electron";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { ipcContract, type IpcChannel } from "@vortspec/core/ipc";
import { checkEnvironment, verifyClaudeLogin, verifyFigmaMcp, addFigmaMcp } from "./environment/env-manager";
import { installGit, installClaudeCli } from "./environment/base-install";
import {
  listProjects,
  touchProject,
  removeProject,
  pickFolder,
  createFolder,
  pickFile,
  refreshProject,
  openFolder,
  revealPath,
} from "./workspace/workspace-manager";
import { getToolkitStatus, installToolkit } from "./workspace/toolkit-manager";
import { createProject, resyncToolkit } from "./workspace/setup-manager";
import * as fsw from "./workspace/fs-workspace";
import * as pty from "./terminal/pty-manager";
import { ideMcpConfigPath, reportIdeState, resolveIdeAction } from "./ide-mcp/host";
import { readClipboardImage } from "./system/clipboard";
import type { IdeState, IdeActionResult } from "@vortspec/core/ide-mcp";
import * as figmaCli from "./figma/figma-cli";
import * as screenMap from "./figma/screen-map";
import { checkFigmaHealth } from "./figma/figma-health";
import { getFigmaTokenStatus, setFigmaToken } from "./figma/figma-token";
import type { FigmaCliMode } from "@vortspec/core/figma";
import { readProjectConfig } from "./workspace/config-manager";
import { getLibraryReadiness } from "./workspace/library-readiness";
import { detectLibraryInRepo } from "./workspace/library-detect";
import { enumeratePackageComponent } from "./inspector/library-enumerate";
import {
  readThemeOverrides,
  setThemeComponentOverride,
  setThemeFontFamily,
  setThemeTokenOverride,
} from "./inspector/theme-override-store";
import { getFontSources } from "./inspector/fonts";
import {
  listPresets,
  previewPreset,
  applyPreset,
  selectDefaultPreset,
  createPresetFromCurrent,
  importPreset,
} from "./inspector/preset-store";
import { getDesignSystemLibrary, getScreenTokenDrift } from "./inspector/design-library";
import { getEnvStatus, createEnvFromExample } from "./workspace/env-files";
import { ensureStorybook, storybookReadiness, storyGap } from "./workspace/storybook-setup";
import { ensureStylingPipeline } from "./workspace/styling-setup";
import { reconcileProjectExports } from "./workspace/reconcile-exports";
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
import { applyCanvasEdit } from "./canvas/write";
import { getTokenSanitation } from "./inspector/token-sanitation";
import { emitTokenFiles } from "./inspector/token-emit";
import { ingestTokensFromProject } from "./inspector/token-ingest";
import { buildRelationshipIndex, indexStaleness } from "./inspector/relationship-index";
import { writeTokenLink } from "./inspector/token-resolver";
import { discoverRoutes } from "./routes/route-discovery";
import { computePushPlan, computeOrphanPushPlan, VORTSPEC_COLLECTION } from "./inspector/figma-push";
import { readFigmaVariables } from "./inspector/figma-reconcile";
import type { PushPlan } from "@vortspec/core/ipc";
import {
  getInspectorComponents,
  snapshotComponent,
  restoreFiles,
} from "./inspector/component-reader";
import { buildDesignAudit } from "./inspector/design-audit";
import { metadataPlan } from "./inspector/component-metadata";
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
import { groundOptions } from "./inspector/index-digest";
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
import { checkForUpdate, readDismissal, dismissVersion } from "./update/update-checker";
import {
  getManifest,
  saveManifest,
  listManifestVersions,
  readManifestVersion,
  restoreManifestVersion,
  snapshotManifest,
} from "./manifest/manifest-reader";
import type { SnapshotReason } from "@vortspec/core/manifest";
import { getProjectPaletteHtml, writeDesignerMd, buildProjectStandInPrompt, buildProjectTwoTrackPrompt, buildProjectLightPagePrompt, buildProjectGenerateCodePrompt, buildProjectConvertPagePrompt, liteGenerationStatus, markPageGenerated, readLightPage, listLightPages, writeLightPage, listInsertableStandIns, listComponentReadiness } from "./lite/lite-source";
import { resolveEnterpriseStorybookUrl, buildEnterpriseSnapshotPromptFor, buildEnterpriseGeneratePromptFor } from "./enterprise/enterprise-source";
import { serveLightPages, lightPageUrl, clearTokenCssCache } from "./lite/light-serve";
import {
  loadGraph as loadCanvasGraph,
  saveGraph as saveCanvasGraph,
  loadScene as loadCanvasScene,
  saveScene as saveCanvasScene,
  writeSketchPng as writeCanvasSketchPng,
} from "./canvas/canvas-store";
import { buildDrawGeneratePromptFor, recordDrawGenerationFor } from "./canvas/draw-source";
import type { DrawGraph } from "../shared/draw-graph";
import { DRAW_SKETCH_READY_CHANNEL, type DrawSketchReady } from "../shared/draw-events";
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
 * This module is bundled into an ESM main process (`"type": "module"`), where
 * `__dirname` does not exist. It only ever resolved because the bundler injected
 * a shim — and when that shim moved out of module scope, the packaged v0.1.35
 * app threw `ReferenceError: __dirname is not defined` and opened no window at
 * all. Derive it instead; a bundler cannot move this.
 */
const here = (): string => dirname(fileURLToPath(import.meta.url));

/**
 * The single place IPC handlers are registered. Every request and response is
 * validated against the zod contract at the boundary, so a bug on either side
 * surfaces as a clear validation error rather than a silent bad payload.
 *
 * Handlers receive the validated request plus the sender's WebContents (used by
 * agent runs to stream events back to the originating window).
 */
type Handler = (req: never, sender: WebContents) => unknown;

// The Draw window is created by the app SHELL (it owns BrowserWindow); the shell registers its opener
// here at startup so core's `draw:open` handler can relay to it without importing electron windows.
let drawWindowOpener: ((projectPath: string) => void) | null = null;
export function setDrawWindowOpener(opener: (projectPath: string) => void): void {
  drawWindowOpener = opener;
}

/**
 * The Draw window finished: write its sketch PNG, then broadcast DRAW_SKETCH_READY to every window so
 * the waiting compose dialog (in the main window) composes it into its slot. Returns the PNG path.
 */
async function returnDrawSketch(projectPath: string, dataUrl: string): Promise<string> {
  const pngPath = await writeCanvasSketchPng(projectPath, `compose-${Date.now()}`, dataUrl);
  const payload: DrawSketchReady = { projectPath, pngPath, dataUrl };
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(DRAW_SKETCH_READY_CHANNEL, payload);
  return pngPath;
}

/**
 * Re-resolution trigger (change: consume-component-libraries, task 12.5). After ANY token/theme edit —
 * in-place file write or durable overlay — re-derive the light design system so the personalization fans
 * out everywhere without a Figma/Storybook round-trip: `designer.md` + the palette re-theme (they read the
 * overlay-aware `getInspectorTokens`), and the served canvas re-reads its base token CSS. Best-effort:
 * a failure here never fails the edit itself, whose result we pass straight through.
 */
async function afterTokenEdit<T>(projectPath: string, result: T): Promise<T> {
  clearTokenCssCache(projectPath);
  await writeDesignerMd(projectPath).catch(() => {});
  return result;
}

const handlers: Record<IpcChannel, Handler> = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),
  "system:homeDir": () => homedir(),
  // Core is bundled into the app's main process, so `here` is the app's
  // out/main; the IDE emits the guest preload beside it at out/preload/guest.mjs.
  "system:guestPreloadUrl": () => pathToFileURL(join(here(), "../preload/guest.mjs")).href,
  "system:clipboardImage": (() => readClipboardImage()) as Handler,
  "system:checkUpdate": ((req: { force: boolean }) => checkForUpdate(req)) as Handler,
  "system:getUpdateDismissal": () => readDismissal(),
  "system:dismissUpdate": ((version: string) => dismissVersion(version)) as Handler,

  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:verifyFigmaMcp": () => verifyFigmaMcp(),
  "env:addFigmaMcp": () => addFigmaMcp(),
  "env:installGit": () => installGit(),
  "env:installClaude": () => installClaudeCli(),
  "env:openInstall": ((url: string) =>
    shell.openExternal(url).then(() => undefined)) as Handler,

  "workspace:pickFolder": ((req?: { create: boolean }) =>
    pickFolder(req ?? { create: false })) as Handler,
  "workspace:createFolder": (() => createFolder()) as Handler,
  "workspace:pickFile": ((req?: { filters?: { name: string; extensions: string[] }[] }) =>
    pickFile(req?.filters ?? [])) as Handler,
  "workspace:listProjects": () => listProjects(),
  "workspace:touchProject": ((path: string) => touchProject(path)) as Handler,
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

  // Screen ↔ Figma round-trip map (change: add-screen-to-figma).
  "screenMap:get": (async (r: { projectPath: string }) => ({
    map: await screenMap.readScreenMap(r.projectPath),
    targetFileKey: await screenMap.resolveTargetFileKey(r.projectPath),
  })) as Handler,
  "screenMap:upsert": ((r: {
    projectPath: string;
    screenKey: string;
    entry: import("@vortspec/core/inspector").ScreenEntry;
    fileKey?: string;
  }) => screenMap.upsertScreen(r.projectPath, r.screenKey, r.entry, r.fileKey)) as Handler,
  "figma:connect": ((r: { mode: FigmaCliMode }) => figmaCli.connect(r.mode)) as Handler,
  "figma:syncVariables": ((r: { projectPath: string }) =>
    figmaCli.syncVariablesToCache(r.projectPath)) as Handler,

  // ── The canonical token pipeline (OpenSpec change: agentic-design-system, group 7) ──
  //
  // Ingest emits on its own tail, so these two exist for the cases an ingest does not cover:
  // `tokens:emit` is the ON-DEMAND route — a styling switch, which changes what the token file
  // should contain without changing the artifact, and therefore must not touch the design source
  // (asserted in `one-scan-many-emits.test.ts`). It also carries `onDivergence`, which is how a
  // reported divergence is finally resolved: the user's answer, never a default.
  "tokens:emit": ((r: {
    projectPath: string;
    onDivergence?: "overwrite" | "keep";
    tailwindVersion?: 3 | 4;
  }) =>
    emitTokenFiles(r.projectPath, {
      onDivergence: r.onDivergence,
      tailwindVersion: r.tailwindVersion,
    })) as Handler,
  // `tokens:ingest` reads the project's OWN token file as the design source (task 7.10) — the path
  // for a project with no design tool attached, and the one that keeps a consumed library's
  // artifact current.
  "index:build": (async (r: { projectPath: string }) => {
    const result = await buildRelationshipIndex(r.projectPath);
    return { written: result.written, generatedAt: result.generatedAt };
  }) as Handler,
  "index:staleness": ((r: { projectPath: string }) => indexStaleness(r.projectPath)) as Handler,
  "tokens:ingest": ((r: { projectPath: string }) =>
    ingestTokensFromProject(r.projectPath, { generatedAt: new Date().toISOString() })) as Handler,
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
  "figma:computeOrphanPushPlan": (async (r: { projectPath: string; orphanNames: string[] }) => {
    const [result, figmaVars] = await Promise.all([
      getInspectorTokens(r.projectPath),
      readFigmaVariables(r.projectPath),
    ]);
    return computeOrphanPushPlan(result.tokens, r.orphanNames, figmaVars ?? [], {
      collection: result.activeCollection ?? VORTSPEC_COLLECTION,
      ...(result.activeMode ? { mode: result.activeMode } : {}),
    });
  }) as Handler,
  "figma:pushVariables": ((r: { projectPath: string; plan: PushPlan }) =>
    figmaCli.pushVariablesToFigma(r.plan)) as Handler,

  "toolkit:status": ((path: string) => getToolkitStatus(path)) as Handler,
  "toolkit:install": ((path: string) => installToolkit(path)) as Handler,
  "toolkit:resync": ((path: string) => resyncToolkit(path)) as Handler,

  "agent:startRun": (async (opts: AgentRunOptions, sender: WebContents) =>
    startRun(sender, await groundOptions(opts))) as Handler,
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
  "lite:palette": ((projectPath: string) => getProjectPaletteHtml(projectPath)) as Handler,
  "lite:writeDesigner": ((projectPath: string) => writeDesignerMd(projectPath)) as Handler,
  "lite:standInPrompt": ((projectPath: string) => buildProjectStandInPrompt(projectPath)) as Handler,
  "lite:twoTrackPrompt": ((projectPath: string) => buildProjectTwoTrackPrompt(projectPath)) as Handler,
  "lite:pageUrl": ((r: { projectPath: string; name: string }) =>
    serveLightPages(r.projectPath).then((base) => lightPageUrl(base, r.name))) as Handler,
  "lite:generatePrompt": ((projectPath: string) => buildProjectGenerateCodePrompt(projectPath)) as Handler,
  "lite:convertPage": ((r: { projectPath: string; name: string }) =>
    buildProjectConvertPagePrompt(r.projectPath, r.name)) as Handler,
  "enterprise:storybookUrl": ((projectPath: string) => resolveEnterpriseStorybookUrl(projectPath)) as Handler,
  "enterprise:snapshotPrompt": ((projectPath: string) => buildEnterpriseSnapshotPromptFor(projectPath)) as Handler,
  "enterprise:generatePrompt": ((projectPath: string) => buildEnterpriseGeneratePromptFor(projectPath)) as Handler,
  "lite:genStatus": ((projectPath: string) => liteGenerationStatus(projectPath)) as Handler,
  "lite:markGenerated": ((r: { projectPath: string; name: string }) =>
    markPageGenerated(r.projectPath, r.name)) as Handler,
  "lite:standins": ((projectPath: string) => listInsertableStandIns(projectPath)) as Handler,
  "lite:readiness": ((projectPath: string) => listComponentReadiness(projectPath)) as Handler,
  "lite:pagePrompt": ((r: { projectPath: string; name: string; description: string }) =>
    buildProjectLightPagePrompt(r.projectPath, r.name, r.description)) as Handler,
  "lite:page": ((r: { projectPath: string; name: string }) => readLightPage(r.projectPath, r.name)) as Handler,
  "lite:pages": ((projectPath: string) => listLightPages(projectPath)) as Handler,
  "lite:writePage": ((r: { projectPath: string; name: string; html: string }) =>
    writeLightPage(r.projectPath, r.name, r.html)) as Handler,
  "canvas:loadGraph": ((projectPath: string) => loadCanvasGraph(projectPath)) as Handler,
  "canvas:saveGraph": ((r: { projectPath: string; graph: DrawGraph }) => saveCanvasGraph(r.projectPath, r.graph)) as Handler,
  "canvas:loadScene": ((projectPath: string) => loadCanvasScene(projectPath)) as Handler,
  "canvas:saveScene": ((r: { projectPath: string; scene: string }) => saveCanvasScene(r.projectPath, r.scene)) as Handler,
  "canvas:exportSketch": ((r: { projectPath: string; frameId: string; dataUrl: string }) =>
    writeCanvasSketchPng(r.projectPath, r.frameId, r.dataUrl)) as Handler,
  "draw:open": ((projectPath: string) => {
    drawWindowOpener?.(projectPath);
  }) as Handler,
  "draw:generatePrompt": ((r: {
    projectPath: string;
    frameId: string;
    label: string;
    note?: string;
    pngPath: string;
    intent?: "create-new" | "customize-existing";
  }) => buildDrawGeneratePromptFor(r)) as Handler,
  "draw:recordGeneration": ((r: { projectPath: string; sketchId: string; component: string; outputRef?: string }) =>
    recordDrawGenerationFor(r)) as Handler,
  "draw:returnSketch": ((r: { projectPath: string; dataUrl: string }) => returnDrawSketch(r.projectPath, r.dataUrl)) as Handler,
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
  "styling:ensure": ((projectPath: string) => ensureStylingPipeline(projectPath)) as Handler,
  "styling:reconcileExports": ((projectPath: string) => reconcileProjectExports(projectPath)) as Handler,
  "devserver:storybookIndex": ((url: string) => getStorybookIndex(url)) as Handler,
  "flow:setPublishTarget": ((req: { projectPath: string; repoUrl: string }) =>
    setPublishTarget(req.projectPath, req.repoUrl)) as Handler,
  "artifact:read": ((req: { projectPath: string; relPath: string }) =>
    readArtifact(req.projectPath, req.relPath)) as Handler,
  "artifact:findLatest": ((req: { projectPath: string; suffix: string }) =>
    findLatestArtifact(req.projectPath, req.suffix)) as Handler,
  "project:config": ((projectPath: string) => readProjectConfig(projectPath)) as Handler,
  "library:readiness": ((projectPath: string) => getLibraryReadiness(projectPath)) as Handler,
  "library:detect": ((projectPath: string) => detectLibraryInRepo(projectPath)) as Handler,
  "library:enumerateComponent": ((a: { projectPath: string; importBase: string; component: string }) =>
    enumeratePackageComponent(a.projectPath, a.importBase, a.component)) as Handler,
  "theme:getOverrides": ((projectPath: string) => readThemeOverrides(projectPath)) as Handler,
  "theme:setTokenOverride": ((a: { projectPath: string; name: string; value: string; mode?: string }) =>
    setThemeTokenOverride(a.projectPath, a.name, a.value, a.mode).then((r) =>
      afterTokenEdit(a.projectPath, r),
    )) as Handler,
  "theme:setComponentOverride": ((a: {
    projectPath: string;
    component: string;
    target: { variant?: string; option?: string; slot?: string };
    decls: Record<string, string>;
  }) =>
    setThemeComponentOverride(a.projectPath, a.component, a.target, a.decls).then((r) =>
      afterTokenEdit(a.projectPath, r),
    )) as Handler,
  "designSystem:library": ((projectPath: string) => getDesignSystemLibrary(projectPath)) as Handler,
  "designSystem:tokenDrift": ((projectPath: string) => getScreenTokenDrift(projectPath)) as Handler,
  "designSystem:fonts": ((a: { projectPath: string; full?: boolean }) =>
    getFontSources(a.projectPath, a.full ?? false)) as Handler,
  "preset:list": ((projectPath: string) => listPresets(projectPath)) as Handler,
  "preset:preview": ((a: { projectPath: string; presetId: string }) =>
    previewPreset(a.projectPath, a.presetId)) as Handler,
  "preset:apply": ((a: { projectPath: string; presetId: string }) =>
    applyPreset(a.projectPath, a.presetId).then((r) => afterTokenEdit(a.projectPath, r))) as Handler,
  "preset:selectDefault": ((projectPath: string) =>
    selectDefaultPreset(projectPath).then(() => afterTokenEdit(projectPath, null))) as Handler,
  "preset:createFromCurrent": ((a: { projectPath: string; name: string }) =>
    createPresetFromCurrent(a.projectPath, a.name)) as Handler,
  "preset:import": ((a: { projectPath: string; raw: unknown }) =>
    importPreset(a.projectPath, a.raw)) as Handler,
  "theme:setFontFamily": ((a: { projectPath: string; token: string; stack: string; google?: string }) =>
    setThemeFontFamily(a.projectPath, a.token, a.stack, a.google).then((r) =>
      afterTokenEdit(a.projectPath, r),
    )) as Handler,
  "inspector:getTokens": ((req: string | { projectPath: string; preferredCollection?: string }) =>
    typeof req === "string"
      ? getInspectorTokens(req)
      : getInspectorTokens(req.projectPath, req.preferredCollection)) as Handler,
  "inspector:getComponents": ((projectPath: string) =>
    getInspectorComponents(projectPath)) as Handler,
  "inspector:designAudit": ((projectPath: string) => buildDesignAudit(projectPath)) as Handler,
  "inspector:metadataPlan": ((projectPath: string) => metadataPlan(projectPath)) as Handler,
  "inspector:setTokenValue": ((req: {
    projectPath: string;
    name: string;
    value: string;
    context?: string;
  }) =>
    setInspectorTokenValue(req.projectPath, req.name, req.value, req.context).then((r) =>
      afterTokenEdit(req.projectPath, r),
    )) as Handler,
  "canvas:writeEdit": ((req: {
    projectPath: string;
    file: string;
    edit: import("@vortspec/core/canvas-edit").CanvasEdit;
    expect?: { tag?: string; className?: string };
  }) => applyCanvasEdit(req.projectPath, req.file, req.edit, req.expect)) as Handler,
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
