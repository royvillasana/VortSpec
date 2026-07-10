/**
 * Shared preload bridge — installs `window.vortspec` from @vortspec/core/preload
 * so both apps speak the same API. The IDE adds one small extra: `window.
 * vortspecMenu`, a receive-only channel for native File/App menu commands.
 */
import "@vortspec/core/preload";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export interface MenuCommand {
  command: string;
  path?: string;
}

const menuBridge = {
  onCommand: (callback: (payload: MenuCommand) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: MenuCommand): void => callback(payload);
    ipcRenderer.on("vortspec:menu", listener);
    return () => ipcRenderer.removeListener("vortspec:menu", listener);
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vortspecMenu", menuBridge);
  } catch (error) {
    console.error(error);
  }
} else {
  (globalThis as unknown as { vortspecMenu: typeof menuBridge }).vortspecMenu = menuBridge;
}
