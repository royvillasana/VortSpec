import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { ProcessManager } from "./process-manager";
import { TerminalManager } from "./terminal-manager";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const processManager = new ProcessManager();
const terminalManager = new TerminalManager();

const isDev = !app.isPackaged;
const NEXT_PORT = parseInt(process.env.VORTSPEC_PORT ?? "3000", 10);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "VortSpec",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0B0C0E",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the wizard as the landing page
  mainWindow.loadURL(`http://localhost:${NEXT_PORT}/wizard`);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, "..", "build", "tray-icon.png");
  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip("VortSpec");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show VortSpec", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "Services",
      submenu: [
        {
          label: "Start Storybook",
          click: () => processManager.startStorybook(),
        },
        {
          label: "Start Inngest",
          click: () => processManager.startInngest(),
        },
        { type: "separator" },
        {
          label: "Stop All",
          click: () => processManager.stopAll(),
        },
      ],
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── IPC Handlers ──

ipcMain.handle("electron:isElectron", () => true);

ipcMain.handle("electron:runClaude", async (_event, prompt: string) => {
  return terminalManager.runClaude(prompt);
});

ipcMain.handle("electron:startStorybook", async () => {
  return processManager.startStorybook();
});

ipcMain.handle("electron:stopStorybook", async () => {
  return processManager.stopStorybook();
});

ipcMain.handle("electron:getProcessStatus", () => {
  return processManager.getStatus();
});

// Stream terminal output to renderer
ipcMain.on("terminal:subscribe", (event) => {
  terminalManager.on("output", (data: string) => {
    event.sender.send("terminal:data", data);
  });
});

// ── App Lifecycle ──

app.whenReady().then(async () => {
  console.log("[vortspec] Starting Next.js...");

  if (isDev) {
    processManager.startNextDev();
  } else {
    // Production: run `next start` from the bundled web app
    processManager.startNextProd();
  }

  await waitForPort(NEXT_PORT, 30000);
  console.log("[vortspec] Next.js ready on port", NEXT_PORT);

  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  processManager.stopAll();
});

// ── Helpers ──

async function waitForPort(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok || response.status === 404) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn(`[vortspec] Timeout waiting for port ${port}`);
}
