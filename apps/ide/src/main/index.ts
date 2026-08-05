import { app, shell, BrowserWindow, session } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "node:url";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpc, setDrawWindowOpener, stopAllDevServers, stopAllWatchers, stopAllTerminals, stopIdeMcp, fixGuiPath, ensureManagedRuntime } from "@vortspec/core/main";
import { installMenu } from "./menu";

/**
 * `__dirname`, derived here rather than relied upon.
 *
 * This app is `"type": "module"`, so the built main process is ESM and
 * `__dirname` does not exist. It only ever worked because the bundler injected
 * `const __dirname = import.meta.dirname` for us — and in v0.1.35 that shim
 * moved out of module scope into a nested chunk, so every use below became a
 * `ReferenceError`. The packaged app started, `createWindow` threw, and no
 * window ever appeared: a release that could not launch, from a commit whose
 * main-process source was byte-identical to the release before it.
 *
 * Deriving it from `import.meta.url` costs one line and cannot be moved by a
 * bundler. Do not go back to relying on the injected shim.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

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

// The Draw tool opens as its OWN window (docs/draw-to-component-graph.md) — it never touches the
// Playground. One instance per app; reopening focuses it (and re-points it at the requested project).
let drawWindow: BrowserWindow | null = null;
function openDrawWindow(projectPath: string): void {
  const search = `window=draw&project=${encodeURIComponent(projectPath)}`;
  if (drawWindow && !drawWindow.isDestroyed()) {
    drawWindow.focus();
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      void drawWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}?${search}`);
    } else {
      void drawWindow.loadFile(join(__dirname, "../renderer/index.html"), { search });
    }
    return;
  }
  drawWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "VortSpec — Draw",
    backgroundColor: "#0B0C0E",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  drawWindow.on("ready-to-show", () => drawWindow?.show());
  drawWindow.on("closed", () => {
    drawWindow = null;
  });
  drawWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void drawWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}?${search}`);
  } else {
    void drawWindow.loadFile(join(__dirname, "../renderer/index.html"), { search });
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

  // Let the Playground/Storybook <webview> embed pages that would otherwise refuse to be framed —
  // a client's hosted Storybook (Vercel/Chromatic/…) commonly sends `X-Frame-Options: DENY` or a CSP
  // `frame-ancestors`, which blocks it (ERR_BLOCKED_BY_CSP). Strip those two framing guards on responses
  // so the embedded Storybook renders. Scoped to header rewriting only; nothing else changes.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-frame-options") {
        delete headers[key];
      } else if (lower === "content-security-policy") {
        // Drop only the frame-ancestors directive; keep the rest of the policy intact.
        headers[key] = headers[key]
          .map((v) => v.replace(/frame-ancestors[^;]*;?/gi, "").trim())
          .filter((v) => v.length > 0);
        if (headers[key].length === 0) delete headers[key];
      }
    }
    callback({ responseHeaders: headers });
  });

  // Recover the user's real shell PATH before anything spawns (GUI launches get
  // a minimal PATH), so Claude Code and the CLIs resolve.
  await fixGuiPath();
  // Ensure the VortSpec-managed runtime (bundled Node + ~/.vortspec/bin) is on PATH,
  // so managed node/npm/claude resolve before anything spawns (change: automate-base-tool-install).
  await ensureManagedRuntime();

  registerIpc();
  setDrawWindowOpener(openDrawWindow);
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
