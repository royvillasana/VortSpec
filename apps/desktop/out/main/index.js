import { shell, dialog, app, ipcMain, BrowserWindow } from "electron";
import { join as join$1 } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join, basename } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const runEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system-init"),
    sessionId: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.string()),
    mcpErrors: z.array(z.string())
  }),
  z.object({ kind: z.literal("text-delta"), text: z.string() }),
  z.object({ kind: z.literal("assistant-text"), text: z.string() }),
  z.object({
    kind: z.literal("tool-use"),
    id: z.string(),
    name: z.string(),
    path: z.string().optional()
  }),
  z.object({
    kind: z.literal("tool-result"),
    toolUseId: z.string(),
    isError: z.boolean()
  }),
  z.object({
    kind: z.literal("api-retry"),
    attempt: z.number(),
    maxRetries: z.number(),
    errorCategory: z.string(),
    retryDelayMs: z.number().optional()
  }),
  z.object({ kind: z.literal("notice"), text: z.string() }),
  z.object({
    kind: z.literal("result"),
    isError: z.boolean(),
    text: z.string().optional(),
    costUsd: z.number().optional(),
    sessionId: z.string().optional()
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("exit"), code: z.number().nullable() })
]);
const agentRunOptionsSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().min(1),
  appendSystemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  resumeSessionId: z.string().optional()
});
const AGENT_EVENT_CHANNEL = "agent:event";
const AGENT_RAW_CHANNEL = "agent:raw";
z.object({
  runId: z.string(),
  event: runEventSchema
});
z.object({
  runId: z.string(),
  line: z.string()
});
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
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },
  "agent:startRun": {
    request: agentRunOptionsSchema,
    response: z.object({ runId: z.string() })
  },
  "agent:cancelRun": { request: z.string(), response: z.void() }
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
function truncate(s, n = 200) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function toolPath(input) {
  if (typeof input !== "object" || input === null) return void 0;
  const record = input;
  for (const key of ["file_path", "path", "filePath", "notebook_path"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return void 0;
}
function mapAssistant(message) {
  if (typeof message !== "object" || message === null) return [];
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const events = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
      events.push({ kind: "assistant-text", text: b.text });
    } else if (b.type === "tool_use") {
      events.push({
        kind: "tool-use",
        id: typeof b.id === "string" ? b.id : "",
        name: typeof b.name === "string" ? b.name : "tool",
        path: toolPath(b.input)
      });
    }
  }
  return events;
}
function mapToolResults(message) {
  if (typeof message !== "object" || message === null) return [];
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const events = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block;
    if (b.type === "tool_result") {
      events.push({
        kind: "tool-result",
        toolUseId: typeof b.tool_use_id === "string" ? b.tool_use_id : "",
        isError: b.is_error === true
      });
    }
  }
  return events;
}
function mapObject(obj) {
  switch (obj.type) {
    case "system": {
      if (obj.subtype === "init") {
        const mcp = Array.isArray(obj.mcp_servers) ? obj.mcp_servers : [];
        const pluginErrors = Array.isArray(obj.plugin_errors) ? obj.plugin_errors : [];
        return [
          {
            kind: "system-init",
            sessionId: typeof obj.session_id === "string" ? obj.session_id : void 0,
            model: typeof obj.model === "string" ? obj.model : void 0,
            tools: (Array.isArray(obj.tools) ? obj.tools : []).map(String),
            mcpServers: mcp.map(
              (m) => typeof m === "object" && m !== null ? String(m.name ?? "") : String(m)
            ).filter(Boolean),
            mcpErrors: pluginErrors.map(
              (e) => typeof e === "object" && e !== null ? String(e.message ?? "plugin error") : String(e)
            )
          }
        ];
      }
      if (obj.subtype === "api_retry") {
        return [
          {
            kind: "api-retry",
            attempt: Number(obj.attempt ?? 0),
            maxRetries: Number(obj.max_retries ?? 0),
            errorCategory: typeof obj.error === "string" ? obj.error : "unknown",
            retryDelayMs: typeof obj.retry_delay_ms === "number" ? obj.retry_delay_ms : void 0
          }
        ];
      }
      if (obj.subtype === "plugin_install") {
        return [
          {
            kind: "notice",
            text: `Plugin ${String(obj.name ?? "")} ${String(obj.status ?? "")}`.trim()
          }
        ];
      }
      return [];
    }
    case "assistant":
      return mapAssistant(obj.message);
    case "user":
      return mapToolResults(obj.message);
    case "stream_event": {
      const event = obj.event;
      const delta = event?.delta;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return [{ kind: "text-delta", text: delta.text }];
      }
      return [];
    }
    case "result":
      return [
        {
          kind: "result",
          isError: obj.is_error === true || obj.subtype === "error",
          text: typeof obj.result === "string" ? obj.result : void 0,
          costUsd: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : void 0,
          sessionId: typeof obj.session_id === "string" ? obj.session_id : void 0
        }
      ];
    default:
      return [];
  }
}
function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return [{ kind: "error", message: `Unparseable stream line: ${truncate(trimmed)}` }];
  }
  if (typeof obj !== "object" || obj === null) return [];
  return mapObject(obj);
}
class AgentAdapter extends EventEmitter {
  child = null;
  stdoutBuffer = "";
  canceled = false;
  start(opts) {
    const args = [
      "-p",
      opts.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages"
    ];
    if (opts.appendSystemPrompt) {
      args.push("--append-system-prompt", opts.appendSystemPrompt);
    }
    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push("--allowedTools", opts.allowedTools.join(","));
    }
    if (opts.resumeSessionId) {
      args.push("--resume", opts.resumeSessionId);
    }
    this.child = spawn("claude", args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false
    });
    this.child.stdout?.on("data", (chunk) => this.onStdout(chunk.toString()));
    this.child.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.emitEvent({ kind: "notice", text });
    });
    this.child.on("error", (err) => {
      this.emitEvent({
        kind: "error",
        message: `Could not start Claude Code: ${err.message}. Is it installed and on PATH?`
      });
    });
    this.child.on("close", (code) => {
      this.flush();
      if (!this.canceled) this.emitEvent({ kind: "exit", code });
      this.child = null;
    });
  }
  cancel() {
    if (this.canceled) return;
    this.canceled = true;
    const child = this.child;
    if (child) {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2e3);
    }
    this.emitEvent({ kind: "notice", text: "Run canceled." });
    this.emitEvent({ kind: "exit", code: null });
  }
  onStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.dispatch(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }
  flush() {
    if (this.stdoutBuffer.trim()) {
      this.dispatch(this.stdoutBuffer);
    }
    this.stdoutBuffer = "";
  }
  dispatch(line) {
    if (line.trim()) this.emit("raw", line);
    for (const event of parseStreamLine(line)) {
      this.emitEvent(event);
    }
  }
  emitEvent(event) {
    this.emit("event", event);
  }
}
const runs = /* @__PURE__ */ new Map();
function startRun(sender, opts) {
  const runId = randomUUID();
  const adapter = new AgentAdapter();
  runs.set(runId, adapter);
  adapter.on("event", (raw) => {
    const parsed = runEventSchema.safeParse(raw);
    const event = parsed.success ? parsed.data : { kind: "error", message: "Invalid run event dropped at the boundary" };
    if (!sender.isDestroyed()) {
      sender.send(AGENT_EVENT_CHANNEL, { runId, event });
    }
    if (event.kind === "exit") {
      runs.delete(runId);
    }
  });
  adapter.on("raw", (line) => {
    if (!sender.isDestroyed()) {
      sender.send(AGENT_RAW_CHANNEL, { runId, line });
    }
  });
  adapter.start(opts);
  return { runId };
}
function cancelRun(runId) {
  runs.get(runId)?.cancel();
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
  "toolkit:install": ((path) => installToolkit(path)),
  "agent:startRun": ((opts, sender) => startRun(sender, opts)),
  "agent:cancelRun": ((runId) => {
    cancelRun(runId);
    return void 0;
  })
};
function registerIpc() {
  Object.keys(ipcContract).forEach((channel) => {
    const contract = ipcContract[channel];
    ipcMain.handle(channel, async (event, rawRequest) => {
      const request = contract.request.parse(rawRequest);
      const result = await handlers[channel](request, event.sender);
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
