import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpc, stopAllDevServers, stopAllWatchers, fixGuiPath } from "@vortspec/core/main";

/**
 * VortSpec IDE — main process (electron-vite).
 *
 * The IDE is the second app shell. It creates its own window with the VS
 * Code–style layout, then mounts the SAME IPC handler set as the cockpit from
 * @vortspec/core/main. It re-implements no engine logic: launching runs,
 * reading tokens/components, and Git/provider actions all go through core.
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: "VortSpec IDE",
    backgroundColor: "#0B0C0E",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.vortspec.ide");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Recover the user's real shell PATH before anything spawns (GUI launches get
  // a minimal PATH), so Claude Code and the CLIs resolve.
  await fixGuiPath();

  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopAllDevServers();
  stopAllWatchers();
});

app.on("window-all-closed", () => {
  stopAllDevServers();
  stopAllWatchers();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
