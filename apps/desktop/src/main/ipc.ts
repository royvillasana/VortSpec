import { ipcMain, shell, app } from "electron";
import { ipcContract, type IpcChannel } from "../shared/ipc";
import { checkEnvironment, verifyClaudeLogin } from "./environment/env-manager";
import {
  listProjects,
  pickFolder,
  refreshProject,
  openFolder,
} from "./workspace/workspace-manager";
import { getToolkitStatus, installToolkit } from "./workspace/toolkit-manager";

/**
 * The single place IPC handlers are registered. Every request and response is
 * validated against the zod contract at the boundary, so a bug on either side
 * surfaces as a clear validation error rather than a silent bad payload.
 */

// Handlers are keyed by channel; request/response typing is enforced by the
// contract at the boundary, so the map is intentionally loosely typed here.
const handlers: Record<IpcChannel, (req: never) => unknown> = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),

  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:openInstall": ((url: string) => shell.openExternal(url).then(() => undefined)) as never,

  "workspace:pickFolder": ((req?: { create: boolean }) =>
    pickFolder(req ?? { create: false })) as never,
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path: string) => openFolder(path)) as never,
  "workspace:refreshProject": ((path: string) => refreshProject(path)) as never,

  "toolkit:status": ((path: string) => getToolkitStatus(path)) as never,
  "toolkit:install": ((path: string) => installToolkit(path)) as never,
};

export function registerIpc(): void {
  (Object.keys(ipcContract) as IpcChannel[]).forEach((channel) => {
    const contract = ipcContract[channel];
    ipcMain.handle(channel, async (_event, rawRequest: unknown) => {
      const request = contract.request.parse(rawRequest);
      const result = await handlers[channel](request as never);
      return contract.response.parse(result);
    });
  });
}
