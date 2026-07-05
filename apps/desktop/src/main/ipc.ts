import { ipcMain, shell, app, type WebContents } from "electron";
import { ipcContract, type IpcChannel } from "../shared/ipc";
import { checkEnvironment, verifyClaudeLogin } from "./environment/env-manager";
import {
  listProjects,
  pickFolder,
  refreshProject,
  openFolder,
} from "./workspace/workspace-manager";
import { getToolkitStatus, installToolkit } from "./workspace/toolkit-manager";
import { startRun, cancelRun } from "./agent/run-manager";
import type { AgentRunOptions } from "../shared/run-events";

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
  "env:openInstall": ((url: string) =>
    shell.openExternal(url).then(() => undefined)) as Handler,

  "workspace:pickFolder": ((req?: { create: boolean }) =>
    pickFolder(req ?? { create: false })) as Handler,
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path: string) => openFolder(path)) as Handler,
  "workspace:refreshProject": ((path: string) => refreshProject(path)) as Handler,

  "toolkit:status": ((path: string) => getToolkitStatus(path)) as Handler,
  "toolkit:install": ((path: string) => installToolkit(path)) as Handler,

  "agent:startRun": ((opts: AgentRunOptions, sender: WebContents) =>
    startRun(sender, opts)) as Handler,
  "agent:cancelRun": ((runId: string) => {
    cancelRun(runId);
    return undefined;
  }) as Handler,
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
