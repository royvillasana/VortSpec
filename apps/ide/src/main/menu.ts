import {
  app,
  Menu,
  BrowserWindow,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { listProjects } from "@vortspec/core/main";

/**
 * The IDE's native application menu.
 *
 * The menu is the only place the main process reaches into the renderer for
 * navigation: window/quit/edit are handled natively, but every project action
 * (New, Open Folder, Clone, Walk-through, Recent, Close Project, Settings) is
 * sent to the focused window as a `vortspec:menu` command and performed there,
 * so the renderer stays the single source of truth for what's open. The menu is
 * rebuilt on focus so "Open Recent Projects" reflects the current store.
 */

/** Deliver a menu command to the focused window (or the first, if none focused). */
function send(command: string, path?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send("vortspec:menu", { command, path });
}

function template(
  recent: { name: string; path: string }[],
  opts: { createWindow: () => void },
): MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";

  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? recent.slice(0, 10).map((p) => ({
        label: p.name,
        sublabel: p.path,
        toolTip: p.path,
        click: () => send("openRecent", p.path),
      }))
    : [{ label: "No Recent Projects", enabled: false }];

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      // "New" opens a fresh file in the open workspace (VS Code's File > New).
      { label: "New", accelerator: "CmdOrCtrl+N", click: () => send("newFile") },
      { type: "separator" },
      { label: "Create New Project", click: () => send("createProject") },
      { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: () => send("openFolder") },
      { label: "Clone Repository…", click: () => send("cloneRepo") },
      { label: "Open Walkthrough Project", click: () => send("openWalkthrough") },
      { label: "Open Recent Projects", submenu: recentItems },
      { type: "separator" },
      { label: "Close Project", accelerator: "CmdOrCtrl+Shift+W", click: () => send("closeProject") },
      { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", click: () => opts.createWindow() },
      { type: "separator" },
      isMac ? { role: "close", label: "Close" } : { role: "quit", label: "Close" },
    ],
  };

  const appMenu: MenuItemConstructorOptions = {
    // On macOS the first submenu's label is forced to the app name (app.setName
    // makes it "VortSpec IDE"); the label here is a fallback for other platforms.
    label: "VortSpec IDE",
    submenu: [
      { role: "about", label: "About VortSpec IDE" },
      { type: "separator" },
      { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => send("settings") },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide", label: "Hide VortSpec IDE" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit", label: "Quit VortSpec IDE" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    role: "window",
    submenu: isMac
      ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
      : [{ role: "minimize" }, { role: "close" }],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    role: "help",
    submenu: [
      {
        label: "VortSpec on the Web",
        click: () => void shell.openExternal("https://vortspec.com"),
      },
    ],
  };

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];
}

/**
 * Build the application menu and keep its "Open Recent Projects" submenu fresh
 * by rebuilding whenever a window gains focus (the recent store is a small file).
 */
export function installMenu(opts: { createWindow: () => void }): void {
  async function rebuild(): Promise<void> {
    const recent = await listProjects().catch(() => []);
    Menu.setApplicationMenu(Menu.buildFromTemplate(template(recent, opts)));
  }
  void rebuild();
  app.on("browser-window-focus", () => void rebuild());
}
