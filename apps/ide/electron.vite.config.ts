import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `@vortspec/core` and `@vortspec/ui` are internal source-only workspace
// packages (they export `.ts`/`.tsx` directly), so bundle them rather than
// externalize them in the main and preload builds.
const INTERNAL = ["@vortspec/core", "@vortspec/ui"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: INTERNAL })],
  },
  preload: {
    // Bundle `zod` (not just the internal packages) so the guest <webview>
    // preload is self-contained — a file:// ESM preload can't reliably resolve
    // bare deps from node_modules (esp. packaged/asar). `electron` stays external.
    plugins: [externalizeDepsPlugin({ exclude: [...INTERNAL, "zod"] })],
    build: {
      rollupOptions: {
        input: {
          // The main window preload (window.vortspec bridge).
          index: resolve("src/preload/index.ts"),
          // The Run-Canvas <webview> guest preload (inspector bridge) — a
          // separate, isolated bundle injected into the project's dev-server
          // page. See the run-canvas-visual-editor change (design D1/D4).
          guest: resolve("src/preload/guest.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
