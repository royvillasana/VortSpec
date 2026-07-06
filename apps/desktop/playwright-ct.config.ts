import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Playwright Component Testing for the renderer. Mounts the real React views in
 * a Chromium page with a stubbed `window.vortspec` (see playwright/index.tsx),
 * so Tokens / Components / Playground are exercised over fixture data without
 * Electron or the main process. Run with `pnpm test:ct`.
 */
export default defineConfig({
  testDir: "./tests/ct",
  testMatch: "**/*.ct.tsx",
  snapshotDir: "./tests/ct/__snapshots__",
  timeout: 20_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    trace: "on-first-retry",
    ctViteConfig: {
      resolve: { alias: { "@renderer": resolve("src/renderer/src") } },
      plugins: [tailwindcss()],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
