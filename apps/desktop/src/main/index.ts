import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpc } from "./ipc";

/**
 * VortSpec desktop — main process (electron-vite).
 *
 * This is the cockpit shell. It does NOT wrap a web app or spawn any
 * background services (the v1 Next.js/Storybook/Inngest orchestration was
 * removed in the desktop pivot). The environment manager, workspace manager,
 * AgentAdapter and PTY service are introduced in later milestones (D0.2+, D1).
 */

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "VortSpec",
    backgroundColor: "#0B0C0E",
    titleBarStyle: "hiddenInset",
    icon: join(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    // Surface console errors during development.
    if (is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // Open external links in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  // electron-vite serves the renderer from a dev server in development and
  // from the bundled index.html in production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.vortspec.desktop");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
