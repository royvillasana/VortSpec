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
    // Bundle `zod` and `yjs` (not just the internal packages) so the guest <webview>
    // preload is self-contained — a file:// ESM preload can't reliably resolve
    // bare deps from node_modules (esp. packaged/asar). `electron` stays external.
    //
    // `yjs` arrived with the live document (live-playground) and MUST be on this list: left
    // external it builds cleanly and works in dev, then fails to resolve inside the packaged
    // app — and because the guest preload is what instruments the canvas, that failure takes
    // the whole inspector down with it, not just live editing.
    plugins: [externalizeDepsPlugin({ exclude: [...INTERNAL, "zod", "yjs"] })],
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
    // The IDE's own dev renderer must NOT sit on Vite's default 5173 — the user's project apps default
    // to 5173 too, and the collision makes the Playground preview a running project a black webview
    // (it ends up pointing at the IDE's renderer instead of the app). 5273 keeps them clear. The main
    // process loads from ELECTRON_RENDERER_URL, which electron-vite derives from this port.
    server: { port: 5273, strictPort: true },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
