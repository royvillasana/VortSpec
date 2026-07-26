#!/usr/bin/env node
/**
 * Packaging smoke test (red-team RT-2). After electron-builder produces the .app, assert it actually
 * carries the runtime pieces the instant-edit feature needs — so a packaging regression fails the
 * BUILD instead of shipping to users. Both of these were shipped broken before this existed:
 *   • the desktop app had no `vortspec-stamp.mjs` in Resources → instant edits were silently dead;
 *   • the IDE's node_modules whitelist missed ts-morph's transitive deps → it crashed on `minimatch`.
 *
 * Checks, per built .app:
 *   1. `Contents/Resources/vortspec-stamp.mjs` exists (the dev-server stamp injection needs it).
 *   2. `ts-morph` LOADS and parses from the packaged app.asar (proves the full transitive closure
 *      ships — require() throws if any dep like minimatch is absent).
 *
 * Usage: node scripts/verify-packaged-app.mjs <release-dir>   (run from the app dir; release-dir
 * is resolved against cwd). Exits non-zero on any failure.
 */
import { existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const requireFrom = createRequire(import.meta.url);
const { extractAll } = requireFrom("@electron/asar");

const releaseDir = resolve(process.cwd(), process.argv[2] ?? "release");
if (!existsSync(releaseDir)) {
  console.error(`✗ smoke test: release dir not found: ${releaseDir}`);
  process.exit(2);
}

/** Every built .app under release/mac* (arm64, x64, universal each land in their own dir). */
function findApps(dir) {
  const apps = [];
  for (const sub of readdirSync(dir)) {
    if (!sub.startsWith("mac")) continue;
    const macDir = join(dir, sub);
    for (const f of readdirSync(macDir)) if (f.endsWith(".app")) apps.push(join(macDir, f));
  }
  return apps;
}

const apps = findApps(releaseDir);
if (apps.length === 0) {
  console.error(`✗ smoke test: no .app found under ${releaseDir}`);
  process.exit(1);
}

let failed = false;
for (const app of apps) {
  console.log(`▸ smoke-testing ${app.replace(process.cwd() + "/", "")}`);
  const problems = [];

  // 1. Stamp bundle in Resources.
  if (existsSync(join(app, "Contents/Resources/vortspec-stamp.mjs"))) console.log("  ✓ vortspec-stamp.mjs in Resources");
  else problems.push("vortspec-stamp.mjs MISSING from Resources — instant Playground edits would be dead");

  // 2. ts-morph loads from the packaged asar (full transitive closure present).
  const asar = join(app, "Contents/Resources/app.asar");
  const tmp = mkdtempSync(join(tmpdir(), "vs-smoke-"));
  try {
    extractAll(asar, join(tmp, "app"));
    const req = createRequire(join(tmp, "app", "package.json"));
    const { Project } = req("ts-morph");
    new Project({ useInMemoryFileSystem: true }).createSourceFile("t.tsx", "const x = <div className='c'/>;");
    console.log("  ✓ ts-morph loads + parses from app.asar");
  } catch (e) {
    problems.push(`ts-morph failed to load from app.asar (a transitive dep is likely unshipped): ${String(e.message).split("\n")[0]}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length) {
    failed = true;
    for (const p of problems) console.error(`  ✗ ${p}`);
  }
}

if (failed) {
  console.error("\n✗ PACKAGE SMOKE TEST FAILED — do not release this build.");
  process.exit(1);
}
console.log("\n✓ package smoke test passed — the app ships the instant-edit runtime.");
