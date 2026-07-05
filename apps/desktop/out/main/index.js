import { shell, dialog, app, ipcMain, BrowserWindow } from "electron";
import { join as join$1 } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { access, mkdir, readFile, writeFile, cp, copyFile, appendFile, readdir, symlink, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
  resumeSessionId: z.string().optional(),
  /**
   * Bypass Claude Code permission prompts for this run
   * (`--dangerously-skip-permissions`). Headless `-p` mode cannot show
   * interactive prompts, so MCP tools (Figma, Stitch…) and Bash are otherwise
   * auto-denied. The guided flow sets this because the user explicitly triggers
   * each stage; the run is confined to the project folder.
   */
  bypassPermissions: z.boolean().optional()
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
const stageKindSchema = z.enum([
  "source",
  "components",
  "input",
  "intake",
  "agent",
  "verify"
]);
const stageStatusSchema = z.enum([
  "pending",
  "running",
  "needs-review",
  "approved",
  "failed"
]);
const stageDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: stageKindSchema,
  /** produces an artifact that must be approved before advancing */
  gated: z.boolean().default(false),
  /** relative path of the artifact this stage produces, if any (fixed path) */
  artifact: z.string().optional(),
  /** filename suffix to resolve under specs/ when the path is dynamic
   *  (SDD-DE writes specs/[feature-name]/…, so the feature name is not known ahead of time) */
  artifactGlob: z.string().optional(),
  /** prompt handed to Claude Code for agent/verify stages */
  promptTemplate: z.string().optional(),
  allowedTools: z.array(z.string()).optional()
});
const stageStateSchema = z.object({
  id: z.string(),
  status: stageStatusSchema,
  updatedAt: z.string(),
  decisionNotes: z.string().optional()
});
const detectedComponentSchema = z.object({
  name: z.string(),
  level: z.enum(["atom", "molecule", "organism"]).optional(),
  description: z.string().optional()
});
z.array(detectedComponentSchema);
const COMPONENTS_MANIFEST = ".sdd-de/components.json";
const flowStateSchema = z.object({
  currentStageId: z.string(),
  stages: z.array(stageStateSchema)
});
const flowSchema = z.object({
  definitions: z.array(stageDefSchema),
  state: flowStateSchema
});
const DEFAULT_FLOW = [
  {
    id: "design-system",
    title: "Design system",
    summary: "Connect to your configured design source (e.g. the Figma file), extract design tokens + variables, and detect every component — no brief needed.",
    kind: "source",
    gated: true,
    artifact: COMPONENTS_MANIFEST,
    promptTemplate: 'Read .sdd-de/project.yaml for `design_source` and the project configuration (framework, language, token_file, component_dir). Connect to the configured source — do NOT ask for a brief; the design source is the input.\n\nFor `design_source: figma`, use the Figma MCP to read the file at `figma_file_url` and the variable collection named `figma_token_collection`.\n\n1. Extract every design token and variable from the source into the configured `token_file`.\n2. Detect every component in the design system and write `.sdd-de/components.json` — a JSON array of objects `{ "name": string, "level": "atom"|"molecule"|"organism", "description": string }`, ordered tokens → atoms → molecules → organisms.\n\nDo NOT implement the components yet — this stage only extracts tokens and detects the inventory.',
    allowedTools: ["Read", "Write", "Edit"]
  },
  {
    id: "components",
    title: "Components",
    summary: "Choose to build every detected component at once, or one by one. Each is generated in your framework and language using the extracted tokens.",
    kind: "components",
    gated: true,
    allowedTools: ["Read", "Write", "Edit", "Bash"]
  },
  {
    id: "visual-verify",
    title: "Visual verify",
    summary: "/visual-verify — compare the implementation to the spec across viewports; a11y audit; list discrepancies.",
    kind: "verify",
    gated: true,
    // The skill writes specs/<component>/visual-verify-report.md — surface the
    // newest one in the approval gate so this stage can be reviewed + approved.
    artifactGlob: "visual-verify-report.md",
    promptTemplate: "/visual-verify\n\nRun the visual-verify skill: compare the live implementation to the spec across 375/768/1440px, check every token, variant, and state, run the accessibility audit, and report discrepancies.",
    allowedTools: ["Read", "Bash"]
  },
  {
    id: "sync",
    title: "Sync",
    summary: "/sync-tokens — reconcile design.md and token files with the decisions made during implementation.",
    kind: "agent",
    gated: false,
    promptTemplate: "/sync-tokens\n\nRun the sync-tokens skill: update design.md and token files so they reflect the implementation. No undocumented deviations.",
    allowedTools: ["Read", "Write", "Edit"]
  },
  {
    id: "commit",
    title: "Commit",
    summary: "/commit — open a PR where the spec is the PR description.",
    kind: "agent",
    gated: false,
    promptTemplate: "/commit\n\nRun the commit skill: commit the changes and open a PR whose description is the component spec, with the Figma link and QA screenshots. No direct pushes to main.",
    allowedTools: ["Read", "Bash"]
  }
];
const frameworkSchema = z.enum([
  "react",
  "next",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "angular",
  "astro",
  "vanilla"
]);
const languageSchema = z.enum(["typescript", "javascript"]);
const designSourceSchema = z.enum(["figma", "library", "github", "zip", "stitch"]);
const componentLibrarySchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "antd",
  "chakra",
  "mantine",
  "headlessui",
  "other"
]);
const stylingSchema = z.enum([
  "tailwind",
  "css-modules",
  "scss",
  "styled-components",
  "emotion",
  "css"
]);
const testRunnerSchema = z.enum(["vitest", "jest", "playwright", "cypress", "none"]);
const stitchConnectionSchema = z.enum(["mcp", "zip"]);
const setupAnswersSchema = z.object({
  framework: frameworkSchema,
  language: languageSchema,
  designSource: designSourceSchema,
  // Figma
  figmaFileUrl: z.string().optional(),
  figmaTokenCollection: z.string().optional(),
  // Library
  componentLibrary: componentLibrarySchema.optional(),
  // GitHub
  githubRepoUrl: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComponentDir: z.string().optional(),
  // ZIP
  zipFilePath: z.string().optional(),
  zipComponentDir: z.string().optional(),
  // Stitch
  stitchConnection: stitchConnectionSchema.optional(),
  stitchApiKey: z.string().optional(),
  stitchProjectId: z.string().optional(),
  stitchZipPath: z.string().optional(),
  // Common
  styling: stylingSchema,
  tokenFile: z.string(),
  componentDir: z.string(),
  testRunner: testRunnerSchema
});
const projectConfigSchema = z.object({
  designSource: z.string().optional(),
  figmaFileUrl: z.string().optional(),
  figmaTokenCollection: z.string().optional(),
  componentLibrary: z.string().optional(),
  githubRepoUrl: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComponentDir: z.string().optional(),
  zipFilePath: z.string().optional(),
  stitchConnection: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  styling: z.string().optional(),
  tokenFile: z.string().optional(),
  componentDir: z.string().optional()
});
function buildProjectYaml(a) {
  const lines = [
    "# SDD-DE Project Configuration",
    "# Generated by VortSpec — update any time your stack changes.",
    "# See .sdd-de/docs/framework-config.md for framework-specific guidance.",
    "",
    `framework: ${a.framework}`,
    `language: ${a.language}`,
    `styling: ${a.styling}`,
    "",
    "# Design system source: figma | library | github | zip | stitch",
    `design_source: ${a.designSource}`
  ];
  if (a.designSource === "figma") {
    lines.push(`figma_file_url: "${a.figmaFileUrl ?? ""}"`);
    lines.push(`figma_token_collection: ${a.figmaTokenCollection || "Tokens"}`);
  } else if (a.designSource === "library") {
    lines.push(`component_library: ${a.componentLibrary ?? "other"}`);
  } else if (a.designSource === "github") {
    lines.push(`github_repo_url: "${a.githubRepoUrl ?? ""}"`);
    lines.push(`github_branch: ${a.githubBranch || "main"}`);
    lines.push(`github_component_dir: ${a.githubComponentDir || "src/components"}`);
  } else if (a.designSource === "zip") {
    lines.push(`zip_file_path: "${a.zipFilePath ?? ""}"`);
    lines.push(`zip_component_dir: ${a.zipComponentDir || "src/components"}`);
  } else if (a.designSource === "stitch") {
    lines.push(`stitch_connection: ${a.stitchConnection ?? "mcp"}`);
    if (a.stitchConnection === "mcp") {
      lines.push(`stitch_api_key: "${a.stitchApiKey ?? ""}"`);
      lines.push(`stitch_project_id: "${a.stitchProjectId ?? ""}"`);
    } else {
      lines.push(`stitch_zip_path: "${a.stitchZipPath ?? ""}"`);
    }
  }
  lines.push("");
  lines.push(`token_file: ${a.tokenFile}`);
  lines.push(`component_dir: ${a.componentDir}`);
  lines.push(`test_runner: ${a.testRunner}`);
  return lines.join("\n") + "\n";
}
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
  "workspace:createFolder": { request: z.void(), response: projectSchema.nullable() },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:openFolder": { request: z.string(), response: z.void() },
  "workspace:refreshProject": { request: z.string(), response: projectSchema },
  "workspace:createProject": {
    request: z.object({ path: z.string(), answers: setupAnswersSchema }),
    response: projectSchema
  },
  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },
  "agent:startRun": {
    request: agentRunOptionsSchema,
    response: z.object({ runId: z.string() })
  },
  "agent:cancelRun": { request: z.string(), response: z.void() },
  "flow:get": { request: z.string(), response: flowSchema },
  "flow:setStageStatus": {
    request: z.object({
      projectPath: z.string(),
      stageId: z.string(),
      status: stageStatusSchema
    }),
    response: flowSchema
  },
  "flow:approveStage": {
    request: z.object({ projectPath: z.string(), stageId: z.string() }),
    response: flowSchema
  },
  "flow:requestChanges": {
    request: z.object({
      projectPath: z.string(),
      stageId: z.string(),
      notes: z.string()
    }),
    response: flowSchema
  },
  "flow:saveIntake": {
    request: z.object({ projectPath: z.string(), content: z.string() }),
    response: flowSchema
  },
  "flow:completeInput": {
    request: z.object({ projectPath: z.string(), stageId: z.string() }),
    response: flowSchema
  },
  "artifact:read": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.string().nullable()
  },
  "artifact:findLatest": {
    request: z.object({ projectPath: z.string(), suffix: z.string() }),
    response: z.object({ path: z.string(), content: z.string() }).nullable()
  },
  "project:config": {
    request: z.string(),
    response: projectConfigSchema.nullable()
  }
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
const SDD_DE_INSTALL_CMD = "npx @royvillasana/sdd-de";
async function exists$1(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function getToolkitStatus(projectPath) {
  const sdde = join(projectPath, ".sdd-de");
  const present = await exists$1(join(sdde, "project.yaml")) || await exists$1(join(sdde, "ai-specs", "skills"));
  return { present, version: null, updateAvailable: false };
}
async function installToolkit(projectPath) {
  const override = process.env.VORTSPEC_TOOLKIT_INSTALL_CMD?.trim();
  if (!override) {
    throw new Error(
      `SDD-DE setup is interactive. Run \`${SDD_DE_INSTALL_CMD}\` in a terminal in this project and answer the prompts, then re-check. (In-app terminal install arrives in D5.)`
    );
  }
  const [cmd, ...args] = override.split(/\s+/);
  const r = await execFileSafe(cmd, args, { cwd: projectPath, timeoutMs: 18e4 });
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
  return registerPath(result.filePaths[0]);
}
async function createFolder() {
  const result = await dialog.showSaveDialog({
    title: "Create a new project folder",
    buttonLabel: "Create folder",
    nameFieldLabel: "Folder name:",
    message: "Choose where to create your new project folder"
  });
  if (result.canceled || !result.filePath) return null;
  await mkdir(result.filePath, { recursive: true });
  return registerPath(result.filePath);
}
async function registerPath(path) {
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
const require$1 = createRequire(import.meta.url);
function packageDir() {
  return dirname(require$1.resolve("@royvillasana/sdd-de/package.json"));
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function createSkillSymlinks(sourceDir, targetDir) {
  if (!await exists(sourceDir)) return;
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const linkPath = join(targetDir, entry.name);
    const linkTarget = `../../.sdd-de/ai-specs/skills/${entry.name}`;
    if (!await exists(linkPath)) {
      try {
        await symlink(linkTarget, linkPath);
      } catch {
      }
    }
  }
}
async function createProject(projectPath, answers) {
  const pkgDir = packageDir();
  const sddeDir = join(projectPath, ".sdd-de");
  await mkdir(sddeDir, { recursive: true });
  await cp(join(pkgDir, "ai-specs", "skills"), join(sddeDir, "ai-specs", "skills"), {
    recursive: true
  });
  await cp(join(pkgDir, "docs"), join(sddeDir, "docs"), { recursive: true });
  await writeFile(join(sddeDir, "project.yaml"), buildProjectYaml(answers), "utf8");
  const claudeSrc = join(pkgDir, "CLAUDE.md");
  for (const name of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "codex.md"]) {
    const dst = join(projectPath, name);
    if (!await exists(dst)) {
      try {
        await copyFile(claudeSrc, dst);
      } catch {
      }
    }
  }
  await createSkillSymlinks(
    join(sddeDir, "ai-specs", "skills"),
    join(projectPath, ".claude", "skills")
  );
  const gitignorePath = join(projectPath, ".gitignore");
  if (await exists(gitignorePath)) {
    const content = await readFile(gitignorePath, "utf8");
    if (!content.includes(".sdd-de")) {
      await appendFile(gitignorePath, "\n# SDD-DE toolkit\n.sdd-de/\n");
    }
  }
  return refreshProject(projectPath);
}
const KEY_MAP = {
  design_source: "designSource",
  figma_file_url: "figmaFileUrl",
  figma_token_collection: "figmaTokenCollection",
  component_library: "componentLibrary",
  github_repo_url: "githubRepoUrl",
  github_branch: "githubBranch",
  github_component_dir: "githubComponentDir",
  zip_file_path: "zipFilePath",
  stitch_connection: "stitchConnection",
  framework: "framework",
  language: "language",
  styling: "styling",
  token_file: "tokenFile",
  component_dir: "componentDir"
};
function parseFlatYaml(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
async function readProjectConfig(projectPath) {
  let text;
  try {
    text = await readFile(join(projectPath, ".sdd-de", "project.yaml"), "utf8");
  } catch {
    return null;
  }
  const flat = parseFlatYaml(text);
  const config = {};
  for (const [yamlKey, value] of Object.entries(flat)) {
    const mapped = KEY_MAP[yamlKey];
    if (mapped) config[mapped] = value;
  }
  const parsed = projectConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
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
    if (opts.bypassPermissions) {
      args.push("--dangerously-skip-permissions");
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
function vortspecDir(projectPath) {
  return join(projectPath, ".vortspec");
}
function flowFile(projectPath) {
  return join(vortspecDir(projectPath), "flow.json");
}
function initialState() {
  const first = DEFAULT_FLOW[0];
  return {
    currentStageId: first.id,
    stages: DEFAULT_FLOW.map((def) => ({
      id: def.id,
      status: "pending",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }))
  };
}
async function readState(projectPath) {
  try {
    const raw = await readFile(flowFile(projectPath), "utf8");
    const parsed = flowStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return reconcile(parsed.data);
  } catch {
  }
  return initialState();
}
function reconcile(state) {
  const byId = new Map(state.stages.map((s) => [s.id, s]));
  const stages = DEFAULT_FLOW.map(
    (def) => byId.get(def.id) ?? {
      id: def.id,
      status: "pending",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  );
  const currentValid = DEFAULT_FLOW.some((d) => d.id === state.currentStageId);
  return {
    currentStageId: currentValid ? state.currentStageId : DEFAULT_FLOW[0].id,
    stages
  };
}
async function writeState(projectPath, state) {
  await mkdir(vortspecDir(projectPath), { recursive: true });
  await writeFile(flowFile(projectPath), JSON.stringify(state, null, 2), "utf8");
}
function withFlow(state) {
  return { definitions: DEFAULT_FLOW, state };
}
function patchStage(state, stageId, patch) {
  return {
    ...state,
    stages: state.stages.map(
      (s) => s.id === stageId ? { ...s, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } : s
    )
  };
}
function nextStageId(stageId) {
  const index = DEFAULT_FLOW.findIndex((d) => d.id === stageId);
  const next = DEFAULT_FLOW[index + 1];
  return next ? next.id : null;
}
async function getFlow(projectPath) {
  return withFlow(await readState(projectPath));
}
async function setStageStatus(projectPath, stageId, status) {
  const next = patchStage(await readState(projectPath), stageId, { status });
  await writeState(projectPath, next);
  return withFlow(next);
}
async function approveStage(projectPath, stageId) {
  let state = patchStage(await readState(projectPath), stageId, {
    status: "approved",
    decisionNotes: void 0
  });
  const next = nextStageId(stageId);
  if (next) state = { ...state, currentStageId: next };
  await writeState(projectPath, state);
  return withFlow(state);
}
async function requestChanges(projectPath, stageId, notes) {
  const next = patchStage(await readState(projectPath), stageId, {
    status: "needs-review",
    decisionNotes: notes
  });
  await writeState(projectPath, next);
  return withFlow(next);
}
async function saveIntake(projectPath, content) {
  const sddeDir = join(projectPath, ".sdd-de");
  await mkdir(sddeDir, { recursive: true });
  await writeFile(join(sddeDir, "brief.md"), content, "utf8");
  return approveStage(projectPath, "brief");
}
async function findLatestArtifact(projectPath, suffix) {
  const specsRoot = join(projectPath, "specs");
  let best = null;
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(suffix)) {
        const { mtimeMs } = await stat(full);
        if (!best || mtimeMs > best.mtime) best = { path: full, mtime: mtimeMs };
      }
    }
  }
  await walk(specsRoot);
  if (!best) return null;
  const chosen = best;
  const content = await readFile(chosen.path, "utf8");
  return { path: chosen.path.slice(projectPath.length + 1), content };
}
async function completeInput(projectPath, stageId) {
  return approveStage(projectPath, stageId);
}
async function readArtifact(projectPath, relPath) {
  try {
    return await readFile(join(projectPath, relPath), "utf8");
  } catch {
    return null;
  }
}
const handlers = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),
  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:openInstall": ((url) => shell.openExternal(url).then(() => void 0)),
  "workspace:pickFolder": ((req) => pickFolder(req ?? { create: false })),
  "workspace:createFolder": (() => createFolder()),
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path) => openFolder(path)),
  "workspace:refreshProject": ((path) => refreshProject(path)),
  "workspace:createProject": ((req) => createProject(req.path, req.answers)),
  "toolkit:status": ((path) => getToolkitStatus(path)),
  "toolkit:install": ((path) => installToolkit(path)),
  "agent:startRun": ((opts, sender) => startRun(sender, opts)),
  "agent:cancelRun": ((runId) => {
    cancelRun(runId);
    return void 0;
  }),
  "flow:get": ((projectPath) => getFlow(projectPath)),
  "flow:setStageStatus": ((req) => setStageStatus(req.projectPath, req.stageId, req.status)),
  "flow:approveStage": ((req) => approveStage(req.projectPath, req.stageId)),
  "flow:requestChanges": ((req) => requestChanges(req.projectPath, req.stageId, req.notes)),
  "flow:saveIntake": ((req) => saveIntake(req.projectPath, req.content)),
  "flow:completeInput": ((req) => completeInput(req.projectPath, req.stageId)),
  "artifact:read": ((req) => readArtifact(req.projectPath, req.relPath)),
  "artifact:findLatest": ((req) => findLatestArtifact(req.projectPath, req.suffix)),
  "project:config": ((projectPath) => readProjectConfig(projectPath))
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
    if (is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
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
