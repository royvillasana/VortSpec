import { contextBridge, ipcRenderer } from "electron";
const api = {
  isElectron: () => ipcRenderer.invoke("vortspec:isElectron"),
  getVersion: () => ipcRenderer.invoke("vortspec:getVersion")
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
