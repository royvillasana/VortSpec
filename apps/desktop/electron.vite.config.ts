import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `@vortspec/core` is an internal source-only workspace package (it exports
// `.ts` directly). It must be bundled by Vite, not externalized, so exclude it
// from externalizeDepsPlugin in the main and preload builds.
const CORE_INTERNAL = ["@vortspec/core"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: CORE_INTERNAL })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: CORE_INTERNAL })],
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
