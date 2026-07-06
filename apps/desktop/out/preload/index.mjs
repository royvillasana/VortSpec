import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
const runEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system-init"),
    sessionId: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.string()),
    mcpErrors: z.array(z.string())
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
  bypassPermissions: z.boolean().optional()
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
  checkEnvironment: () => invoke("env:check"),
  verifyLogin: () => invoke("env:verifyLogin"),
  openInstall: (url) => invoke("env:openInstall", url),
  pickFolder: (create = false) => invoke("workspace:pickFolder", { create }),
  createFolder: () => invoke("workspace:createFolder"),
  listProjects: () => invoke("workspace:listProjects"),
  openFolder: (path) => invoke("workspace:openFolder", path),
  refreshProject: (path) => invoke("workspace:refreshProject", path),
  createProject: (path, answers) => invoke("workspace:createProject", { path, answers }),
  toolkitStatus: (path) => invoke("toolkit:status", path),
  installToolkit: (path) => invoke("toolkit:install", path),
  startRun: (opts) => invoke("agent:startRun", opts),
  cancelRun: (runId) => invoke("agent:cancelRun", runId),
  onAgentEvent: (callback) => subscribe(AGENT_EVENT_CHANNEL, callback),
  onAgentRaw: (callback) => subscribe(AGENT_RAW_CHANNEL, callback),
  getFlow: (projectPath) => invoke("flow:get", projectPath),
  setStageStatus: (projectPath, stageId, status) => invoke("flow:setStageStatus", { projectPath, stageId, status }),
  approveStage: (projectPath, stageId) => invoke("flow:approveStage", { projectPath, stageId }),
  requestChanges: (projectPath, stageId, notes) => invoke("flow:requestChanges", { projectPath, stageId, notes }),
  saveIntake: (projectPath, content) => invoke("flow:saveIntake", { projectPath, content }),
  completeInput: (projectPath, stageId) => invoke("flow:completeInput", { projectPath, stageId }),
  setPublishTarget: (projectPath, repoUrl) => invoke("flow:setPublishTarget", { projectPath, repoUrl }),
  readArtifact: (projectPath, relPath) => invoke("artifact:read", { projectPath, relPath }),
  findLatestArtifact: (projectPath, suffix) => invoke("artifact:findLatest", { projectPath, suffix }),
  projectConfig: (projectPath) => invoke("project:config", projectPath),
  inspectorTokens: (projectPath) => invoke("inspector:getTokens", projectPath),
  inspectorComponents: (projectPath) => invoke("inspector:getComponents", projectPath),
  setTokenValue: (projectPath, name, value) => invoke("inspector:setTokenValue", { projectPath, name, value })
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
