import { spawn, type ChildProcess } from "node:child_process";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WebContents } from "electron";
import { DEV_SERVER_UPDATE_CHANNEL, type DevServerStatus, type ServerKind } from "@vortspec/core/dev-server";
import { isViteProject, viteStampInjection } from "../canvas/dev-stamp";

/**
 * Manages one long-running dev/storybook server per project so the Dev Preview
 * can embed a live URL. Non-interactive, so a plain arg-array child process
 * (cwd confined to the project folder) is enough — no PTY. The local URL is
 * parsed from the server's own output.
 */

interface Server {
  child: ChildProcess | null;
  status: DevServerStatus;
  sender: WebContents;
}
// Keyed by `${projectPath}::${kind}` so the Storybook Playground and the live app
// runtime can run at the same time for one project.
const servers = new Map<string, Server>();
const keyOf = (projectPath: string, kind: ServerKind): string => `${projectPath}::${kind}`;

async function readScripts(projectPath: string): Promise<Record<string, unknown>> {
  const pkg = await readFile(join(projectPath, "package.json"), "utf8").catch(() => null);
  if (!pkg) return {};
  try {
    return (JSON.parse(pkg).scripts as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/**
 * Pick the script to run for a surface. The Storybook Playground prefers
 * `storybook` → dev → start → preview; the live app runtime deliberately skips
 * `storybook` and runs the project's OWN app (dev → start → preview).
 */
async function detectScript(projectPath: string, kind: ServerKind): Promise<string | null> {
  const scripts = await readScripts(projectPath);
  const order = kind === "app" ? ["dev", "start", "preview"] : ["storybook", "dev", "start", "preview"];
  for (const name of order) {
    if (typeof scripts[name] === "string") return name;
  }
  return null;
}

/** Whether the project already has a Storybook setup (a `storybook` script + config dir). */
export async function getPreviewInfo(
  projectPath: string,
): Promise<{ hasStorybook: boolean; script: string | null }> {
  const scripts = await readScripts(projectPath);
  const hasStorybookScript = typeof scripts["storybook"] === "string";
  const hasConfig =
    existsSync(join(projectPath, ".storybook")) || existsSync(join(projectPath, ".storybook/main.ts"));
  return {
    hasStorybook: hasStorybookScript && hasConfig,
    script: await detectScript(projectPath, "storybook"),
  };
}

function detectPackageManager(projectPath: string): string {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}

/** First localhost/loopback http(s) URL in a chunk of server output. */
export function urlFrom(text: string): string | null {
  // Dev servers colorize output — vite/picocolors emit ANSI codes even under
  // CI/FORCE_COLOR, and they land INSIDE the URL (http://localhost:‹ESC›5173‹ESC›/),
  // which would break `:\d+`. Strip escape sequences before matching.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
  const clean = text.replace(ansi, "");
  const m = clean.match(
    /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s)'"]*)/i,
  );
  if (!m) return null;
  return m[1].replace("0.0.0.0", "localhost").replace(/\/+$/, "") + "/";
}

function push(server: Server, projectPath: string, kind: ServerKind): void {
  if (!server.sender.isDestroyed()) {
    server.sender.send(DEV_SERVER_UPDATE_CHANNEL, { projectPath, kind, status: server.status });
  }
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

/** An actionable error message: a prefix plus the last few (ANSI-stripped) output lines. */
function tailMessage(prefix: string, raw: string): string {
  const lines = raw
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const tail = lines.slice(-8).join("\n");
  return tail ? `${prefix}:\n${tail}` : `${prefix}.`;
}

/**
 * The error message for a dev-server step that exited non-zero. A `127` /
 * "command not found" from the Storybook script means the `storybook` CLI isn't
 * installed in the project — surface that as an actionable fix-it instead of a
 * raw `sh: storybook: command not found` dump.
 */
export function serverExitMessage(
  kind: ServerKind,
  pm: string,
  script: string,
  code: number,
  tail: string,
): string {
  const noun = kind === "app" ? "app" : "Storybook";
  const notInstalled = code === 127 || /command not found/i.test(tail);
  if (notInstalled && kind === "storybook") {
    return (
      `Storybook isn't installed in this project yet, so \`${pm} run ${script}\` can't start it. ` +
      "Run “Build & verify the rest” (it runs the /storybook setup), or set it up in a terminal with " +
      "`npx storybook@latest init`."
    );
  }
  return tailMessage(`The ${noun} dev server (\`${pm} run ${script}\`) exited with code ${code}`, tail);
}

// NO_COLOR asks tools (picocolors/vite) not to emit ANSI; urlFrom still strips
// any that slip through. CI keeps installs/servers non-interactive.
//
// Built fresh per spawn (NOT a module-level constant): `fixGuiPath()` repairs
// `process.env.PATH` in `whenReady`, which runs AFTER this module is imported.
// Snapshotting at import time would freeze the minimal GUI PATH a Finder launch
// starts with, so `npm`/`pnpm` (often under nvm) wouldn't be found even after
// the PATH was fixed. Reading process.env at spawn time picks up the repair.
function stepEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", BROWSER: "none", CI: "1" };
}

/**
 * Spawn one step — a dependency install or the dev script — streaming its
 * output. For the server step we watch for the localhost URL and flip to
 * "running"; `onDone` fires on exit/error with the code + a tail of output so
 * failures are diagnosable instead of a bare "exited with code 1".
 */
function runStep(
  server: Server,
  projectPath: string,
  kind: ServerKind,
  script: string,
  cmd: string,
  args: string[],
  isServer: boolean,
  onDone: (r: { code: number | null; signal: boolean; tail: string; url: string | null }) => void,
): void {
  let tail = "";
  let url: string | null = null;
  let child: ChildProcess;
  try {
    child = spawn(cmd, args, { cwd: projectPath, shell: false, env: stepEnv() });
  } catch (err) {
    onDone({ code: -1, signal: false, tail: err instanceof Error ? err.message : String(err), url: null });
    return;
  }
  server.child = child;

  const onData = (buf: Buffer): void => {
    const s = buf.toString();
    tail = (tail + s).slice(-8000);
    if (isServer && !url && server.status.state === "starting") {
      const found = urlFrom(s);
      if (found) {
        url = found;
        server.status = { state: "running", url, script, message: null };
        push(server, projectPath, kind);
      }
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (err: Error) => {
    const enoent = (err as NodeJS.ErrnoException).code === "ENOENT";
    onDone({ code: -1, signal: false, tail: enoent ? `${cmd} is not installed or not on your PATH.` : err.message, url });
  });
  child.on("exit", (code, sig) => onDone({ code, signal: sig !== null, tail, url }));
}

/**
 * Locate the shipped source-stamp bundle (`vortspec-stamp.mjs`) — the dev-only Vite plugin
 * that stamps `data-source` anchors for instant Playground edits (change:
 * instant-playground-edits). Packaged app → `resources/`; dev → the built resource in
 * `@vortspec/core`; env override for tests. Returns null when it isn't built (feature off).
 */
function resolveStampBundle(): string | null {
  // `@vortspec/core` is BUNDLED into the app's main process (electron-vite), so `import.meta.url`
  // at runtime is `apps/<app>/out/main/index.js` — NOT this source file. Resolve relative to that.
  const rel = (p: string): string | null => {
    try {
      return fileURLToPath(new URL(p, import.meta.url));
    } catch {
      return null;
    }
  };
  const candidates = [
    process.env.VORTSPEC_STAMP_BUNDLE,
    // Packaged app: extraResources drops the bundle beside the app resources.
    process.resourcesPath ? join(process.resourcesPath, "vortspec-stamp.mjs") : null,
    // App-local copy (predist copies it here for packaged builds; also present in dev after a
    // `dist`/recipe run). From `apps/<app>/out/main/index.js` → `apps/<app>/resources/…`.
    rel("../../resources/vortspec-stamp.mjs"),
    // Monorepo dev: the `build:stamp` output in @vortspec/core, from `apps/<app>/out/main/`.
    rel("../../../../packages/core/resources/vortspec-stamp.mjs"),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Best-effort: for a Vite app, materialize the stamp into the project's `.vortspec/` and
 * return the injected spawn command (`vite --config .vortspec/vite.stamp.mjs`), or null to
 * fall back to the plain `<pm> run <script>`. NEVER throws — a missing bundle, a non-Vite
 * project, or any I/O error just means no anchors (the feature degrades off, the dev server
 * still starts exactly as before).
 */
/**
 * Whether to stamp `data-source` anchors for a server running `script`. TRUE for the project's
 * own Vite app dev server — which serves BOTH the Playground (kind "storybook" falling through to
 * `dev`/`start`/`preview` when there's no Storybook) and the live app runtime (kind "app"). FALSE
 * only for a real Storybook server, whose own build the wrapper wouldn't apply to anyway. Gating on
 * the SCRIPT (not the kind) is what makes instant edits work in the Playground. See issue #56.
 */
export function stampAppliesTo(script: string | null): boolean {
  return script !== null && script !== "storybook";
}

export async function prepareViteStamp(
  projectPath: string,
  pm: string,
  script: string,
): Promise<{ cmd: string; args: string[] } | null> {
  try {
    const pkgRaw = await readFile(join(projectPath, "package.json"), "utf8").catch(() => null);
    const pkg = pkgRaw ? (JSON.parse(pkgRaw) as Record<string, unknown>) : null;
    if (!isViteProject(pkg, script)) return null;
    const bundle = resolveStampBundle();
    if (!bundle) return null;

    const dir = join(projectPath, ".vortspec");
    await mkdir(dir, { recursive: true });
    await copyFile(bundle, join(dir, "vortspec-stamp.mjs"));
    const injection = viteStampInjection({ projectPath, pm, pkg, script, pluginModuleUrl: "./vortspec-stamp.mjs" });
    if (!injection) return null;
    await writeFile(join(dir, "vite.stamp.mjs"), injection.wrapperContent, "utf8");
    return { cmd: injection.argv[0], args: injection.argv.slice(1) };
  } catch {
    return null; // any failure → fall back to the plain dev script
  }
}

export async function startServer(
  sender: WebContents,
  projectPath: string,
  kind: ServerKind,
): Promise<DevServerStatus> {
  const key = keyOf(projectPath, kind);
  const existing = servers.get(key);
  if (existing && (existing.status.state === "starting" || existing.status.state === "running")) {
    existing.sender = sender;
    return existing.status;
  }

  const script = await detectScript(projectPath, kind);
  if (!script) {
    return {
      state: "no-script",
      url: null,
      script: null,
      message:
        kind === "app"
          ? "No dev / start / preview script found in package.json to run the app."
          : "No dev / storybook / start script found in package.json.",
    };
  }

  const pm = detectPackageManager(projectPath);
  const server: Server = {
    child: null,
    status: { state: "starting", url: null, script, message: null },
    sender,
  };
  servers.set(key, server);

  // Stamp the project's OWN Vite app dev server so `data-source` anchors appear in dev (instant
  // Playground edits). This must cover the PLAYGROUND — which runs under kind "storybook" but,
  // for a plain app with no Storybook, falls through to the `dev`/`start`/`preview` script — as
  // well as the live app runtime (kind "app"). Gate on the chosen SCRIPT, not the kind: any
  // script except a real `storybook` is the project's own Vite app. Best-effort: non-Vite / no
  // bundle → the plain `<pm> run <script>`, unchanged.
  const stamp = stampAppliesTo(script) ? await prepareViteStamp(projectPath, pm, script) : null;
  const devCmd = stamp ? stamp.cmd : pm;
  const devArgs = stamp ? stamp.args : ["run", script];

  const runDev = (): void => {
    runStep(server, projectPath, kind, script, devCmd, devArgs, true, ({ code, signal, tail, url }) => {
      if (url !== null || server.status.state === "running" || signal) {
        // Reached the URL then exited, or we stopped it (SIGTERM) — a clean stop.
        server.status = { state: "stopped", url: null, script, message: null };
      } else if (code && code !== 0) {
        server.status = {
          state: "error",
          url: null,
          script,
          message: serverExitMessage(kind, pm, script, code, tail),
        };
      } else {
        server.status = { state: "stopped", url: null, script, message: null };
      }
      push(server, projectPath, kind);
    });
  };

  // Install first when the deps aren't there, so the preview doesn't fail with
  // "command not found": a freshly cloned repo has no node_modules at all, and a
  // just-scaffolded Storybook often has the script + config but its CLI isn't
  // installed yet (stale node_modules). Both cases are fixed by an install.
  const noNodeModules = !existsSync(join(projectPath, "node_modules"));
  const storybookBinMissing =
    kind === "storybook" && !existsSync(join(projectPath, "node_modules", ".bin", "storybook"));
  if (noNodeModules || storybookBinMissing) {
    server.status = { state: "starting", url: null, script, message: `Installing dependencies with ${pm}…` };
    push(server, projectPath, kind);
    runStep(server, projectPath, kind, script, pm, ["install"], false, ({ code, tail }) => {
      if (code !== 0) {
        server.status = { state: "error", url: null, script, message: tailMessage(`Couldn't install dependencies with ${pm}`, tail) };
        push(server, projectPath, kind);
        return;
      }
      runDev();
    });
  } else {
    runDev();
  }

  push(server, projectPath, kind);
  return server.status;
}

// ── Kind-aware public API (storybook = the Playground, app = the live runtime) ──
export const startDevServer = (sender: WebContents, projectPath: string): Promise<DevServerStatus> =>
  startServer(sender, projectPath, "storybook");
export const startAppServer = (sender: WebContents, projectPath: string): Promise<DevServerStatus> =>
  startServer(sender, projectPath, "app");
export const stopDevServer = (projectPath: string): void => stopServer(projectPath, "storybook");
export const stopAppServer = (projectPath: string): void => stopServer(projectPath, "app");
export const getDevServerStatus = (projectPath: string): DevServerStatus =>
  statusOf(projectPath, "storybook");
export const getAppServerStatus = (projectPath: string): DevServerStatus => statusOf(projectPath, "app");

/**
 * Fetch a running Storybook's story index so the Playground can deep-link the
 * right autodocs page per component. Storybook 7+ serves `index.json`; older
 * versions serve `stories.json`. Returns a flat list of entries, or [] if the
 * server isn't a Storybook / isn't ready yet.
 */
export interface StorybookEntry {
  id: string;
  title: string;
  name: string;
  type: "docs" | "story";
  importPath?: string;
}
export async function getStorybookIndex(url: string): Promise<StorybookEntry[]> {
  const base = url.replace(/\/+$/, "");
  for (const path of ["/index.json", "/stories.json"]) {
    try {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        entries?: Record<string, Record<string, unknown>>;
        stories?: Record<string, Record<string, unknown>>;
      };
      const map = json.entries ?? json.stories;
      if (!map) continue;
      // Normalize both shapes (v7 index.json / v6 stories.json) into our contract.
      return Object.entries(map).map(([id, e]) => ({
        id: typeof e.id === "string" ? e.id : id,
        title: typeof e.title === "string" ? e.title : "",
        name: typeof e.name === "string" ? e.name : "",
        type: e.type === "docs" ? "docs" : "story",
        importPath: typeof e.importPath === "string" ? e.importPath : undefined,
      }));
    } catch {
      /* try the next path / give up */
    }
  }
  return [];
}

function stopServer(projectPath: string, kind: ServerKind): void {
  const server = servers.get(keyOf(projectPath, kind));
  if (!server) return;
  const child = server.child;
  child?.kill("SIGTERM");
  setTimeout(() => {
    if (child && !child.killed) child.kill("SIGKILL");
  }, 4000);
}

function statusOf(projectPath: string, kind: ServerKind): DevServerStatus {
  return (
    servers.get(keyOf(projectPath, kind))?.status ?? {
      state: "stopped",
      url: null,
      script: null,
      message: null,
    }
  );
}

/** Kill every managed dev server (called on app quit). */
export function stopAllDevServers(): void {
  for (const server of servers.values()) server.child?.kill("SIGTERM");
}
