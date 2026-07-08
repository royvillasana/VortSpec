/**
 * Main-process entry point for the shared engine.
 *
 * Both app shells (the cockpit `apps/desktop` and the IDE `apps/ide`) import
 * from `@vortspec/core/main`: they create their own BrowserWindow and then
 * mount the identical IPC handler set from here. This is the mechanism that
 * keeps the SDD-DE procedure unified across both apps — the handlers ARE the
 * procedure, and they live once, here.
 */
export { registerIpc } from "./ipc";
export { stopAllDevServers } from "./workspace/dev-server";
export { stopAllWatchers } from "./workspace/fs-workspace";
export { killAllSessions as stopAllTerminals } from "./terminal/pty-manager";
export { fixGuiPath } from "./util/fix-path";
