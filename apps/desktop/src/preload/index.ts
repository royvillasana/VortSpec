/**
 * The preload bridge is shared by every VortSpec app shell so `window.vortspec`
 * is identical across them. The implementation lives in @vortspec/core/preload;
 * importing it installs the contextBridge (side effect).
 */
import "@vortspec/core/preload";
