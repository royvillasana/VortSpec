import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes a safe API to the renderer process.
 * The web app can call `window.vortspec.*` to interact with the Electron main process.
 */
contextBridge.exposeInMainWorld("vortspec", {
  // Check if running inside Electron
  isElectron: true,

  // Run a Claude Code CLI command and get the result
  runClaude: (prompt: string) => ipcRenderer.invoke("electron:runClaude", prompt),

  // Storybook controls
  startStorybook: () => ipcRenderer.invoke("electron:startStorybook"),
  stopStorybook: () => ipcRenderer.invoke("electron:stopStorybook"),

  // Process status
  getProcessStatus: () => ipcRenderer.invoke("electron:getProcessStatus"),

  // Terminal output subscription
  onTerminalData: (callback: (data: string) => void) => {
    ipcRenderer.on("terminal:data", (_event, data) => callback(data));
  },

  // Subscribe to terminal
  subscribeTerminal: () => {
    ipcRenderer.send("terminal:subscribe");
  },
});
