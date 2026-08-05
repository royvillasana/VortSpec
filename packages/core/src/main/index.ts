/**
 * Main-process entry point for the shared engine.
 *
 * The app shell (`apps/ide`) imports from `@vortspec/core/main`: it creates its
 * BrowserWindow and then mounts the IPC handler set from here. The handlers ARE
 * the SDD-DE procedure, and they live once, in this package.
 *
 * The boundary predates having one shell and survives it on its own merits: it
 * keeps the engine headless and unit-testable without an Electron renderer,
 * which the unit suite depends on. It is not here because a second app once
 * consumed it.
 */
export { registerIpc, setDrawWindowOpener } from "./ipc";
export { stopAllDevServers } from "./workspace/dev-server";
export { stopAllWatchers } from "./workspace/fs-workspace";
export { killAllSessions as stopAllTerminals } from "./terminal/pty-manager";
export { stopIdeMcp } from "./ide-mcp/host";
export { fixGuiPath } from "./util/fix-path";
export { ensureManagedRuntime } from "./environment/runtime-manager";
// Recent-projects list — the IDE reads it to populate the native File menu's
// "Open Recent Projects" submenu (same store the welcome screen uses).
export { listProjects } from "./workspace/workspace-manager";
