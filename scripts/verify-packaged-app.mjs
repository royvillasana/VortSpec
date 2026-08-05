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
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

/** How long to wait for a window. Cold first launch on a slow disk is the worst case. */
const LAUNCH_TIMEOUT_MS = 45_000;

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

  // 3. The app actually opens a window.
  //
  // This check exists because v0.1.35 shipped and could not start. Checks 1 and
  // 2 passed on it: the runtime files were all present and loadable. What was
  // broken was the main process itself — `__dirname` is undefined in an ESM
  // build, the bundler's shim had moved out of scope, and `createWindow` threw
  // before any window existed. The app launched, showed nothing, and the smoke
  // test called it good. Asserting the FILES are shippable is not the same as
  // asserting the APP RUNS.
  //
  // Launch the real binary headless-ish and require a renderer process to
  // appear: no renderer means no web contents means no window.
  const bin = join(app, "Contents/MacOS", readdirSync(join(app, "Contents/MacOS"))[0]);
  const proc = spawn(bin, [], {
    stdio: ["ignore", "pipe", "pipe"],
    // A throwaway profile so a smoke test never touches the developer's real
    // recent-projects list or profile.
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  });
  let output = "";
  proc.stdout.on("data", (d) => (output += d));
  proc.stderr.on("data", (d) => (output += d));

  const launched = await new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      // `ps` is enough: a live --type=renderer child of this .app proves a window.
      const ps = spawnSync("ps", ["-eo", "command"], { encoding: "utf8" }).stdout ?? "";
      const appPath = app.replace(/\/+$/, "");
      const hasRenderer = ps
        .split("\n")
        .some((line) => line.includes(appPath) && line.includes("--type=renderer"));
      if (hasRenderer) {
        clearInterval(poll);
        resolve(true);
      } else if (Date.now() - started > LAUNCH_TIMEOUT_MS || proc.exitCode !== null) {
        clearInterval(poll);
        resolve(false);
      }
    }, 500);
  });

  proc.kill("SIGKILL");
  spawnSync("pkill", ["-f", app]);

  if (launched) {
    console.log("  ✓ the app launches and opens a window");
  } else {
    const first = output.split("\n").find((l) => /Error|error:/.test(l)) ?? "(no error output)";
    problems.push(`the app did NOT open a window within ${LAUNCH_TIMEOUT_MS / 1000}s — ${first.trim()}`);
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
console.log("\n✓ package smoke test passed — the app runs, opens a window, and ships the instant-edit runtime.");
