import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  StageStatus,
  SetupAnswers,
  FileSnapshot,
} from "../shared/ipc";
import {
  AGENT_EVENT_CHANNEL,
  AGENT_RAW_CHANNEL,
  type AgentEventEnvelope,
  type AgentRawEnvelope,
  type AgentRunOptions,
} from "../shared/run-events";
import { DEV_SERVER_UPDATE_CHANNEL, type DevServerUpdate } from "../shared/dev-server";

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

const api = {
  isElectron: () => invoke("system:isElectron"),
  getVersion: () => invoke("system:getVersion"),

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
  createProject: (path: string, answers: SetupAnswers) =>
    invoke("workspace:createProject", { path, answers }),

  toolkitStatus: (path: string) => invoke("toolkit:status", path),
  installToolkit: (path: string) => invoke("toolkit:install", path),

  startRun: (opts: AgentRunOptions) => invoke("agent:startRun", opts),
  cancelRun: (runId: string) => invoke("agent:cancelRun", runId),
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
  startDevServer: (projectPath: string) => invoke("devserver:start", projectPath),
  stopDevServer: (projectPath: string) => invoke("devserver:stop", projectPath),
  devServerStatus: (projectPath: string) => invoke("devserver:status", projectPath),
  previewInfo: (projectPath: string) => invoke("devserver:previewInfo", projectPath),
  storybookIndex: (url: string) => invoke("devserver:storybookIndex", url),
  onDevServerUpdate: (callback: (payload: DevServerUpdate) => void) =>
    subscribe(DEV_SERVER_UPDATE_CHANNEL, callback),
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
};

export type VortSpecApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vortspec", api);
  } catch (error) {
    console.error(error);
  }
} else {
  (globalThis as unknown as { vortspec: VortSpecApi }).vortspec = api;
}
