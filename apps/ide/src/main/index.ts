import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpc, stopAllDevServers, stopAllWatchers, stopAllTerminals, stopIdeMcp, fixGuiPath } from "@vortspec/core/main";
import { installMenu } from "./menu";

// Show "VortSpec IDE" in the menu bar / About / Quit instead of Electron's
// default. Renaming the app moves userData (appData/<name>), which would strand
// a user's recent-projects list and profile. Pin userData to the pre-rename
// folder — productName when packaged, the package name in dev — so nothing is
// lost (both resolve to "VortSpec IDE" / "@vortspec/ide" as before).
app.setPath(
  "userData",
  join(app.getPath("appData"), app.isPackaged ? "VortSpec IDE" : "@vortspec/ide"),
);
app.setName("VortSpec IDE");

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
      // Enable <webview> so the Run Canvas can embed the project's dev server and
      // instrument it via a guest preload (the inspector bridge) — an <iframe>
      // to a cross-origin localhost port cannot expose its DOM. See the
      // run-canvas-visual-editor change (design D1).
      webviewTag: true,
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

  // In dev the Dock shows Electron's icon (packaged builds use the bundled
  // .icns). Point the Dock at the app icon so the running dev app is branded.
  if (is.dev && process.platform === "darwin") {
    try {
      app.dock?.setIcon(join(app.getAppPath(), "build", "icon.png"));
    } catch {
      // Non-fatal — the Dock just keeps the default icon.
    }
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Recover the user's real shell PATH before anything spawns (GUI launches get
  // a minimal PATH), so Claude Code and the CLIs resolve.
  await fixGuiPath();

  registerIpc();
  installMenu({ createWindow });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopAllDevServers();
  stopAllWatchers();
  stopAllTerminals();
  stopIdeMcp();
});

app.on("window-all-closed", () => {
  stopAllDevServers();
  stopAllWatchers();
  stopAllTerminals();
  stopIdeMcp();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
