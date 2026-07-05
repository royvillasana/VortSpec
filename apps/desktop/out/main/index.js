import { shell, dialog, app, ipcMain, BrowserWindow } from "electron";
import { join as join$1 } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join, basename } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const checkStatusSchema = z.enum(["pass", "fail", "unknown", "checking"]);
const fixActionSchema = z.object({
  /** install-link → open an external URL; open-login → run login in the PTY; verify → re-run the check */
  kind: z.enum(["install-link", "open-login", "verify"]),
  label: z.string(),
  url: z.string().url().optional()
});
const envCheckIdSchema = z.enum([
  "node",
  "git",
  "claude-install",
  "claude-login"
]);
const envCheckSchema = z.object({
  id: envCheckIdSchema,
  label: z.string(),
  status: checkStatusSchema,
  detail: z.string(),
  fix: fixActionSchema.optional()
});
const envReportSchema = z.object({
  checks: z.array(envCheckSchema),
  /** true when every required check passes */
  ready: z.boolean()
});
const toolkitStatusSchema = z.object({
  present: z.boolean(),
  version: z.string().nullable(),
  /** true when a newer toolkit version is available to install */
  updateAvailable: z.boolean()
});
const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  toolkit: toolkitStatusSchema,
  lastRunStatus: z.enum(["none", "running", "needs-review", "approved", "failed"]).default("none"),
  addedAt: z.string()
});
const projectListSchema = z.array(projectSchema);
const ipcContract = {
  "system:isElectron": { request: z.void(), response: z.boolean() },
  "system:getVersion": { request: z.void(), response: z.string() },
  "env:check": { request: z.void(), response: envReportSchema },
  "env:verifyLogin": { request: z.void(), response: envCheckSchema },
  "env:openInstall": { request: z.string().url(), response: z.void() },
  "workspace:pickFolder": {
    request: z.object({ create: z.boolean().default(false) }).optional(),
    response: projectSchema.nullable()
  },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:openFolder": { request: z.string(), response: z.void() },
  "workspace:refreshProject": { request: z.string(), response: projectSchema },
  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema }
};
function execFileSafe(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs) : null;
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut, spawnError: err.message });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    if (opts.input !== void 0) {
      child.stdin?.end(opts.input);
    }
  });
}
const NODE_INSTALL = {
  kind: "install-link",
  label: "Install Node.js",
  url: "https://nodejs.org/en/download"
};
const GIT_INSTALL = {
  kind: "install-link",
  label: "Install Git",
  url: "https://git-scm.com/downloads"
};
const CLAUDE_INSTALL = {
  kind: "install-link",
  label: "Install Claude Code",
  url: "https://code.claude.com/docs/en/overview"
};
const OPEN_LOGIN = { kind: "open-login", label: "Open login" };
const VERIFY_LOGIN = { kind: "verify", label: "Verify login" };
const MIN_NODE_MAJOR = 20;
async function checkNode() {
  const r = await execFileSafe("node", ["--version"], { timeoutMs: 8e3 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      detail: "Not found on PATH",
      fix: NODE_INSTALL
    };
  }
  const version = r.stdout.trim();
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
  if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      detail: `${version} — needs ≥ ${MIN_NODE_MAJOR}`,
      fix: NODE_INSTALL
    };
  }
  return { id: "node", label: "Node.js", status: "pass", detail: version };
}
async function checkGit() {
  const r = await execFileSafe("git", ["--version"], { timeoutMs: 8e3 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "git",
      label: "Git",
      status: "fail",
      detail: "Not found on PATH",
      fix: GIT_INSTALL
    };
  }
  return {
    id: "git",
    label: "Git",
    status: "pass",
    detail: r.stdout.trim().replace(/^git version /, "v")
  };
}
async function checkClaudeInstall() {
  const r = await execFileSafe("claude", ["--version"], { timeoutMs: 8e3 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "claude-install",
      label: "Claude Code",
      status: "fail",
      detail: "Not found on PATH",
      fix: CLAUDE_INSTALL
    };
  }
  return {
    id: "claude-install",
    label: "Claude Code",
    status: "pass",
    detail: r.stdout.trim().split("\n")[0] ?? "installed"
  };
}
function pendingLogin() {
  return {
    id: "claude-login",
    label: "Claude Code login",
    status: "unknown",
    detail: "Not verified yet",
    fix: VERIFY_LOGIN
  };
}
const AUTH_ERROR_RE = /authentication_failed|not logged in|please run.*login|oauth|unauthorized|invalid api key|401/i;
async function verifyClaudeLogin() {
  const install = await checkClaudeInstall();
  if (install.status !== "pass") {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "fail",
      detail: "Claude Code is not installed",
      fix: CLAUDE_INSTALL
    };
  }
  const r = await execFileSafe(
    "claude",
    ["-p", "Reply with the single word: ok", "--output-format", "json"],
    { timeoutMs: 3e4 }
  );
  const haystack = `${r.stdout}
${r.stderr}`;
  if (r.timedOut) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "unknown",
      detail: "Verification timed out",
      fix: VERIFY_LOGIN
    };
  }
  if (AUTH_ERROR_RE.test(haystack)) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "fail",
      detail: "Not logged in",
      fix: OPEN_LOGIN
    };
  }
  if (r.code === 0) {
    return {
      id: "claude-login",
      label: "Claude Code login",
      status: "pass",
      detail: "Logged in"
    };
  }
  return {
    id: "claude-login",
    label: "Claude Code login",
    status: "unknown",
    detail: "Could not verify",
    fix: VERIFY_LOGIN
  };
}
async function checkEnvironment() {
  const [node, git, install] = await Promise.all([
    checkNode(),
    checkGit(),
    checkClaudeInstall()
  ]);
  const checks = [node, git, install, pendingLogin()];
  const ready = checks.every((c) => c.status === "pass");
  return { checks, ready };
}
const MANIFEST_REL = join(".sdd-de", "manifest.json");
async function readInstalledVersion(projectPath) {
  try {
    const raw = await readFile(join(projectPath, MANIFEST_REL), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return null;
  }
}
async function getToolkitStatus(projectPath) {
  const version = await readInstalledVersion(projectPath);
  return {
    present: version !== null,
    version,
    // Update detection compares against a known-latest source once the real
    // toolkit is wired; until then we never claim an update is available.
    updateAvailable: false
  };
}
async function installToolkit(projectPath) {
  const configured = process.env.VORTSPEC_TOOLKIT_INSTALL_CMD?.trim();
  if (!configured) {
    throw new Error(
      "SDD-DE toolkit install command is not configured yet. Set VORTSPEC_TOOLKIT_INSTALL_CMD to the verified init command, or install the toolkit manually. (design open question — task 2.6)"
    );
  }
  const [cmd, ...args] = configured.split(/\s+/);
  const r = await execFileSafe(cmd, args, { cwd: projectPath, timeoutMs: 12e4 });
  if (r.spawnError || r.code !== 0) {
    throw new Error(
      `Toolkit install failed: ${r.spawnError ?? r.stderr.trim() ?? `exit ${r.code}`}`
    );
  }
  return getToolkitStatus(projectPath);
}
function registryPath() {
  return join(app.getPath("userData"), "projects.json");
}
function projectId(path) {
  return createHash("sha1").update(path).digest("hex").slice(0, 12);
}
async function readRegistry() {
  try {
    const raw = await readFile(registryPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => typeof p === "object" && p !== null && typeof p.path === "string"
    );
  } catch {
    return [];
  }
}
async function writeRegistry(entries) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(registryPath(), JSON.stringify(entries, null, 2), "utf8");
}
async function hydrate(entry) {
  const toolkit = await getToolkitStatus(entry.path);
  return {
    id: entry.id,
    name: basename(entry.path),
    path: entry.path,
    toolkit,
    lastRunStatus: "none",
    addedAt: entry.addedAt
  };
}
async function listProjects() {
  const entries = await readRegistry();
  const projects = await Promise.all(entries.map(hydrate));
  return projectListSchema.parse(projects);
}
async function pickFolder(opts = { create: false }) {
  const result = await dialog.showOpenDialog({
    title: opts.create ? "Create or choose a project folder" : "Choose a project folder",
    properties: opts.create ? ["openDirectory", "createDirectory"] : ["openDirectory"],
    buttonLabel: "Use this folder"
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const path = result.filePaths[0];
  const entries = await readRegistry();
  const existing = entries.find((e) => e.path === path);
  const entry = existing ?? { id: projectId(path), path, addedAt: (/* @__PURE__ */ new Date()).toISOString() };
  if (!existing) {
    entries.push(entry);
    await writeRegistry(entries);
  }
  return hydrate(entry);
}
async function refreshProject(path) {
  const entries = await readRegistry();
  const entry = entries.find((e) => e.path === path) ?? { id: projectId(path), path, addedAt: (/* @__PURE__ */ new Date()).toISOString() };
  return hydrate(entry);
}
async function openFolder(path) {
  await shell.openPath(path);
}
const handlers = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),
  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:openInstall": ((url) => shell.openExternal(url).then(() => void 0)),
  "workspace:pickFolder": ((req) => pickFolder(req ?? { create: false })),
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path) => openFolder(path)),
  "workspace:refreshProject": ((path) => refreshProject(path)),
  "toolkit:status": ((path) => getToolkitStatus(path)),
  "toolkit:install": ((path) => installToolkit(path))
};
function registerIpc() {
  Object.keys(ipcContract).forEach((channel) => {
    const contract = ipcContract[channel];
    ipcMain.handle(channel, async (_event, rawRequest) => {
      const request = contract.request.parse(rawRequest);
      const result = await handlers[channel](request);
      return contract.response.parse(result);
    });
  });
}
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "VortSpec",
    backgroundColor: "#0B0C0E",
    titleBarStyle: "hiddenInset",
    icon: join$1(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join$1(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join$1(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.vortspec.desktop");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
