import { contextBridge, ipcRenderer } from "electron";
function invoke(channel, request) {
  return ipcRenderer.invoke(channel, request);
}
const api = {
  isElectron: () => invoke("system:isElectron"),
  getVersion: () => invoke("system:getVersion"),
  checkEnvironment: () => invoke("env:check"),
  verifyLogin: () => invoke("env:verifyLogin"),
  openInstall: (url) => invoke("env:openInstall", url),
  pickFolder: (create = false) => invoke("workspace:pickFolder", { create }),
  listProjects: () => invoke("workspace:listProjects"),
  openFolder: (path) => invoke("workspace:openFolder", path),
  refreshProject: (path) => invoke("workspace:refreshProject", path),
  toolkitStatus: (path) => invoke("toolkit:status", path),
  installToolkit: (path) => invoke("toolkit:install", path)
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
