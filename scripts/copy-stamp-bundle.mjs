#!/usr/bin/env node
/**
 * Shared packaging step (red-team RT-2). Build the source-stamp bundle and copy it into THIS app's
 * `resources/` so electron-builder's `extraResources` ships it. BOTH app shells call this in their
 * `predist`, so the stamp packaging can't drift between them — it drifted once (the desktop app
 * shipped with no stamp bundle, silently killing instant edits), which this + the postdist smoke
 * test together prevent. Run from an app dir (cwd = apps/<app>).
 */
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const appDir = process.cwd();
const root = resolve(appDir, "../..");
const bundle = resolve(root, "packages/core/resources/vortspec-stamp.mjs");

execSync("pnpm --filter @vortspec/core run build:stamp", { stdio: "inherit", cwd: root });
if (!existsSync(bundle)) {
  console.error(`✗ stamp bundle not produced at ${bundle}`);
  process.exit(1);
}
mkdirSync(resolve(appDir, "resources"), { recursive: true });
copyFileSync(bundle, resolve(appDir, "resources/vortspec-stamp.mjs"));
console.log("✓ vortspec-stamp.mjs copied into resources/ (shipped via extraResources)");
