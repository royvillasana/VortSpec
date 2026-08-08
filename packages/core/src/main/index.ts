/**
 * Main-process entry point for the shared engine.
 *
 * Both app shells (the cockpit `apps/desktop` and the IDE `apps/ide`) import
 * from `@vortspec/core/main`: they create their own BrowserWindow and then
 * mount the identical IPC handler set from here. This is the mechanism that
 * keeps the SDD-DE procedure unified across both apps — the handlers ARE the
 * procedure, and they live once, here.
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
// The design-system relationship index (OpenSpec change: agentic-design-system, group 2). Exported
// so CI can gate on a stale index without booting Electron — see `scripts/check-index-freshness.mjs`.
export {
  buildRelationshipIndex,
  checkIndexFreshness,
  indexStaleness,
} from "./inspector/relationship-index";
