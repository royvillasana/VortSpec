import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcRequest, IpcResponse } from "../shared/ipc";

/**
 * The safe bridge between the sandboxed renderer and the main process.
 * The renderer calls `window.vortspec.*`; each method routes through a typed
 * IPC channel that the main process validates with zod. No Node APIs are
 * exposed directly. (Type-only imports keep zod out of the preload bundle.)
 */
function invoke<C extends IpcChannel>(
  channel: C,
  request?: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<C>>;
}

const api = {
  isElectron: () => invoke("system:isElectron"),
  getVersion: () => invoke("system:getVersion"),

  checkEnvironment: () => invoke("env:check"),
  verifyLogin: () => invoke("env:verifyLogin"),
  openInstall: (url: string) => invoke("env:openInstall", url),

  pickFolder: (create = false) => invoke("workspace:pickFolder", { create }),
  listProjects: () => invoke("workspace:listProjects"),
  openFolder: (path: string) => invoke("workspace:openFolder", path),
  refreshProject: (path: string) => invoke("workspace:refreshProject", path),

  toolkitStatus: (path: string) => invoke("toolkit:status", path),
  installToolkit: (path: string) => invoke("toolkit:install", path),
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
