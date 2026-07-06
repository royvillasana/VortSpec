import { ipcMain, shell, app, type WebContents } from "electron";
import { ipcContract, type IpcChannel } from "../shared/ipc";
import { checkEnvironment, verifyClaudeLogin, verifyFigmaMcp } from "./environment/env-manager";
import {
  listProjects,
  pickFolder,
  createFolder,
  refreshProject,
  openFolder,
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
import { startRun, cancelRun } from "./agent/run-manager";
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
import {
  startDevServer,
  stopDevServer,
  getDevServerStatus,
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
  "devserver:start": ((projectPath: string, sender: WebContents) =>
    startDevServer(sender, projectPath)) as Handler,
  "devserver:stop": ((projectPath: string) => {
    stopDevServer(projectPath);
    return undefined;
  }) as Handler,
  "devserver:status": ((projectPath: string) => getDevServerStatus(projectPath)) as Handler,
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
