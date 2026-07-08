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
    plugins: [externalizeDepsPlugin({ exclude: INTERNAL })],
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
