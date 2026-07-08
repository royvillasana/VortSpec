import { ipcMain, shell, app, type WebContents } from "electron";
import { ipcContract, type IpcChannel } from "../shared/ipc";
import { checkEnvironment, verifyClaudeLogin, verifyFigmaMcp } from "./environment/env-manager";
import {
  listProjects,
  pickFolder,
  createFolder,
  refreshProject,
  openFolder,
  revealPath,
} from "./workspace/workspace-manager";
import { getToolkitStatus, installToolkit } from "./workspace/toolkit-manager";
import { createProject } from "./workspace/setup-manager";
import { readProjectConfig } from "./workspace/config-manager";
import {
  getInspectorTokens,
  setInspectorTokenValue,
  snapshotTokenScope,
} from "./inspector/token-parser";
import {
  getInspectorComponents,
  snapshotComponent,
  restoreFiles,
} from "./inspector/component-reader";
import type { FileSnapshot } from "../shared/ipc";
import { getVerification } from "./inspector/verification-reader";
import type { SetupAnswers } from "../shared/setup";
import { startRun, cancelRun, hasActiveRun, getLastRun } from "./agent/run-manager";
import { getUsage } from "./usage/usage-reader";
import * as gitAdapter from "./git/git-adapter";
import { getGithubAuth, switchGithubAccount, createGithubRepo, createGithubPR, publishDesignSystem } from "./git/github";
import type { RepoVisibility } from "../shared/git";
import { readProfile, saveProfile } from "./settings/profile-manager";
import type { Profile } from "../shared/profile";
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
import type { SnapshotReason } from "../shared/manifest";
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
import type { AgentRunOptions } from "../shared/run-events";
import type { StageStatus } from "../shared/flow";

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
  "system:checkUpdate": () => checkForUpdate(),

  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:verifyFigmaMcp": () => verifyFigmaMcp(),
  "env:openInstall": ((url: string) =>
    shell.openExternal(url).then(() => undefined)) as Handler,

  "workspace:pickFolder": ((req?: { create: boolean }) =>
    pickFolder(req ?? { create: false })) as Handler,
  "workspace:createFolder": (() => createFolder()) as Handler,
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path: string) => openFolder(path)) as Handler,
  "workspace:revealPath": ((req: { projectPath: string; relPath: string }) => {
    revealPath(req.projectPath, req.relPath);
    return undefined;
  }) as Handler,
  "workspace:refreshProject": ((path: string) => refreshProject(path)) as Handler,
  "workspace:createProject": ((req: { path: string; answers: SetupAnswers }) =>
    createProject(req.path, req.answers)) as Handler,

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
  "github:auth": (() => getGithubAuth()) as Handler,
  "github:switchAccount": ((r: { account: string }) => switchGithubAccount(r.account)) as Handler,
  "github:createRepo": ((r: { projectPath: string; name: string; visibility: RepoVisibility; description?: string }) =>
    createGithubRepo(r.projectPath, { name: r.name, visibility: r.visibility, description: r.description })) as Handler,
  "github:createPR": ((r: { projectPath: string; base?: string; title: string; body?: string }) =>
    createGithubPR(r.projectPath, { base: r.base, title: r.title, body: r.body })) as Handler,
  "git:import": ((r: { projectPath: string; url: string; branch?: string }) =>
    gitAdapter.importInto(r.projectPath, r.url, r.branch)) as Handler,
  "github:publish": ((r: { projectPath: string; branch: string; title: string; body?: string }) =>
    publishDesignSystem(r.projectPath, { branch: r.branch, title: r.title, body: r.body })) as Handler,
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
  "devserver:storybookIndex": ((url: string) => getStorybookIndex(url)) as Handler,
  "flow:setPublishTarget": ((req: { projectPath: string; repoUrl: string }) =>
    setPublishTarget(req.projectPath, req.repoUrl)) as Handler,
  "artifact:read": ((req: { projectPath: string; relPath: string }) =>
    readArtifact(req.projectPath, req.relPath)) as Handler,
  "artifact:findLatest": ((req: { projectPath: string; suffix: string }) =>
    findLatestArtifact(req.projectPath, req.suffix)) as Handler,
  "project:config": ((projectPath: string) => readProjectConfig(projectPath)) as Handler,
  "inspector:getTokens": ((projectPath: string) => getInspectorTokens(projectPath)) as Handler,
  "inspector:getComponents": ((projectPath: string) =>
    getInspectorComponents(projectPath)) as Handler,
  "inspector:setTokenValue": ((req: { projectPath: string; name: string; value: string }) =>
    setInspectorTokenValue(req.projectPath, req.name, req.value)) as Handler,
  "inspector:getVerification": ((projectPath: string) => getVerification(projectPath)) as Handler,
  "inspector:snapshotComponent": ((req: { projectPath: string; file: string }) =>
    snapshotComponent(req.projectPath, req.file)) as Handler,
  "inspector:snapshotTokenScope": ((projectPath: string) =>
    snapshotTokenScope(projectPath)) as Handler,
  "inspector:restoreFiles": ((req: { projectPath: string; files: FileSnapshot[] }) =>
    restoreFiles(req.projectPath, req.files).then(() => undefined)) as Handler,
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
