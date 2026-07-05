import { contextBridge, ipcRenderer } from "electron";

/**
 * The safe bridge between the sandboxed renderer and the main process.
 * The renderer calls `window.vortspec.*`; every method routes through a typed,
 * (eventually zod-validated) IPC channel. No Node APIs are exposed directly.
 */
const api = {
  isElectron: (): Promise<boolean> => ipcRenderer.invoke("vortspec:isElectron"),
  getVersion: (): Promise<string> => ipcRenderer.invoke("vortspec:getVersion"),
};

export type VortSpecApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vortspec", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // Fallback when context isolation is disabled.
  (globalThis as unknown as { vortspec: VortSpecApi }).vortspec = api;
}
