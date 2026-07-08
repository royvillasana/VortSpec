import { shell, dialog, app, ipcMain, BrowserWindow } from "electron";
import { join as join$1 } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join, resolve as resolve$1, sep, basename, dirname, extname } from "node:path";
import { access, mkdir, readFile as readFile$1, writeFile as writeFile$1, cp, copyFile, appendFile, readdir, symlink, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { watch, promises, existsSync } from "node:fs";
import { spawn as spawn$1 } from "node-pty";
import { EventEmitter } from "node:events";
import { homedir, platform } from "node:os";
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
  bypassPermissions: z.boolean().optional(),
  /**
   * Renderer-supplied labels persisted with the run so an interrupted run can be
   * resumed later with its original stage view (kind) and scope (total). Opaque
   * to the main process except for persistence.
   */
  meta: z.object({
    kind: z.string().optional(),
    label: z.string().optional(),
    total: z.number().optional()
  }).optional()
});
const lastRunSchema = z.object({
  sessionId: z.string().nullable(),
  title: z.string(),
  kind: z.string().optional(),
  label: z.string().optional(),
  total: z.number().nullable().optional(),
  status: z.enum(["running", "passed", "cancelled", "failed"]),
  updatedAt: z.string()
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
const usageLimitSchema = z.object({
  /** e.g. "Current session", "Current week (all models)", "Current week (Fable)". */
  label: z.string(),
  /** 0–100, as Claude reports it. */
  percent: z.number(),
  /** Human reset string exactly as Claude prints it, or null if none given. */
  resetsAt: z.string().nullable()
});
const usageResultSchema = z.object({
  /** True when `/usage` was read and parsed into at least one limit bar. */
  available: z.boolean(),
  /** The opening line (e.g. "You are currently using your subscription…"), if any. */
  headline: z.string().nullable(),
  /** The percentage bars (session, weekly, per-model). */
  limits: z.array(usageLimitSchema),
  /** Claude's own approximation disclaimer, if present. */
  note: z.string().nullable(),
  /** The full raw `/usage` text for a details view. */
  raw: z.string(),
  /** ISO timestamp of when this snapshot was captured. */
  capturedAt: z.string(),
  /** A human, next-step error message when usage couldn't be read (else null). */
  error: z.string().nullable()
});
const profilePreferencesSchema = z.object({
  framework: z.string().optional(),
  language: z.string().optional(),
  styling: z.string().optional(),
  testRunner: z.string().optional(),
  /** A default Figma variable-collection name to pre-fill for Figma sources. */
  figmaTokenCollection: z.string().optional()
});
const profileSchema = z.object({
  /** Display name; used to address the user when they chat with the AI. */
  name: z.string().default(""),
  /** Optional avatar image as a data: URL (stored inline; no external fetch). */
  avatarDataUrl: z.string().nullable().default(null),
  /** Default answers that pre-fill the intake/setup wizard for new projects. */
  preferences: profilePreferencesSchema.default({})
});
const EMPTY_PROFILE = { name: "", avatarDataUrl: null, preferences: {} };
const taskAuthSchema = z.object({
  provider: z.literal("jira"),
  /** The Jira/Atlassian CLI is installed. */
  cliInstalled: z.boolean(),
  /** The CLI is configured/authenticated (a login exists). */
  configured: z.boolean(),
  /** The logged-in account (email/username), when known. */
  account: z.string().nullable(),
  /** Known sites/accounts, for the multi-account picker. */
  sites: z.array(z.string()),
  /** A shell command that would install the CLI (shown before running, with permission). */
  installCommand: z.string().nullable(),
  /** A human next-step when not installed/configured. */
  hint: z.string().nullable()
});
const taskProjectSchema = z.object({ key: z.string(), name: z.string() });
const taskIssueSchema = z.object({
  key: z.string(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.string().nullable()
});
const taskResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  key: z.string().nullable().optional(),
  url: z.string().nullable().optional()
});
const issueTypeSchema = z.enum(["Story", "Task", "Bug"]);
const createIssueRequestSchema = z.object({
  project: z.string().min(1),
  type: issueTypeSchema,
  summary: z.string().min(1),
  description: z.string().optional()
});
const createFromSpecRequestSchema = z.object({
  projectPath: z.string(),
  project: z.string().min(1),
  type: issueTypeSchema,
  /** Project-relative path to the spec that becomes the story body. */
  specPath: z.string().min(1),
  /** The ref (component/screen name) to link the created issue to. */
  ref: z.string().min(1)
});
z.object({ projectPath: z.string() });
const issueLinksSchema = z.record(z.string(), z.string());
const gitChangeStatusSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "typechange",
  "untracked",
  "conflicted"
]);
const gitChangeSchema = z.object({
  path: z.string(),
  status: gitChangeStatusSchema
});
const gitStatusSchema = z.object({
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  /** Staged (index) changes. */
  staged: z.array(gitChangeSchema),
  /** Unstaged (worktree) changes to tracked files. */
  unstaged: z.array(gitChangeSchema),
  /** Untracked file paths. */
  untracked: z.array(z.string()),
  /** Paths with merge conflicts. */
  conflicts: z.array(z.string()),
  clean: z.boolean()
});
const gitBranchSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.boolean(),
  upstream: z.string().nullable()
});
const gitRemoteSchema = z.object({ name: z.string(), url: z.string() });
const gitLogEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  date: z.string()
});
const gitResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  /** A URL produced by the op (repo/PR), when applicable. */
  url: z.string().nullable().optional()
});
const providerIdSchema = z.enum(["github", "gitlab", "bitbucket"]);
const repoVisibilitySchema = z.enum(["private", "public", "internal"]);
const repoCreateRequestSchema = z.object({
  projectPath: z.string(),
  /** Which provider to create on (from the picker); defaults to the resolved provider. */
  providerId: providerIdSchema.optional(),
  name: z.string().min(1),
  visibility: repoVisibilitySchema,
  description: z.string().optional()
});
const prCreateRequestSchema = z.object({
  projectPath: z.string(),
  base: z.string().optional(),
  title: z.string().min(1),
  body: z.string().optional()
});
const accountSwitchRequestSchema = z.object({ projectPath: z.string(), account: z.string().min(1) });
const importRequestSchema = z.object({
  projectPath: z.string(),
  url: z.string().min(1),
  branch: z.string().optional()
});
const publishRequestSchema = z.object({
  projectPath: z.string(),
  branch: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional()
});
const providerAuthSchema = z.object({
  provider: providerIdSchema,
  cliInstalled: z.boolean(),
  authenticated: z.boolean(),
  /** Logged-in accounts (for the multi-account picker); [] when none. */
  accounts: z.array(z.string()),
  /** The active account, when known. */
  activeAccount: z.string().nullable(),
  /** A human next-step when not installed/authed. */
  hint: z.string().nullable()
});
const gitCommitRequestSchema = z.object({ projectPath: z.string(), message: z.string().min(1) });
const gitPathsRequestSchema = z.object({ projectPath: z.string(), paths: z.array(z.string()) });
const gitBranchRequestSchema = z.object({ projectPath: z.string(), name: z.string().min(1) });
const stageKindSchema = z.enum([
  "source",
  "components",
  "input",
  "intake",
  "agent",
  "verify",
  "manifest"
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
  /** not required for the flow to be considered complete (e.g. publishing to
   *  GitHub). Optional stages can be run/skipped freely and never block. */
  optional: z.boolean().optional(),
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
const detectedComponentsSchema = z.array(detectedComponentSchema);
const COMPONENTS_MANIFEST = ".sdd-de/components.json";
const flowStateSchema = z.object({
  currentStageId: z.string(),
  stages: z.array(stageStateSchema),
  /** Opt-in GitHub publish target (a repo URL). Only the URL is stored — never
   *  credentials; the push runs through the user's own git/gh in the commit stage. */
  publishRepoUrl: z.string().optional()
});
const flowSchema = z.object({
  definitions: z.array(stageDefSchema),
  state: flowStateSchema
});
const runStageSummarySchema = z.object({
  name: z.string(),
  decision: z.string(),
  status: z.enum(["done", "review", "cancelled", "pending"])
});
const runSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  outcome: z.enum(["running", "in-review", "passed", "cancelled", "failed", "in-progress"]),
  updatedAt: z.string(),
  stages: z.array(runStageSummarySchema),
  artifacts: z.array(z.string())
});
const runHistoryResultSchema = z.object({ runs: z.array(runSummarySchema) });
const DEFAULT_FLOW = [
  {
    id: "design-system",
    title: "Design system",
    summary: "Connect to your configured design source (e.g. the Figma file), extract design tokens + variables, and detect every component — no brief needed.",
    kind: "source",
    gated: true,
    artifact: COMPONENTS_MANIFEST,
    promptTemplate: 'Read .sdd-de/project.yaml for `design_source` and the project configuration (framework, language, token_file, component_dir). Connect to the configured source — do NOT ask for a brief; the design source is the input.\n\nFor `design_source: figma`, use the Figma MCP to read the file at `figma_file_url` and the variable collection named `figma_token_collection`.\n\nFor `design_source: github` (a repository imported into this project), the repo\'s own files ARE the source: scan them for the design system — read its existing token definitions (CSS variables, Tailwind/theme config, SCSS/JS token files) and its component library, and reconcile them into the configured `token_file` and inventory. Do not fetch anything remotely; read the files on disk.\n\n1. Extract every design token and variable from the source into the configured `token_file`.\n2. Detect every component in the design system and write `.sdd-de/components.json` — a JSON array of objects `{ "name": string, "level": "atom"|"molecule"|"organism", "description": string }`, ordered tokens → atoms → molecules → organisms.\n\nDo NOT implement the components yet — this stage only extracts tokens and detects the inventory.',
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
    summary: "/sync-tokens — reconcile the token-decisions log and token files with the decisions made during implementation.",
    kind: "agent",
    gated: false,
    // Write the decisions log to `.sdd-de/design-decisions.md`, NOT `design.md`:
    // on case-insensitive macOS `design.md` is the same file as the Google-format
    // `DESIGN.md`, so writing there would clobber the manifest.
    promptTemplate: "/sync-tokens\n\nRun the sync-tokens skill: reconcile token files with the implementation and maintain the token-decisions log at `.sdd-de/design-decisions.md` (NOT `design.md` — on macOS that collides with the Google-format DESIGN.md). No undocumented deviations.",
    allowedTools: ["Read", "Write", "Edit"]
  },
  {
    id: "design-manifest",
    title: "Design manifest",
    summary: "/design-doc — generate DESIGN.md: the tokens, component contracts, and conventions any AI coding agent reads to build on-brand screens. Review and approve before publishing.",
    kind: "manifest",
    gated: true,
    // The design-doc skill writes DESIGN.md at the project root (reader also
    // tolerates .sdd-de/design.md). Surface it for the approval gate.
    artifact: "DESIGN.md",
    promptTemplate: "/design-doc\n\nRun the design-doc skill: generate and validate DESIGN.md with @google/design.md, capturing every design token, component contract (props, states, tokens consumed), and convention as the AI hand-off file. Install @google/design.md if it is missing. Do not modify the components themselves.",
    allowedTools: ["Read", "Write", "Edit", "Bash"]
  },
  {
    id: "commit",
    title: "Commit & publish",
    summary: "Optional — keep everything local, or connect a GitHub repo and publish from here using your own git/gh.",
    kind: "agent",
    gated: false,
    optional: true,
    promptTemplate: "/commit\n\nRun the commit skill: commit the changes and open a PR whose description is the component spec, with the Figma link and QA screenshots. No direct pushes to main.",
    allowedTools: ["Read", "Bash"]
  }
];
const devServerStateSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "error",
  "no-script"
]);
const devServerStatusSchema = z.object({
  state: devServerStateSchema,
  /** The detected local URL once the server is up. */
  url: z.string().nullable(),
  /** The package.json script being run (e.g. "dev", "storybook"). */
  script: z.string().nullable(),
  /** A human message for error / no-script states. */
  message: z.string().nullable()
});
const serverKindSchema = z.enum(["storybook", "app"]);
const DEV_SERVER_UPDATE_CHANNEL = "devserver:update";
z.object({
  projectPath: z.string(),
  kind: serverKindSchema.default("storybook"),
  status: devServerStatusSchema
});
const manifestFormatSchema = z.enum(["google", "decisions-log", "empty"]);
const manifestResultSchema = z.object({
  /** Project-relative path of the resolved manifest, or the default target when absent. */
  path: z.string(),
  /** Manifest markdown, or "" when it does not exist yet. */
  content: z.string(),
  exists: z.boolean(),
  /** Detected format, so the UI can flag a non-Google-format manifest. */
  format: manifestFormatSchema.optional()
});
const manifestVersionSchema = z.object({
  /** Snapshot id — the ISO-ish timestamp used as the file stem. */
  id: z.string(),
  /** ISO timestamp the snapshot was taken. */
  timestamp: z.string(),
  /** Whether this snapshot was captured at an approval. */
  approved: z.boolean(),
  /** The run id that produced it, if it came from a generate/regenerate. */
  runId: z.string().optional(),
  /** Byte length of the snapshot content, for the version list. */
  size: z.number()
});
const manifestVersionsResultSchema = z.object({
  versions: z.array(manifestVersionSchema)
});
z.enum(["generate", "edit", "approve", "restore"]);
const updateInfoSchema = z.object({
  /** The running app version (e.g. "0.1.0"). */
  current: z.string(),
  /** The latest released version, or null if the check couldn't reach GitHub. */
  latest: z.string().nullable(),
  /** True when `latest` is newer than `current`. */
  hasUpdate: z.boolean(),
  /** The release page URL (for "What's new"). */
  releaseUrl: z.string().nullable(),
  /** Direct download URL of the macOS .dmg asset, if present. */
  downloadUrl: z.string().nullable()
});
const fsEntrySchema = z.object({
  name: z.string(),
  /** path relative to the workspace root, using "/" separators */
  path: z.string(),
  type: z.enum(["file", "dir"])
});
const fsFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  /** true when the file was binary or too large to read as text */
  truncated: z.boolean()
});
const fsWriteResultSchema = z.object({
  ok: z.boolean(),
  message: z.string()
});
const WORKSPACE_CHANGE_CHANNEL = "workspace:change";
z.object({
  projectPath: z.string(),
  path: z.string().nullable(),
  kind: z.enum(["add", "change", "unlink", "refresh"])
});
const TERMINAL_DATA_CHANNEL = "terminal:data";
z.object({
  id: z.string(),
  data: z.string(),
  /** set on the final event when the shell process exits */
  exit: z.number().nullable().optional()
});
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
const tokenTypeSchema = z.enum([
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "other"
]);
const tokenSourceSchema = z.enum([
  "figma-variable",
  "generated-code",
  "hand-edited"
]);
const tokenDriftSchema = z.enum(["in-sync", "drifted"]);
const inspectorTokenSchema = z.object({
  /** CSS custom-property name without the leading `--` (e.g. `color-primary`). */
  name: z.string(),
  type: tokenTypeSchema,
  /** Raw value as written in the token file (may be a `var(--other)` reference). */
  rawValue: z.string(),
  /** Value with in-file `var(--x)` references resolved, for display/swatches. */
  resolvedValue: z.string(),
  source: tokenSourceSchema,
  /** How many component source references this token (best-effort var() scan). */
  uses: z.number(),
  /** The matched Figma variable's resolved value, when a Figma export is present. */
  figmaValue: z.string().optional(),
  /** In-sync/drifted vs the matched Figma variable; absent when unmatched/no export. */
  drift: tokenDriftSchema.optional()
});
const figmaVariableSchema = z.object({
  name: z.string(),
  resolvedValue: z.string(),
  type: tokenTypeSchema.optional(),
  collection: z.string().optional()
});
const tokenUsageSchema = z.object({
  component: z.string(),
  property: z.string().optional()
});
const inspectorTokensResultSchema = z.object({
  /** Project-relative path of the token file that was parsed, or null if none. */
  tokenFile: z.string().nullable(),
  tokens: z.array(inspectorTokenSchema),
  /** token name → components/props that reference it (for the detail drawer). */
  usage: z.record(z.string(), z.array(tokenUsageSchema)),
  /** Figma variables with no matching code token (present only after a Figma sync). */
  figmaOnly: z.array(figmaVariableSchema).default([]),
  /** Whether a `.vortspec/figma-variables.json` export was found and reconciled. */
  figmaSynced: z.boolean().default(false)
});
const propControlSchema = z.object({
  key: z.string(),
  kind: z.enum(["enum", "boolean", "text"]),
  /** Options for an enum control. */
  options: z.array(z.string()).default([]),
  /** Default value from the component's defaultVariants, if any. */
  defaultValue: z.string().optional()
});
const componentStatusSchema = z.enum(["verified", "has-issues", "built", "unknown"]);
const inspectorComponentSchema = z.object({
  name: z.string(),
  level: z.enum(["atom", "molecule", "organism"]).optional(),
  description: z.string().optional(),
  /** Project-relative path of the component's source file, or null if not found. */
  file: z.string().nullable(),
  props: z.array(propControlSchema),
  /** Token names the component references (best-effort scan of its source). */
  tokens: z.array(z.string()),
  status: componentStatusSchema,
  /** Open issues from the visual-verify report, if any. */
  issues: z.array(z.string()),
  /** Project-relative path of the component's spec dir/file, if one exists. */
  specPath: z.string().nullable(),
  /** Project-relative path of the visual-verify report, if one exists. */
  reportPath: z.string().nullable()
});
const inspectorComponentsResultSchema = z.object({
  componentDir: z.string().nullable(),
  /** The dev-server URL to embed for live preview, if one is configured/known. */
  previewUrl: z.string().nullable(),
  components: z.array(inspectorComponentSchema)
});
const fileSnapshotSchema = z.object({ path: z.string(), content: z.string() });
const fileSnapshotListSchema = z.array(fileSnapshotSchema);
const findingSeveritySchema = z.enum(["error", "warning", "info"]);
const verificationFindingSchema = z.object({
  /** Stable id: `<component>:<raw id>` (e.g. `callout:D2`). */
  id: z.string(),
  /** Short raw id from the report (e.g. `D2`, `O-A`). */
  rawId: z.string(),
  component: z.string(),
  group: z.enum(["visual", "adversarial"]),
  severity: findingSeveritySchema,
  title: z.string(),
  detail: z.string(),
  /** A referenced file/token from the finding, if one was found. */
  ref: z.string().optional(),
  status: z.enum(["open", "resolved"]),
  /** Project-relative path of the report the finding came from. */
  reportPath: z.string()
});
const verificationResultSchema = z.object({
  findings: z.array(verificationFindingSchema)
});
const storybookEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  name: z.string(),
  type: z.enum(["docs", "story"]),
  importPath: z.string().optional()
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
  "claude-login",
  "figma-mcp"
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
  "system:checkUpdate": { request: z.void(), response: updateInfoSchema },
  "env:check": { request: z.void(), response: envReportSchema },
  "env:verifyLogin": { request: z.void(), response: envCheckSchema },
  "env:verifyFigmaMcp": { request: z.void(), response: envCheckSchema },
  "env:openInstall": { request: z.string().url(), response: z.void() },
  "workspace:pickFolder": {
    request: z.object({ create: z.boolean().default(false) }).optional(),
    response: projectSchema.nullable()
  },
  "workspace:createFolder": { request: z.void(), response: projectSchema.nullable() },
  "workspace:listProjects": { request: z.void(), response: projectListSchema },
  "workspace:openFolder": { request: z.string(), response: z.void() },
  "workspace:revealPath": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.void()
  },
  "workspace:refreshProject": { request: z.string(), response: projectSchema },
  "workspace:createProject": {
    request: z.object({ path: z.string(), answers: setupAnswersSchema }),
    response: projectSchema
  },
  "workspace:listDir": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.array(fsEntrySchema)
  },
  "workspace:readFile": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: fsFileSchema
  },
  "workspace:writeFile": {
    request: z.object({ projectPath: z.string(), relPath: z.string(), content: z.string() }),
    response: fsWriteResultSchema
  },
  "workspace:watchStart": { request: z.string(), response: z.void() },
  "workspace:watchStop": { request: z.string(), response: z.void() },
  "git:fileAtHead": {
    request: z.object({ projectPath: z.string(), relPath: z.string() }),
    response: z.string().nullable()
  },
  "terminal:create": {
    request: z.object({
      id: z.string(),
      projectPath: z.string(),
      cols: z.number().optional(),
      rows: z.number().optional()
    }),
    response: z.void()
  },
  "terminal:write": {
    request: z.object({ id: z.string(), data: z.string() }),
    response: z.void()
  },
  "terminal:resize": {
    request: z.object({ id: z.string(), cols: z.number(), rows: z.number() }),
    response: z.void()
  },
  "terminal:kill": { request: z.string(), response: z.void() },
  "toolkit:status": { request: z.string(), response: toolkitStatusSchema },
  "toolkit:install": { request: z.string(), response: toolkitStatusSchema },
  "agent:startRun": {
    request: agentRunOptionsSchema,
    response: z.object({ runId: z.string() })
  },
  "agent:cancelRun": { request: z.string(), response: z.void() },
  "agent:hasActiveRun": { request: z.string(), response: z.boolean() },
  "agent:lastRun": { request: z.string(), response: lastRunSchema.nullable() },
  "usage:get": { request: z.void(), response: usageResultSchema },
  // Git (M1) — additive only; no delete/force channels exist.
  "git:status": { request: z.string(), response: gitStatusSchema },
  "git:branches": { request: z.string(), response: z.array(gitBranchSchema) },
  "git:remotes": { request: z.string(), response: z.array(gitRemoteSchema) },
  "git:log": { request: z.string(), response: z.array(gitLogEntrySchema) },
  "git:stage": { request: gitPathsRequestSchema, response: gitResultSchema },
  "git:unstage": { request: gitPathsRequestSchema, response: gitResultSchema },
  "git:commit": { request: gitCommitRequestSchema, response: gitResultSchema },
  "git:checkout": { request: gitBranchRequestSchema, response: gitResultSchema },
  "git:createBranch": { request: gitBranchRequestSchema, response: gitResultSchema },
  "git:fetch": { request: z.string(), response: gitResultSchema },
  "git:pull": { request: z.string(), response: gitResultSchema },
  "git:push": { request: z.string(), response: gitResultSchema },
  "git:init": { request: z.string(), response: gitResultSchema },
  "provider:auth": { request: z.string(), response: providerAuthSchema },
  "provider:switchAccount": { request: accountSwitchRequestSchema, response: gitResultSchema },
  "provider:createRepo": { request: repoCreateRequestSchema, response: gitResultSchema },
  "provider:createPR": { request: prCreateRequestSchema, response: gitResultSchema },
  "git:import": { request: importRequestSchema, response: gitResultSchema },
  "provider:publish": { request: publishRequestSchema, response: gitResultSchema },
  // Tasks (Jira, M7)
  "task:auth": { request: z.void(), response: taskAuthSchema },
  "task:install": { request: z.void(), response: taskResultSchema },
  "task:projects": { request: z.void(), response: z.array(taskProjectSchema) },
  "task:createIssue": { request: createIssueRequestSchema, response: taskResultSchema },
  "task:createFromSpec": { request: createFromSpecRequestSchema, response: taskResultSchema },
  "task:links": { request: z.string(), response: issueLinksSchema },
  "task:issueStatus": { request: z.string(), response: taskIssueSchema },
  "profile:get": { request: z.void(), response: profileSchema },
  "profile:save": { request: profileSchema, response: profileSchema },
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
  "flow:getHistory": { request: z.string(), response: runHistoryResultSchema },
  "devserver:start": { request: z.string(), response: devServerStatusSchema },
  "devserver:stop": { request: z.string(), response: z.void() },
  "devserver:status": { request: z.string(), response: devServerStatusSchema },
  "appserver:start": { request: z.string(), response: devServerStatusSchema },
  "appserver:stop": { request: z.string(), response: z.void() },
  "appserver:status": { request: z.string(), response: devServerStatusSchema },
  "devserver:previewInfo": {
    request: z.string(),
    response: z.object({ hasStorybook: z.boolean(), script: z.string().nullable() })
  },
  "devserver:storybookIndex": {
    request: z.string(),
    response: z.array(storybookEntrySchema)
  },
  "manifest:get": { request: z.string(), response: manifestResultSchema },
  "manifest:save": {
    request: z.object({ projectPath: z.string(), content: z.string() }),
    response: manifestResultSchema
  },
  "manifest:listVersions": { request: z.string(), response: manifestVersionsResultSchema },
  "manifest:readVersion": {
    request: z.object({ projectPath: z.string(), id: z.string() }),
    response: z.string().nullable()
  },
  "manifest:restoreVersion": {
    request: z.object({ projectPath: z.string(), id: z.string() }),
    response: manifestResultSchema
  },
  "manifest:snapshot": {
    request: z.object({
      projectPath: z.string(),
      reason: z.enum(["generate", "edit", "approve", "restore"]),
      runId: z.string().optional()
    }),
    response: manifestResultSchema
  },
  "flow:setPublishTarget": {
    request: z.object({ projectPath: z.string(), repoUrl: z.string() }),
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
  },
  "inspector:getTokens": {
    request: z.string(),
    response: inspectorTokensResultSchema
  },
  "inspector:getComponents": {
    request: z.string(),
    response: inspectorComponentsResultSchema
  },
  "inspector:setTokenValue": {
    request: z.object({
      projectPath: z.string(),
      name: z.string(),
      value: z.string()
    }),
    response: inspectorTokensResultSchema
  },
  "inspector:getVerification": {
    request: z.string(),
    response: verificationResultSchema
  },
  "inspector:snapshotComponent": {
    request: z.object({ projectPath: z.string(), file: z.string() }),
    response: fileSnapshotListSchema
  },
  "inspector:snapshotTokenScope": {
    request: z.string(),
    response: fileSnapshotListSchema
  },
  "inspector:restoreFiles": {
    request: z.object({ projectPath: z.string(), files: fileSnapshotListSchema }),
    response: z.void()
  }
};
function execFileSafe(command, args, opts = {}) {
  return new Promise((resolve2) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve2(result);
    };
    const timer = opts.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      settle({ code: null, stdout, stderr, timedOut: true });
    }, opts.timeoutMs) : null;
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      settle({ code: null, stdout, stderr, timedOut, spawnError: err.message });
    });
    child.on("close", (code) => {
      settle({ code, stdout, stderr, timedOut });
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
const FIGMA_ADD = {
  kind: "install-link",
  label: "Add Figma MCP",
  url: "https://code.claude.com/docs/en/mcp"
};
const FIGMA_CONNECT = {
  kind: "install-link",
  label: "Connect Figma",
  url: "https://claude.ai/customize/connectors"
};
const VERIFY_FIGMA = { kind: "verify", label: "Verify" };
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
function pendingFigmaMcp() {
  return {
    id: "figma-mcp",
    label: "Figma MCP",
    status: "unknown",
    detail: "Not verified yet",
    fix: VERIFY_FIGMA
  };
}
async function verifyFigmaMcp() {
  const r = await execFileSafe("claude", ["mcp", "list"], { timeoutMs: 2e4 });
  if (r.spawnError || r.code !== 0) {
    return {
      id: "figma-mcp",
      label: "Figma MCP",
      status: "unknown",
      detail: "Could not list MCP servers",
      fix: FIGMA_ADD
    };
  }
  const figma = r.stdout.split("\n").filter((l) => /figma/i.test(l));
  if (figma.length === 0) {
    return {
      id: "figma-mcp",
      label: "Figma MCP",
      status: "unknown",
      detail: "Not configured — only needed for Figma design sources",
      fix: FIGMA_ADD
    };
  }
  if (figma.some((l) => /connected|✔/i.test(l) && !/needs authentication/i.test(l))) {
    return { id: "figma-mcp", label: "Figma MCP", status: "pass", detail: "Connected" };
  }
  if (figma.some((l) => /needs authentication|✘|failed/i.test(l))) {
    return {
      id: "figma-mcp",
      label: "Figma MCP",
      status: "fail",
      detail: "Configured but not authenticated",
      fix: FIGMA_CONNECT
    };
  }
  return {
    id: "figma-mcp",
    label: "Figma MCP",
    status: "unknown",
    detail: "Configured (status unclear)",
    fix: FIGMA_CONNECT
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
  const [node, git2, install] = await Promise.all([
    checkNode(),
    checkGit(),
    checkClaudeInstall()
  ]);
  const checks = [node, git2, install, pendingLogin(), pendingFigmaMcp()];
  const ready = [node, git2, install].every((c) => c.status === "pass");
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
    const raw = await readFile$1(registryPath(), "utf8");
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
  await writeFile$1(registryPath(), JSON.stringify(entries, null, 2), "utf8");
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
function revealPath(projectPath, relPath) {
  const target = resolve$1(projectPath, relPath);
  const root = resolve$1(projectPath);
  if (target !== root && !target.startsWith(root + sep)) return;
  shell.showItemInFolder(target);
}
const require$1 = createRequire(import.meta.url);
function toUnpacked(p) {
  if (p.includes(`app.asar.unpacked${sep}`)) return p;
  return p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}
function packageDir() {
  return toUnpacked(dirname(require$1.resolve("@royvillasana/sdd-de/package.json")));
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
  await writeFile$1(join(sddeDir, "project.yaml"), buildProjectYaml(answers), "utf8");
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
    const content = await readFile$1(gitignorePath, "utf8");
    if (!content.includes(".sdd-de")) {
      await appendFile(gitignorePath, "\n# SDD-DE toolkit\n.sdd-de/\n");
    }
  }
  return refreshProject(projectPath);
}
function resolveInside(root, rel) {
  const rootAbs = resolve$1(root);
  const abs = resolve$1(rootAbs, rel);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Path escapes the workspace root.");
  }
  return abs;
}
const IGNORE = /* @__PURE__ */ new Set([".git"]);
const MAX_BYTES = 2e6;
function toPosix(rel) {
  return rel.split(sep).join("/");
}
async function listDir(root, rel) {
  const abs = resolveInside(root, rel);
  const dirents = await promises.readdir(abs, { withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    if (rel === "" && IGNORE.has(d.name)) continue;
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    entries.push({ name: d.name, path: childRel, type: d.isDirectory() ? "dir" : "file" });
  }
  entries.sort(
    (a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
  );
  return entries;
}
async function readFile(root, rel) {
  const abs = resolveInside(root, rel);
  const stat2 = await promises.stat(abs);
  if (stat2.size > MAX_BYTES) return { path: rel, content: "", truncated: true };
  const buf = await promises.readFile(abs);
  if (buf.includes(0)) return { path: rel, content: "", truncated: true };
  return { path: rel, content: buf.toString("utf8"), truncated: false };
}
async function writeFile(root, rel, content) {
  try {
    const abs = resolveInside(root, rel);
    await promises.writeFile(abs, content, "utf8");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not save the file." };
  }
}
const watchers = /* @__PURE__ */ new Map();
function startWatch(sender, root) {
  if (watchers.has(root)) return;
  try {
    const w = watch(root, { recursive: true }, (event, filename) => {
      if (!filename) {
        sender.send(WORKSPACE_CHANGE_CHANNEL, { projectPath: root, path: null, kind: "refresh" });
        return;
      }
      const rel = filename.toString();
      if (rel.split(sep)[0] === ".git") return;
      sender.send(WORKSPACE_CHANGE_CHANNEL, {
        projectPath: root,
        path: toPosix(rel),
        kind: event === "rename" ? "add" : "change"
      });
    });
    watchers.set(root, w);
  } catch {
  }
}
function stopWatch(root) {
  const w = watchers.get(root);
  if (w) {
    w.close();
    watchers.delete(root);
  }
}
function buildShell(platform2 = process.platform, env = process.env) {
  if (platform2 === "win32") return { file: env.COMSPEC || "powershell.exe", args: [] };
  return { file: env.SHELL || "/bin/zsh", args: [] };
}
const sessions = /* @__PURE__ */ new Map();
function createSession(sender, opts) {
  if (sessions.has(opts.id)) return;
  const { file, args } = buildShell();
  const pty = spawn$1(file, args, {
    name: "xterm-color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    cwd: opts.cwd,
    env: process.env
  });
  pty.onData((data) => sender.send(TERMINAL_DATA_CHANNEL, { id: opts.id, data }));
  pty.onExit(({ exitCode }) => {
    sessions.delete(opts.id);
    sender.send(TERMINAL_DATA_CHANNEL, { id: opts.id, data: "", exit: exitCode });
  });
  sessions.set(opts.id, pty);
}
function writeSession(id, data) {
  sessions.get(id)?.write(data);
}
function resizeSession(id, cols, rows) {
  try {
    sessions.get(id)?.resize(Math.max(1, cols), Math.max(1, rows));
  } catch {
  }
}
function killSession(id) {
  const pty = sessions.get(id);
  if (pty) {
    try {
      pty.kill();
    } catch {
    }
    sessions.delete(id);
  }
}
function killAllSessions() {
  for (const pty of sessions.values()) {
    try {
      pty.kill();
    } catch {
    }
  }
  sessions.clear();
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
    text = await readFile$1(join(projectPath, ".sdd-de", "project.yaml"), "utf8");
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
const FIGMA_VARS_PATH = ".vortspec/figma-variables.json";
function normName(name) {
  return name.replace(/^--/, "").trim().toLowerCase().replace(/[\s/._]+/g, "-").replace(/-+/g, "-");
}
function normValue(value) {
  let s = value.trim().toLowerCase().replace(/\s+/g, " ");
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
    s = `#${h}`;
  }
  return s;
}
async function readFigmaVariables(projectPath) {
  let raw;
  try {
    raw = await readFile$1(join(projectPath, FIGMA_VARS_PATH), "utf8");
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const rows = Array.isArray(data) ? data : data && typeof data === "object" ? Object.entries(data).map(([name, value]) => ({ name, value })) : [];
  const vars = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row;
    const name = typeof r.name === "string" ? r.name : null;
    const value = r.resolvedValue ?? r.value ?? r.resolved ?? r.val;
    if (!name || value == null) continue;
    const parsed = figmaVariableSchema.safeParse({
      name,
      resolvedValue: String(value),
      type: r.type,
      collection: r.collection
    });
    if (parsed.success) vars.push(parsed.data);
  }
  return vars;
}
function reconcile$1(tokens, figmaVars) {
  const codeByNorm = /* @__PURE__ */ new Map();
  for (const t of tokens) codeByNorm.set(normName(t.name), t.resolvedValue);
  const byName = /* @__PURE__ */ new Map();
  const figmaOnly = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of figmaVars) {
    const key = normName(v.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const codeValue = codeByNorm.get(key);
    if (codeValue === void 0) {
      figmaOnly.push(v);
      continue;
    }
    byName.set(key, {
      figmaValue: v.resolvedValue,
      drift: normValue(codeValue) === normValue(v.resolvedValue) ? "in-sync" : "drifted"
    });
  }
  return { byName, figmaOnly };
}
const CSS_VAR = /--([\w-]+)\s*:\s*([^;]+);/g;
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla|oklch|color)\(/i;
const CSS_COLOR_KEYWORDS = /* @__PURE__ */ new Set([
  "white",
  "black",
  "transparent",
  "currentcolor",
  "red",
  "green",
  "blue",
  "gray",
  "grey"
]);
function looksLikeColor(value) {
  const v = value.trim().toLowerCase();
  return HEX.test(v) || COLOR_FN.test(v) || CSS_COLOR_KEYWORDS.has(v);
}
function classify(name, resolvedValue) {
  const n = name.toLowerCase();
  if (/(^|[-/])(radius)([-/]|$)/.test(n)) return "radius";
  if (/(^|[-/])(shadow|elevation)([-/]|$)/.test(n)) return "shadow";
  if (/(^|[-/])(spacing|space|gap|size-)/.test(n) && !/font/.test(n)) return "spacing";
  if (/(font|line-height|letter|weight|leading|tracking|family|type)/.test(n))
    return "typography";
  if (/(color|colour|bg|background|foreground|border|text|fill|stroke|primary|secondary|accent|status|neutral|surface|muted)/.test(n))
    return "color";
  if (looksLikeColor(resolvedValue)) return "color";
  return "other";
}
function resolve(value, table, depth = 0) {
  if (depth > 10) return value;
  const match = value.trim().match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if (!match) return value.trim();
  const referenced = table.get(match[1]);
  if (referenced !== void 0) return resolve(referenced, table, depth + 1);
  return (match[2] ?? value).trim();
}
function parseTokensFromCss(css) {
  const raw = /* @__PURE__ */ new Map();
  for (const m of css.matchAll(CSS_VAR)) {
    raw.set(m[1], m[2].trim());
  }
  const tokens = [];
  for (const [name, rawValue] of raw) {
    const resolvedValue = resolve(rawValue, raw);
    tokens.push({ name, rawValue, resolvedValue, type: classify(name, resolvedValue) });
  }
  return tokens;
}
const SOURCE_EXTS$1 = /* @__PURE__ */ new Set([".tsx", ".jsx", ".ts", ".vue", ".svelte", ".css", ".scss"]);
async function collectSources(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (SOURCE_EXTS$1.has(extname(entry.name)) && !entry.name.endsWith(".variants.ts")) {
        const text = await readFile$1(full, "utf8").catch(() => "");
        if (text) out.push({ component: basename(entry.name, extname(entry.name)), text });
      }
    }
  }
  await walk(dir);
  return out;
}
function deriveProperty(text, at) {
  const before = text.slice(Math.max(0, at - 48), at);
  const tw = before.match(/([a-z][a-z-]*)-\[(?:var\()?$/);
  if (tw) return tw[1];
  const css = before.match(/([a-zA-Z-]+)\s*:\s*(?:var\()?$/);
  if (css) return css[1];
  return void 0;
}
function buildUsage(tokenNames, sources) {
  const usage = {};
  const names = new Set(tokenNames);
  for (const { component, text } of sources) {
    const seen = /* @__PURE__ */ new Set();
    for (const m of text.matchAll(/--([\w-]+)(?![\w-])/g)) {
      const name = m[1];
      if (!names.has(name) || seen.has(name)) continue;
      seen.add(name);
      const property = deriveProperty(text, m.index ?? 0);
      (usage[name] ??= []).push(property ? { component, property } : { component });
    }
  }
  return usage;
}
const OVERRIDES_PATH = ".vortspec/token-overrides.json";
async function readOverrides(projectPath) {
  try {
    const raw = await readFile$1(join(projectPath, OVERRIDES_PATH), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
  } catch {
  }
  return /* @__PURE__ */ new Set();
}
async function markOverridden(projectPath, name) {
  const set = await readOverrides(projectPath);
  set.add(name);
  const path = join(projectPath, OVERRIDES_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => void 0);
  await writeFile$1(path, `${JSON.stringify([...set].sort(), null, 2)}
`, "utf8").catch(
    () => void 0
  );
}
async function getInspectorTokens(projectPath) {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  if (!tokenFile) return { tokenFile: null, tokens: [], usage: {}, figmaOnly: [], figmaSynced: false };
  let css;
  try {
    css = await readFile$1(join(projectPath, tokenFile), "utf8");
  } catch {
    return { tokenFile, tokens: [], usage: {}, figmaOnly: [], figmaSynced: false };
  }
  const parsed = parseTokensFromCss(css);
  const sources = config?.componentDir ? await collectSources(join(projectPath, config.componentDir)) : [];
  const usage = buildUsage(
    parsed.map((t) => t.name),
    sources
  );
  const edited = await readOverrides(projectPath);
  const figmaVars = await readFigmaVariables(projectPath);
  const recon = figmaVars ? reconcile$1(parsed, figmaVars) : null;
  const tokens = parsed.map((t) => {
    const match = recon?.byName.get(normName(t.name));
    const source = edited.has(t.name) ? "hand-edited" : match ? "figma-variable" : "generated-code";
    return {
      ...t,
      source,
      uses: usage[t.name]?.length ?? 0,
      figmaValue: match?.figmaValue,
      drift: match?.drift
    };
  });
  return {
    tokenFile,
    tokens,
    usage,
    figmaOnly: recon?.figmaOnly ?? [],
    figmaSynced: figmaVars !== null
  };
}
async function setInspectorTokenValue(projectPath, name, value) {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile;
  if (tokenFile) {
    const path = join(projectPath, tokenFile);
    const css = await readFile$1(path, "utf8").catch(() => null);
    if (css) {
      const re = new RegExp(`(--${name}\\s*:\\s*)([^;]*)(;)`);
      if (re.test(css)) {
        await writeFile$1(path, css.replace(re, `$1${value.trim()}$3`), "utf8");
        await markOverridden(projectPath, name);
      }
    }
  }
  return getInspectorTokens(projectPath);
}
async function snapshotTokenScope(projectPath) {
  const config = await readProjectConfig(projectPath);
  const snaps = [];
  const seen = /* @__PURE__ */ new Set();
  async function capture(rel) {
    if (seen.has(rel)) return;
    seen.add(rel);
    const content = await readFile$1(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) snaps.push({ path: rel, content });
  }
  if (config?.tokenFile) await capture(config.tokenFile);
  if (config?.componentDir) {
    const root = join(projectPath, config.componentDir);
    async function walk(d) {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (SOURCE_EXTS$1.has(extname(entry.name))) await capture(full.slice(projectPath.length + 1));
      }
    }
    await walk(root);
  }
  return snaps;
}
const SOURCE_EXTS = [".tsx", ".jsx", ".vue", ".svelte", ".ts"];
function balanced(src, from) {
  const open = src.indexOf("{", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(open + 1, i), end: i };
    }
  }
  return null;
}
function stripStrings(s) {
  return s.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
function parseProps(src) {
  const vIdx = src.search(/\bvariants\s*:/);
  if (vIdx < 0) return [];
  const vb = balanced(src, vIdx);
  if (!vb) return [];
  const defaults = /* @__PURE__ */ new Map();
  const dIdx = src.search(/\bdefaultVariants\s*:/);
  if (dIdx >= 0) {
    const db = balanced(src, dIdx);
    if (db) {
      for (const m of stripStrings(db.body).matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
        const valMatch = db.body.match(
          new RegExp(`${m[1]}\\s*:\\s*['"]([^'"]+)['"]`)
        );
        if (valMatch) defaults.set(m[1], valMatch[1]);
      }
    }
  }
  const props = [];
  for (const m of vb.body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}/g)) {
    const key = m[1];
    const options = [];
    for (const om of stripStrings(m[2]).matchAll(
      /(['"]?)([A-Za-z_$][\w$-]*|true|false)\1\s*:/g
    )) {
      options.push(om[2]);
    }
    if (options.length === 0) continue;
    const isBool = options.every((o) => o === "true" || o === "false");
    props.push({
      key,
      kind: isBool ? "boolean" : "enum",
      options,
      defaultValue: defaults.get(key)
    });
  }
  return props;
}
async function variantsSibling(projectPath, file) {
  const dir = dirname(file);
  const stem = basename(file).replace(/\.(tsx|jsx|ts)$/, "").toLowerCase();
  const entries = await readdir(join(projectPath, dir)).catch(() => []);
  const hit = entries.find(
    (n) => n.endsWith(".variants.ts") && n.slice(0, -".variants.ts".length).toLowerCase() === stem
  );
  return hit ? join(dir, hit) : null;
}
async function findSourceFile(dir, name) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findSourceFile(full, name);
      if (found) return found;
    } else if (SOURCE_EXTS.some((ext) => entry.name === `${name}${ext}`)) {
      return full;
    }
  }
  return null;
}
function scanTokens(...sources) {
  const found = /* @__PURE__ */ new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/var\(\s*--([\w-]+)/g)) found.add(m[1]);
  }
  return [...found].sort();
}
async function firstExisting(projectPath, rels) {
  for (const rel of rels) {
    try {
      await readFile$1(join(projectPath, rel), "utf8");
      return rel;
    } catch {
    }
  }
  return null;
}
async function componentStatus(projectPath, name, hasFile) {
  const slug = name.toLowerCase();
  const specPath = await firstExisting(projectPath, [
    join("specs", slug, "spec.md"),
    join("specs", slug, `${slug}.md`),
    join("specs", slug, "README.md")
  ]);
  const reportPath = await firstExisting(projectPath, [
    join("specs", slug, "visual-verify-report.md")
  ]);
  if (!hasFile) return { status: "unknown", issues: [], specPath, reportPath };
  let report;
  try {
    report = reportPath ? await readFile$1(join(projectPath, reportPath), "utf8") : "";
    if (!reportPath) return { status: "built", issues: [], specPath, reportPath };
  } catch {
    return { status: "built", issues: [], specPath, reportPath };
  }
  const hasOpen = /status:\s*open/i.test(report) || /open (discrepanc|source-level)/i.test(report);
  if (hasOpen) {
    const issues = [...report.matchAll(/^###\s+(D\d[^\n]*)/gm)].map((m) => m[1].trim());
    return { status: "has-issues", issues, specPath, reportPath };
  }
  return { status: "verified", issues: [], specPath, reportPath };
}
async function getInspectorComponents(projectPath) {
  const config = await readProjectConfig(projectPath);
  const componentDir = config?.componentDir ?? null;
  let manifest = [];
  try {
    const raw = await readFile$1(join(projectPath, ".sdd-de/components.json"), "utf8");
    const parsed = detectedComponentsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) manifest = parsed.data;
  } catch {
  }
  const root = componentDir ? join(projectPath, componentDir) : projectPath;
  const components = [];
  for (const entry of manifest) {
    const abs = await findSourceFile(root, entry.name);
    const file = abs ? abs.slice(projectPath.length + 1) : null;
    let props = [];
    let tokens = [];
    if (abs && file) {
      const src = await readFile$1(abs, "utf8").catch(() => "");
      const vrel = await variantsSibling(projectPath, file);
      const variantsSrc = vrel ? await readFile$1(join(projectPath, vrel), "utf8").catch(() => "") : "";
      props = parseProps(variantsSrc || src);
      tokens = scanTokens(src, variantsSrc);
    }
    const { status, issues, specPath, reportPath } = await componentStatus(
      projectPath,
      entry.name,
      Boolean(abs)
    );
    components.push({
      name: entry.name,
      level: entry.level,
      description: entry.description,
      file,
      props,
      tokens,
      status,
      issues,
      specPath,
      reportPath
    });
  }
  return { componentDir, previewUrl: null, components };
}
async function snapshotComponent(projectPath, file) {
  const vrel = await variantsSibling(projectPath, file);
  const candidates = [file, ...vrel ? [vrel] : []];
  const snaps = [];
  for (const rel of candidates) {
    const content = await readFile$1(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) snaps.push({ path: rel, content });
  }
  return snaps;
}
async function restoreFiles(projectPath, files) {
  for (const f of files) {
    await writeFile$1(join(projectPath, f.path), f.content, "utf8").catch(() => void 0);
  }
}
const BACKTICK = String.fromCharCode(96);
const CODE_SPAN = new RegExp(BACKTICK, "g");
async function findReports(specsRoot) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "visual-verify-report.md") out.push({ path: full, group: "visual" });
      else if (/adversarial.*\.md$/i.test(entry.name)) out.push({ path: full, group: "adversarial" });
    }
  }
  await walk(specsRoot);
  return out;
}
function firstRef(block) {
  const parts = block.split(BACKTICK);
  for (let i = 1; i < parts.length; i += 2) {
    const s = parts[i];
    if (/[./]/.test(s) && s.length < 60) return s;
  }
  const src = block.match(/\b(src\/[\w./-]+)/);
  return src?.[1];
}
function cleanDetail(block) {
  const line = block.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#") && !l.startsWith("|"));
  if (!line) return "";
  return line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").replace(CODE_SPAN, "").slice(0, 260).trim();
}
function nextHeader(md, from) {
  const idx = md.slice(from + 1).search(/\n#{2,3}\s/);
  return idx < 0 ? md.length : from + 1 + idx;
}
function parseFindings(md, group, component, reportPath) {
  const findings = [];
  const push2 = (rawId, title, detail, severity, block) => {
    const status = /resolved|passed/i.test(block) ? "resolved" : "open";
    findings.push({
      id: component + ":" + rawId,
      rawId,
      component,
      group,
      severity,
      title: title.trim().replace(/\s+·.*$/, ""),
      detail,
      ref: firstRef(block),
      status,
      reportPath
    });
  };
  const dRe = /^###\s+(D\w+)\b[ \t]*[—:-]?[ \t]*(.*)$/gm;
  const dMatches = [...md.matchAll(dRe)];
  for (let i = 0; i < dMatches.length; i++) {
    const m = dMatches[i];
    const start = m.index ?? 0;
    const end = i + 1 < dMatches.length ? dMatches[i + 1].index ?? md.length : nextHeader(md, start);
    const block = md.slice(start, end);
    push2(m[1], m[2] || "Discrepancy", cleanDetail(md.slice(start + m[0].length, end)), "error", block);
  }
  for (const m of md.matchAll(/^-\s+\*\*(O[\w-]*)\b[ \t]*[—:-]?[ \t]*([^*]+?)\*\*[ \t]*(.*)$/gm)) {
    push2(m[1], m[2], (m[3] || "").replace(CODE_SPAN, "").slice(0, 260).trim(), "info", m[0]);
  }
  return findings;
}
async function getVerification(projectPath) {
  const specsRoot = join(projectPath, "specs");
  const reports = await findReports(specsRoot);
  const findings = [];
  for (const { path, group } of reports) {
    const md = await readFile$1(path, "utf8").catch(() => "");
    if (!md) continue;
    const rel = path.slice(projectPath.length + 1);
    const dir = dirname(path);
    const component = dir === specsRoot ? "system" : basename(dir);
    findings.push(...parseFindings(md, group, component, rel));
  }
  return { findings };
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
function newAccumulator() {
  return { files: /* @__PURE__ */ new Set(), isError: false };
}
function lastRunPath(cwd) {
  return join(cwd, ".vortspec", "last-run.json");
}
async function readLastRun(cwd) {
  const raw = await readFile$1(lastRunPath(cwd), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = lastRunSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
async function writeLastRun(cwd, run) {
  const dir = join(cwd, ".vortspec");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile$1(lastRunPath(cwd), JSON.stringify(run, null, 2), "utf8");
  } catch {
  }
}
async function patchLastRun(cwd, patch) {
  const prev = await readLastRun(cwd);
  const next = {
    sessionId: patch.sessionId ?? prev?.sessionId ?? null,
    title: patch.title ?? prev?.title ?? "Run",
    kind: patch.kind ?? prev?.kind,
    label: patch.label ?? prev?.label,
    total: patch.total ?? prev?.total ?? null,
    status: patch.status ?? prev?.status ?? "running",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeLastRun(cwd, next);
}
function runTitle(prompt) {
  const first = prompt.split("\n").find((l) => l.trim()) ?? "Run";
  const cmd = first.trim().match(/^\/([\w-]+)/);
  if (cmd) return cmd[1].replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return first.trim().slice(0, 60);
}
async function recordRun(opts, acc, exitCode) {
  const dir = join(opts.cwd, ".vortspec", "runs");
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    return;
  }
  let seq = 1;
  try {
    seq = (await readdir(dir)).filter((n) => n.endsWith(".json")).length + 1;
  } catch {
  }
  const cancelled = exitCode === null;
  const failed = !cancelled && (acc.isError || exitCode !== 0);
  const title = runTitle(opts.prompt);
  const summary = {
    id: `run-${Date.now()}-${seq}`,
    label: `#${seq}`,
    title,
    outcome: cancelled ? "cancelled" : failed ? "failed" : "passed",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stages: [
      {
        name: title,
        decision: cancelled ? "cancelled" : failed ? "failed" : "completed",
        status: cancelled ? "cancelled" : failed ? "cancelled" : "done"
      }
    ],
    artifacts: [...acc.files].map((f) => basename(f))
  };
  await writeFile$1(join(dir, `${summary.id}.json`), JSON.stringify(summary, null, 2), "utf8").catch(
    () => void 0
  );
}
const runs = /* @__PURE__ */ new Map();
function hasActiveRun(projectPath) {
  for (const { cwd } of runs.values()) if (cwd === projectPath) return true;
  return false;
}
function startRun(sender, opts) {
  const runId = randomUUID();
  const adapter = new AgentAdapter();
  runs.set(runId, { adapter, cwd: opts.cwd });
  const acc = newAccumulator();
  void patchLastRun(opts.cwd, {
    sessionId: opts.resumeSessionId ?? null,
    title: opts.meta?.label ?? runTitle(opts.prompt),
    kind: opts.meta?.kind,
    label: opts.meta?.label,
    total: opts.meta?.total ?? null,
    status: "running"
  });
  adapter.on("event", (raw) => {
    const parsed = runEventSchema.safeParse(raw);
    const event = parsed.success ? parsed.data : { kind: "error", message: "Invalid run event dropped at the boundary" };
    if (event.kind === "tool-use" && event.path) acc.files.add(event.path);
    if (event.kind === "result" && event.isError || event.kind === "error") acc.isError = true;
    if ((event.kind === "system-init" || event.kind === "result") && event.sessionId) {
      if (acc.sessionId !== event.sessionId) {
        acc.sessionId = event.sessionId;
        void patchLastRun(opts.cwd, { sessionId: event.sessionId });
      }
    }
    if (!sender.isDestroyed()) {
      sender.send(AGENT_EVENT_CHANNEL, { runId, event });
    }
    if (event.kind === "exit") {
      runs.delete(runId);
      const status = event.code === null ? "cancelled" : acc.isError || event.code !== 0 ? "failed" : "passed";
      void patchLastRun(opts.cwd, { status });
      void recordRun(opts, acc, event.code);
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
  runs.get(runId)?.adapter.cancel();
}
async function getLastRun(projectPath) {
  const last = await readLastRun(projectPath);
  if (!last) return null;
  if (last.status === "passed") return null;
  if (last.status === "running" && hasActiveRun(projectPath)) return null;
  return last;
}
const LIMIT_RE = /^(.*?):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s*(.+?))?\s*$/;
function parseUsage(text) {
  const lines = text.split("\n");
  const limits = [];
  let headline = null;
  let note = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = LIMIT_RE.exec(trimmed);
    if (m) {
      limits.push({
        label: m[1].trim(),
        percent: Number(m[2]),
        resetsAt: m[3] ? m[3].trim() : null
      });
      continue;
    }
    if (!headline && /using your (subscription|api|claude)/i.test(trimmed)) {
      headline = trimmed;
    }
    if (!note && /^approximate\b/i.test(trimmed)) {
      note = trimmed;
    }
  }
  return { headline, limits, note };
}
const TIMEOUT_MS$1 = 2e4;
function runUsage() {
  return new Promise((resolve2) => {
    let child;
    try {
      child = spawn("claude", ["-p", "/usage", "--output-format", "json"], {
        cwd: homedir(),
        env: process.env,
        shell: false
      });
    } catch {
      resolve2({ ok: false, error: "Couldn't start Claude Code. Is it installed and on your PATH?" });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve2(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, error: "Reading usage timed out. Try again in a moment." });
    }, TIMEOUT_MS$1);
    child.stdout?.on("data", (c) => stdout += c.toString());
    child.stderr?.on("data", (c) => stderr += c.toString());
    child.on("error", () => done({ ok: false, error: "Couldn't run Claude Code. Is it installed and logged in?" }));
    child.on("close", () => {
      try {
        const env = JSON.parse(stdout);
        if (typeof env.result === "string" && env.result.trim()) {
          done({ ok: true, text: env.result });
          return;
        }
      } catch {
      }
      if (stdout.trim()) {
        done({ ok: true, text: stdout });
        return;
      }
      done({
        ok: false,
        error: stderr.trim() ? "Claude Code couldn't report usage. Make sure you're logged in (run `claude` once)." : "No usage data returned by Claude Code."
      });
    });
  });
}
async function getUsage() {
  const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
  const res = await runUsage();
  if (!res.ok) {
    return { available: false, headline: null, limits: [], note: null, raw: "", capturedAt, error: res.error };
  }
  const parsed = parseUsage(res.text);
  return {
    available: parsed.limits.length > 0,
    headline: parsed.headline,
    limits: parsed.limits,
    note: parsed.note,
    raw: res.text,
    capturedAt,
    error: parsed.limits.length > 0 ? null : "Couldn't read usage percentages from Claude Code. Open the details to see its raw output."
  };
}
async function git(cwd, args) {
  const r = await execFileSafe("git", args, { cwd, timeoutMs: 6e4 });
  if (r.spawnError) return { ok: false, stdout: "", stderr: "git is not installed or not on PATH." };
  return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr.trim() };
}
const CODE = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange"
};
function toStatus(code) {
  return CODE[code] ?? "modified";
}
function parseStatus(raw, isRepo2) {
  const status = {
    isRepo: isRepo2,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
    clean: true
  };
  if (!isRepo2) return status;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length).trim();
      status.branch = head === "(detached)" ? null : head;
    } else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const fields = line.split(" ");
      const xy = fields[1];
      const rename = line.startsWith("2 ");
      const rest = fields.slice(rename ? 9 : 8).join(" ");
      const path = rename ? rest.split("	")[0] : rest;
      const x = xy[0];
      const y = xy[1];
      if (x !== ".") status.staged.push({ path, status: toStatus(x) });
      if (y !== ".") status.unstaged.push({ path, status: toStatus(y) });
    } else if (line.startsWith("u ")) {
      const fields = line.split(" ");
      status.conflicts.push(fields.slice(10).join(" "));
    } else if (line.startsWith("? ")) {
      status.untracked.push(line.slice(2));
    }
  }
  status.clean = status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0 && status.conflicts.length === 0;
  return status;
}
function parseBranches(raw, currentUpstream) {
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [name, upstream, head] = line.split("	");
    if (!name || name.includes("HEAD ->")) continue;
    const remote = name.startsWith("origin/") || name.includes("/");
    out.push({
      name,
      current: head === "*",
      remote,
      upstream: upstream || (head === "*" ? currentUpstream : null) || null
    });
  }
  return out;
}
function parseLog(raw) {
  return raw.split("").map((r) => r.trim()).filter(Boolean).map((rec) => {
    const [hash, shortHash, subject, author, date] = rec.split("");
    return { hash, shortHash, subject, author, date };
  });
}
async function isRepo(cwd) {
  const r = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}
async function getStatus(cwd) {
  const repo = await isRepo(cwd);
  if (!repo) return parseStatus("", false);
  const r = await git(cwd, ["status", "--porcelain=v2", "--branch"]);
  return parseStatus(r.stdout, true);
}
async function getBranches(cwd) {
  if (!await isRepo(cwd)) return [];
  const r = await git(cwd, [
    "branch",
    "--all",
    "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)"
  ]);
  return parseBranches(r.stdout, null);
}
async function getRemotes(cwd) {
  if (!await isRepo(cwd)) return [];
  const r = await git(cwd, ["remote", "-v"]);
  const seen = /* @__PURE__ */ new Map();
  for (const line of r.stdout.split("\n")) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line);
    if (m) seen.set(m[1], m[2]);
  }
  return [...seen].map(([name, url]) => ({ name, url }));
}
async function getLog(cwd, limit = 20) {
  if (!await isRepo(cwd)) return [];
  const r = await git(cwd, ["log", `-${limit}`, "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad", "--date=short"]);
  const withRs = r.stdout.split("\n").join("");
  return parseLog(withRs + "");
}
async function getFileAtHead(cwd, path) {
  const r = await git(cwd, ["show", `HEAD:${path}`]);
  return r.ok ? r.stdout : null;
}
function ok(message) {
  return { ok: true, message };
}
function fail(r, fallback) {
  return { ok: false, message: r.stderr || fallback };
}
async function init(cwd) {
  const r = await git(cwd, ["init"]);
  return r.ok ? ok("Initialized a git repository.") : fail(r, "git init failed.");
}
async function stage(cwd, paths) {
  const r = await git(cwd, ["add", "--", ...paths]);
  return r.ok ? ok(`Staged ${paths.length} path(s).`) : fail(r, "Staging failed.");
}
async function unstage(cwd, paths) {
  const r = await git(cwd, ["restore", "--staged", "--", ...paths]);
  return r.ok ? ok(`Unstaged ${paths.length} path(s).`) : fail(r, "Unstaging failed.");
}
async function commit(cwd, message) {
  const r = await git(cwd, ["commit", "-m", message]);
  return r.ok ? ok("Committed.") : fail(r, "Commit failed (nothing staged?).");
}
async function checkout(cwd, name) {
  const r = await git(cwd, ["checkout", name]);
  return r.ok ? ok(`Switched to ${name}.`) : fail(r, `Could not switch to ${name}.`);
}
async function createBranch(cwd, name) {
  const r = await git(cwd, ["checkout", "-b", name]);
  return r.ok ? ok(`Created and switched to ${name}.`) : fail(r, `Could not create ${name}.`);
}
async function fetch$1(cwd) {
  const r = await git(cwd, ["fetch", "--all"]);
  return r.ok ? ok("Fetched.") : fail(r, "Fetch failed.");
}
async function pull(cwd) {
  const r = await git(cwd, ["pull", "--ff-only"]);
  return r.ok ? ok("Pulled (fast-forward).") : fail(r, "Pull failed.");
}
async function importInto(cwd, url, branch) {
  if (await isRepo(cwd)) return { ok: false, message: "This folder is already a git repository." };
  let r = await git(cwd, ["init"]);
  if (!r.ok) return fail(r, "git init failed.");
  r = await git(cwd, ["remote", "add", "origin", url]);
  if (!r.ok) return fail(r, "Could not add the remote.");
  r = await git(cwd, ["fetch", "origin"]);
  if (!r.ok) return fail(r, "Fetch failed — check the repo URL and your access.");
  let b = branch;
  if (!b) {
    await git(cwd, ["remote", "set-head", "origin", "-a"]);
    const h = await git(cwd, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
    b = h.ok ? h.stdout.trim().replace(/^origin\//, "") : "main";
  }
  r = await git(cwd, ["checkout", "-f", "-B", b, `origin/${b}`]);
  return r.ok ? ok(`Imported ${url} (${b}).`) : fail(r, `Could not check out ${b}.`);
}
async function push$1(cwd) {
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  let r = await git(cwd, ["push"]);
  if (!r.ok && /has no upstream branch|set-upstream/i.test(r.stderr) && branch) {
    r = await git(cwd, ["push", "--set-upstream", "origin", branch]);
  }
  return r.ok ? ok("Pushed.") : fail(r, "Push failed.");
}
function parseGhAccounts(text) {
  const accounts = /* @__PURE__ */ new Set();
  for (const line of text.split("\n")) {
    const m = /Logged in to \S+ (?:account|as) ([^\s(]+)/i.exec(line);
    if (m) accounts.add(m[1].trim());
  }
  return [...accounts];
}
async function getGithubAuth() {
  const ver = await execFileSafe("gh", ["--version"], { timeoutMs: 8e3 });
  if (ver.spawnError) {
    return {
      provider: "github",
      cliInstalled: false,
      authenticated: false,
      accounts: [],
      activeAccount: null,
      hint: "Install the GitHub CLI (gh) to connect — https://cli.github.com — then click Connect again."
    };
  }
  const st = await execFileSafe("gh", ["auth", "status"], { timeoutMs: 1e4 });
  const text = `${st.stdout}
${st.stderr}`;
  const accounts = parseGhAccounts(text);
  const authenticated = accounts.length > 0;
  return {
    provider: "github",
    cliInstalled: true,
    authenticated,
    accounts,
    activeAccount: accounts[0] ?? null,
    hint: authenticated ? null : "You're not signed in to GitHub. Run `gh auth login` in your terminal, then click Connect again."
  };
}
function buildRepoCreateArgs(opts) {
  const args = ["repo", "create", opts.name, `--${opts.visibility}`, "--source=.", "--remote=origin", "--push"];
  if (opts.description) args.push("--description", opts.description);
  return args;
}
function buildPrCreateArgs(opts) {
  const args = ["pr", "create", "--title", opts.title, "--body", opts.body ?? ""];
  if (opts.base) args.push("--base", opts.base);
  return args;
}
function parseGithubUrl(text) {
  const m = /https:\/\/github\.com\/\S+/.exec(text);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}
async function switchGithubAccount(account) {
  const r = await execFileSafe("gh", ["auth", "switch", "--user", account], { timeoutMs: 1e4 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  return r.code === 0 ? { ok: true, message: `Switched to ${account}.` } : { ok: false, message: (r.stderr || r.stdout).trim() || "Could not switch account." };
}
async function createGithubRepo(cwd, opts) {
  const r = await execFileSafe("gh", buildRepoCreateArgs(opts), { cwd, timeoutMs: 12e4 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  const text = `${r.stdout}
${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not create the repository." };
  return { ok: true, message: `Created ${opts.name} and pushed.`, url: parseGithubUrl(text) };
}
async function createGithubPR(cwd, opts) {
  const r = await execFileSafe("gh", buildPrCreateArgs(opts), { cwd, timeoutMs: 6e4 });
  if (r.spawnError) return { ok: false, message: "The GitHub CLI (gh) isn't installed." };
  const text = `${r.stdout}
${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not open the pull request." };
  return { ok: true, message: "Opened a pull request.", url: parseGithubUrl(text) };
}
function parseGlabAccounts(text) {
  const accounts = /* @__PURE__ */ new Set();
  for (const line of text.split("\n")) {
    let m = /Logged in to \S+ as ([^\s(]+)/i.exec(line);
    if (!m) m = /username:\s*([^\s)]+)/i.exec(line);
    if (m) accounts.add(m[1].trim());
  }
  return [...accounts];
}
function parseGlabUrl(text) {
  const m = /https:\/\/gitlab\.com\/\S+/.exec(text);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}
function buildGlabRepoCreateArgs(opts) {
  const args = ["repo", "create", opts.name, "--visibility", opts.visibility];
  if (opts.description) args.push("--description", opts.description);
  return args;
}
function buildGlabMrArgs(opts) {
  const args = ["mr", "create", "--title", opts.title, "--description", opts.body ?? ""];
  if (opts.base) args.push("--target-branch", opts.base);
  return args;
}
async function getGitlabAuth() {
  const ver = await execFileSafe("glab", ["--version"], { timeoutMs: 8e3 });
  if (ver.spawnError) {
    return {
      provider: "gitlab",
      cliInstalled: false,
      authenticated: false,
      accounts: [],
      activeAccount: null,
      hint: "Install the GitLab CLI (glab) to connect — https://gitlab.com/gitlab-org/cli — then click Connect again."
    };
  }
  const st = await execFileSafe("glab", ["auth", "status"], { timeoutMs: 1e4 });
  const text = `${st.stdout}
${st.stderr}`;
  const accounts = parseGlabAccounts(text);
  const authenticated = accounts.length > 0 || /Logged in/i.test(text);
  return {
    provider: "gitlab",
    cliInstalled: true,
    authenticated,
    accounts,
    activeAccount: accounts[0] ?? null,
    hint: authenticated ? null : "You're not signed in to GitLab. Run `glab auth login` in your terminal, then click Connect again."
  };
}
async function switchGitlabAccount(_account) {
  return { ok: false, message: "Switch GitLab accounts with `glab auth login` in your terminal, then re-check." };
}
async function createGitlabRepo(cwd, opts) {
  const r = await execFileSafe("glab", buildGlabRepoCreateArgs(opts), { cwd, timeoutMs: 12e4 });
  if (r.spawnError) return { ok: false, message: "The GitLab CLI (glab) isn't installed." };
  const text = `${r.stdout}
${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not create the project." };
  const url = parseGlabUrl(text);
  if (url) {
    await stage(cwd, ["."]);
    await execFileSafe("git", ["remote", "add", "origin", `${url}.git`], { cwd, timeoutMs: 1e4 });
    await push$1(cwd);
  }
  return { ok: true, message: `Created ${opts.name} and pushed.`, url };
}
async function createGitlabMR(cwd, opts) {
  const r = await execFileSafe("glab", buildGlabMrArgs(opts), { cwd, timeoutMs: 6e4 });
  if (r.spawnError) return { ok: false, message: "The GitLab CLI (glab) isn't installed." };
  const text = `${r.stdout}
${r.stderr}`;
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Could not open the merge request." };
  return { ok: true, message: "Opened a merge request.", url: parseGlabUrl(text) };
}
async function getBitbucketAuth() {
  return {
    provider: "bitbucket",
    cliInstalled: false,
    authenticated: false,
    accounts: [],
    activeAccount: null,
    hint: "Bitbucket uses your own git credentials for clone/fetch/pull/push (all available here). Creating a repository or PR from VortSpec needs a Bitbucket app password — coming with the credential store; for now create the repo on bitbucket.org and push from Source Control."
  };
}
const notYet = {
  ok: false,
  message: "Bitbucket repo/PR creation is coming soon (needs an app password). Push works today via Source Control."
};
async function createBitbucketRepo(_cwd, _opts) {
  return notYet;
}
async function createBitbucketPR(_cwd, _opts) {
  return notYet;
}
const github = {
  id: "github",
  authStatus: getGithubAuth,
  switchAccount: switchGithubAccount,
  createRepo: createGithubRepo,
  createPR: createGithubPR
};
const gitlab = {
  id: "gitlab",
  authStatus: getGitlabAuth,
  switchAccount: switchGitlabAccount,
  createRepo: createGitlabRepo,
  createPR: createGitlabMR
};
const bitbucket = {
  id: "bitbucket",
  authStatus: getBitbucketAuth,
  switchAccount: async () => ({ ok: false, message: "Bitbucket account switching isn't supported yet." }),
  createRepo: createBitbucketRepo,
  createPR: createBitbucketPR
};
const REGISTRY = { github, gitlab, bitbucket };
function providerFor(id) {
  return REGISTRY[id];
}
function providerIdFromUrl(url) {
  if (/(^|@|\/\/)([\w.-]*\.)?github\.com[/:]/i.test(url) || /github\.com/i.test(url)) return "github";
  if (/gitlab\.com/i.test(url) || /(^|\/\/)gitlab\./i.test(url)) return "gitlab";
  if (/bitbucket\.org/i.test(url) || /(^|\/\/)bitbucket\./i.test(url)) return "bitbucket";
  return null;
}
async function resolveProvider(cwd) {
  const remotes = await getRemotes(cwd);
  const origin = remotes.find((r) => r.name === "origin")?.url;
  const id = origin ? providerIdFromUrl(origin) : null;
  return providerFor(id ?? "github");
}
function providerAuth(cwd) {
  return resolveProvider(cwd).then((p) => p.authStatus());
}
function providerSwitchAccount(cwd, account) {
  return resolveProvider(cwd).then((p) => p.switchAccount(account));
}
function providerCreateRepo(cwd, opts) {
  const p = opts.providerId ? providerFor(opts.providerId) : null;
  return (p ? Promise.resolve(p) : resolveProvider(cwd)).then(
    (prov) => prov.createRepo(cwd, { name: opts.name, visibility: opts.visibility, description: opts.description })
  );
}
function providerCreatePR(cwd, opts) {
  return resolveProvider(cwd).then((p) => p.createPR(cwd, opts));
}
async function providerPublish(cwd, opts) {
  const created = await createBranch(cwd, opts.branch);
  if (!created.ok) {
    const sw = await checkout(cwd, opts.branch);
    if (!sw.ok) return { ok: false, message: `Could not create or switch to ${opts.branch}.` };
  }
  const staged = await stage(cwd, ["."]);
  if (!staged.ok) return staged;
  const committed = await commit(cwd, opts.title);
  const pushed = await push$1(cwd);
  if (!pushed.ok) return pushed;
  const provider = await resolveProvider(cwd);
  const pr = await provider.createPR(cwd, { title: opts.title, body: opts.body });
  if (!pr.ok) return { ok: false, message: `Pushed ${opts.branch}, but opening the PR/MR failed: ${pr.message}` };
  return {
    ok: true,
    message: committed.ok ? `Published to ${opts.branch} and opened a PR/MR.` : `Pushed ${opts.branch} and opened a PR/MR.`,
    url: pr.url
  };
}
function buildCreateIssueArgs(opts) {
  const args = ["issue", "create", "-t", opts.type, "-p", opts.project, "-s", opts.summary, "--no-input"];
  if (opts.description) args.push("-b", opts.description);
  return args;
}
const ISSUE_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/;
function parseIssueRef(text) {
  const url = /https?:\/\/\S+\/browse\/[A-Z][A-Z0-9]+-\d+/.exec(text)?.[0]?.replace(/[.,)]+$/, "") ?? null;
  const key = (url ? ISSUE_KEY.exec(url) : ISSUE_KEY.exec(text))?.[1] ?? null;
  return { key, url };
}
function parseProjects(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = /^([A-Z][A-Z0-9]+)[\s\t]+(.+?)\s*$/.exec(t);
    if (m) out.push({ key: m[1], name: m[2].trim() });
  }
  return out;
}
function parseAccount(text) {
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
  return email ? email[0] : null;
}
function parseIssueStatus(text) {
  const m = /status[:\s]+([A-Za-z][A-Za-z \-]*)/i.exec(text);
  return m ? m[1].trim() : null;
}
function installCommandFor(os, hasBrew) {
  if (os === "darwin" && hasBrew) return "brew install ankitpokhrel/jira-cli/jira-cli";
  if (hasBrew) return "brew install ankitpokhrel/jira-cli/jira-cli";
  return null;
}
async function jira(args) {
  const r = await execFileSafe("jira", args, { timeoutMs: 3e4 });
  return { ok: !r.spawnError && r.code === 0, out: `${r.stdout}
${r.stderr}` };
}
async function getJiraAuth() {
  const ver = await execFileSafe("jira", ["version"], { timeoutMs: 8e3 });
  const brew = await execFileSafe("brew", ["--version"], { timeoutMs: 6e3 });
  const hasBrew = !brew.spawnError;
  const installCommand = installCommandFor(platform(), hasBrew);
  if (ver.spawnError) {
    return {
      provider: "jira",
      cliInstalled: false,
      configured: false,
      account: null,
      sites: [],
      installCommand,
      hint: installCommand ? "The Jira CLI isn't installed. VortSpec can install it for you (with your permission), then run `jira init` to sign in." : "Install the Jira CLI (ankitpokhrel/jira-cli) and run `jira init`, then click Connect again."
    };
  }
  const me = await execFileSafe("jira", ["me"], { timeoutMs: 1e4 });
  const account = me.spawnError || me.code !== 0 ? null : parseAccount(`${me.stdout}
${me.stderr}`);
  return {
    provider: "jira",
    cliInstalled: true,
    configured: Boolean(account),
    account,
    sites: account ? [account] : [],
    installCommand: null,
    hint: account ? null : "The Jira CLI is installed but not signed in. Run `jira init` in your terminal, then click Connect again."
  };
}
async function installJira() {
  const brew = await execFileSafe("brew", ["--version"], { timeoutMs: 6e3 });
  if (brew.spawnError) {
    return { ok: false, message: "Homebrew isn't available. Install the Jira CLI from ankitpokhrel/jira-cli, then Connect." };
  }
  const r = await execFileSafe("brew", ["install", "ankitpokhrel/jira-cli/jira-cli"], { timeoutMs: 3e5 });
  if (r.spawnError || r.code !== 0) {
    return { ok: false, message: (r.stderr || r.stdout).trim().slice(0, 240) || "Install failed." };
  }
  return { ok: true, message: "Installed the Jira CLI. Now run `jira init` in your terminal to sign in, then Connect." };
}
async function listJiraProjects() {
  const r = await jira(["project", "list", "--plain", "--no-headers", "--columns", "key,name"]);
  return r.ok ? parseProjects(r.out) : [];
}
async function createJiraIssue(opts) {
  const r = await jira(buildCreateIssueArgs(opts));
  if (!r.ok) return { ok: false, message: r.out.trim().slice(0, 240) || "Could not create the issue." };
  const { key, url } = parseIssueRef(r.out);
  return { ok: true, message: key ? `Created ${key}.` : "Created the issue.", key, url };
}
async function getJiraIssue(key) {
  const r = await jira(["issue", "view", key, "--plain"]);
  return {
    key,
    url: null,
    summary: null,
    status: r.ok ? parseIssueStatus(r.out) : null
  };
}
function linksPath(cwd) {
  return join(cwd, ".vortspec", "jira-links.json");
}
async function readLinks(cwd) {
  const raw = await readFile$1(linksPath(cwd), "utf8").catch(() => null);
  if (!raw) return {};
  try {
    const parsed = issueLinksSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
async function linkIssue(cwd, ref, key) {
  const links = await readLinks(cwd);
  links[ref] = key;
  try {
    await mkdir(join(cwd, ".vortspec"), { recursive: true });
    await writeFile$1(linksPath(cwd), JSON.stringify(links, null, 2), "utf8");
  } catch {
  }
}
async function createIssueFromSpec(req) {
  const body = await readFile$1(join(req.projectPath, req.specPath), "utf8").catch(() => null);
  if (body === null) return { ok: false, message: `Couldn't read the spec at ${req.specPath}.` };
  const summary = `${req.ref} — ${req.type.toLowerCase()} from VortSpec spec`;
  const created = await createJiraIssue({
    project: req.project,
    type: req.type,
    summary,
    description: body.slice(0, 3e4)
  });
  if (created.ok && created.key) await linkIssue(req.projectPath, req.ref, created.key);
  return created;
}
function profilePath() {
  return join(app.getPath("userData"), "profile.json");
}
async function readProfile() {
  try {
    const raw = await readFile$1(profilePath(), "utf8");
    const parsed = profileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}
async function saveProfile(profile) {
  const next = profileSchema.parse(profile);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile$1(profilePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
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
    const raw = await readFile$1(flowFile(projectPath), "utf8");
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
    stages,
    publishRepoUrl: state.publishRepoUrl
  };
}
async function writeState(projectPath, state) {
  await mkdir(vortspecDir(projectPath), { recursive: true });
  await writeFile$1(flowFile(projectPath), JSON.stringify(state, null, 2), "utf8");
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
async function setPublishTarget(projectPath, repoUrl) {
  const state = await readState(projectPath);
  const next = {
    ...state,
    publishRepoUrl: repoUrl.trim() || void 0
  };
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
  await writeFile$1(join(sddeDir, "brief.md"), content, "utf8");
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
  const content = await readFile$1(chosen.path, "utf8");
  return { path: chosen.path.slice(projectPath.length + 1), content };
}
async function completeInput(projectPath, stageId) {
  return approveStage(projectPath, stageId);
}
async function readArtifact(projectPath, relPath) {
  try {
    return await readFile$1(join(projectPath, relPath), "utf8");
  } catch {
    return null;
  }
}
const CANDIDATES = ["DESIGN.md", ".sdd-de/design.md", "design.md"];
const DEFAULT_TARGET = "DESIGN.md";
const VERSIONS_DIR = ".vortspec/manifests";
const INDEX_FILE = ".vortspec/manifests/index.json";
function detectManifestFormat(content) {
  if (!content.trim()) return "empty";
  const fm = /^﻿?\s*---\s*\n([\s\S]*?)\n---/.exec(content);
  if (fm && /^\s*(colors|typography|components|rounded|spacing|name)\s*:/m.test(fm[1])) {
    return "google";
  }
  return "decisions-log";
}
async function getManifest(projectPath) {
  for (const rel of CANDIDATES) {
    const content = await readFile$1(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) return { path: rel, content, exists: true, format: detectManifestFormat(content) };
  }
  return { path: DEFAULT_TARGET, content: "", exists: false, format: "empty" };
}
async function resolveTarget(projectPath) {
  for (const rel of CANDIDATES) {
    const ok2 = await readFile$1(join(projectPath, rel), "utf8").then(
      () => true,
      () => false
    );
    if (ok2) return rel;
  }
  return DEFAULT_TARGET;
}
async function readIndex(projectPath) {
  const raw = await readFile$1(join(projectPath, INDEX_FILE), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function writeIndex(projectPath, metas) {
  const path = join(projectPath, INDEX_FILE);
  await mkdir(join(projectPath, VERSIONS_DIR), { recursive: true }).catch(() => void 0);
  await writeFile$1(path, `${JSON.stringify(metas, null, 2)}
`, "utf8").catch(() => void 0);
}
async function snapshotManifest(projectPath, opts) {
  const current = await getManifest(projectPath);
  if (!current.exists || !current.content) return null;
  const id = opts.timestamp.replace(/[:.]/g, "-");
  await mkdir(join(projectPath, VERSIONS_DIR), { recursive: true }).catch(() => void 0);
  await writeFile$1(join(projectPath, VERSIONS_DIR, `${id}.md`), current.content, "utf8").catch(
    () => void 0
  );
  const meta = {
    id,
    timestamp: opts.timestamp,
    approved: opts.reason === "approve",
    runId: opts.runId,
    size: current.content.length,
    reason: opts.reason
  };
  const index = await readIndex(projectPath);
  index.unshift(meta);
  await writeIndex(projectPath, index);
  return { id, timestamp: meta.timestamp, approved: meta.approved, runId: meta.runId, size: meta.size };
}
async function saveManifest(projectPath, content, timestamp) {
  await snapshotManifest(projectPath, { reason: "edit", timestamp });
  const target = await resolveTarget(projectPath);
  const abs = join(projectPath, target);
  await mkdir(dirname(abs), { recursive: true }).catch(() => void 0);
  await writeFile$1(abs, content, "utf8");
  return { path: target, content, exists: true };
}
async function listManifestVersions(projectPath) {
  const index = await readIndex(projectPath);
  const dir = join(projectPath, VERSIONS_DIR);
  const present = new Set(await readdir(dir).catch(() => []));
  const versions = index.filter((m) => present.has(`${m.id}.md`)).map((m) => ({
    id: m.id,
    timestamp: m.timestamp,
    approved: m.approved,
    runId: m.runId,
    size: m.size
  }));
  return { versions };
}
async function readManifestVersion(projectPath, id) {
  return readFile$1(join(projectPath, VERSIONS_DIR, `${id}.md`), "utf8").catch(() => null);
}
async function restoreManifestVersion(projectPath, id, timestamp) {
  const content = await readManifestVersion(projectPath, id);
  if (content === null) return getManifest(projectPath);
  await snapshotManifest(projectPath, { reason: "restore", timestamp });
  const target = await resolveTarget(projectPath);
  await writeFile$1(join(projectPath, target), content, "utf8");
  return { path: target, content, exists: true };
}
async function currentFlowRun(projectPath) {
  const [comps, toks, manifest, flow] = await Promise.all([
    getInspectorComponents(projectPath),
    getInspectorTokens(projectPath),
    getManifest(projectPath),
    getFlow(projectPath)
  ]);
  const total = comps.components.length;
  const built = comps.components.filter((c) => c.status !== "unknown").length;
  const verified = comps.components.filter((c) => c.status === "verified").length;
  const tokenCount = toks.tokens.length;
  const foundationReady = tokenCount > 0 || total > 0;
  const manifestApproved = flow.state.stages.find((s) => s.id === "design-manifest")?.status === "approved";
  const outcome = "in-progress";
  const stage2 = (name, decision, status) => ({ name, decision, status });
  const stages = [
    stage2(
      "Foundation",
      foundationReady ? `${tokenCount} tokens · ${total} detected` : "not set up",
      foundationReady ? "done" : "pending"
    ),
    stage2(
      "Components",
      total > 0 ? `${built}/${total} built` : "none yet",
      built === 0 ? "pending" : built < total ? "review" : "done"
    ),
    stage2(
      "Verification",
      built > 0 ? `${verified}/${built} verified` : "none yet",
      verified === 0 ? "pending" : verified < built ? "review" : "done"
    ),
    stage2(
      "Design manifest",
      manifestApproved ? "approved" : manifest.exists ? "generated" : "not generated",
      manifestApproved ? "done" : manifest.exists ? "review" : "pending"
    )
  ];
  const updatedAt = flow.state.stages.map((s) => s.updatedAt).sort().pop() ?? (/* @__PURE__ */ new Date(0)).toISOString();
  const artifacts = [
    toks.tokenFile,
    total > 0 ? ".sdd-de/components.json" : null,
    manifest.exists ? manifest.path : null
  ].filter((a) => Boolean(a)).map((a) => a.split("/").pop());
  return {
    id: "current",
    label: "Current",
    title: "Design system",
    outcome,
    updatedAt,
    stages,
    artifacts
  };
}
async function recordedRuns(projectPath) {
  const dir = join(projectPath, ".vortspec", "runs");
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const runs2 = [];
  for (const name of entries.filter((n) => n.endsWith(".json"))) {
    const raw = await readFile$1(join(dir, name), "utf8").catch(() => null);
    if (!raw) continue;
    try {
      const parsed = runSummarySchema.safeParse(JSON.parse(raw));
      if (parsed.success) runs2.push(parsed.data);
    } catch {
    }
  }
  return runs2.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function getRunHistory(projectPath) {
  const [current, recorded] = await Promise.all([
    currentFlowRun(projectPath),
    recordedRuns(projectPath)
  ]);
  return { runs: [current, ...recorded] };
}
const REPO = "royvillasana/VortSpec";
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const TIMEOUT_MS = 8e3;
function compareVersions(a, b) {
  const parse = (v) => v.replace(/^v/i, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
function dmgUrl(assets) {
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    const name = a && typeof a === "object" ? a.name : null;
    const url = a && typeof a === "object" ? a.browser_download_url : null;
    if (typeof name === "string" && name.toLowerCase().endsWith(".dmg") && typeof url === "string") {
      return url;
    }
  }
  return null;
}
async function checkForUpdate() {
  const current = app.getVersion();
  const offline = {
    current,
    latest: null,
    hasUpdate: false,
    releaseUrl: null,
    downloadUrl: null
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_RELEASE, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "VortSpec" },
      signal: controller.signal
    });
    if (!res.ok) return offline;
    const json = await res.json();
    const tag = typeof json.tag_name === "string" ? json.tag_name : null;
    if (!tag) return offline;
    const latest = tag.replace(/^v/i, "");
    const releaseUrl = typeof json.html_url === "string" ? json.html_url : null;
    return {
      current,
      latest,
      hasUpdate: compareVersions(latest, current) > 0,
      releaseUrl,
      downloadUrl: dmgUrl(json.assets)
    };
  } catch {
    return offline;
  } finally {
    clearTimeout(timer);
  }
}
const servers = /* @__PURE__ */ new Map();
const keyOf = (projectPath, kind) => `${projectPath}::${kind}`;
async function readScripts(projectPath) {
  const pkg = await readFile$1(join(projectPath, "package.json"), "utf8").catch(() => null);
  if (!pkg) return {};
  try {
    return JSON.parse(pkg).scripts ?? {};
  } catch {
    return {};
  }
}
async function detectScript(projectPath, kind) {
  const scripts = await readScripts(projectPath);
  const order = kind === "app" ? ["dev", "start", "preview"] : ["storybook", "dev", "start", "preview"];
  for (const name of order) {
    if (typeof scripts[name] === "string") return name;
  }
  return null;
}
async function getPreviewInfo(projectPath) {
  const scripts = await readScripts(projectPath);
  const hasStorybookScript = typeof scripts["storybook"] === "string";
  const hasConfig = existsSync(join(projectPath, ".storybook")) || existsSync(join(projectPath, ".storybook/main.ts"));
  return {
    hasStorybook: hasStorybookScript && hasConfig,
    script: await detectScript(projectPath, "storybook")
  };
}
function detectPackageManager(projectPath) {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}
function urlFrom(text) {
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
  const clean = text.replace(ansi, "");
  const m = clean.match(
    /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s)'"]*)/i
  );
  if (!m) return null;
  return m[1].replace("0.0.0.0", "localhost").replace(/\/+$/, "") + "/";
}
function push(server, projectPath, kind) {
  if (!server.sender.isDestroyed()) {
    server.sender.send(DEV_SERVER_UPDATE_CHANNEL, { projectPath, kind, status: server.status });
  }
}
async function startServer(sender, projectPath, kind) {
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
      message: kind === "app" ? "No dev / start / preview script found in package.json to run the app." : "No dev / storybook / start script found in package.json."
    };
  }
  const pm = detectPackageManager(projectPath);
  const child = spawn(pm, ["run", script], {
    cwd: projectPath,
    shell: false,
    // NO_COLOR asks tools (picocolors/vite) not to emit ANSI; urlFrom still
    // strips any that slip through. CI keeps them non-interactive.
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", BROWSER: "none", CI: "1" }
  });
  const server = {
    child,
    status: { state: "starting", url: null, script, message: null },
    sender
  };
  servers.set(key, server);
  const onData = (buf) => {
    if (server.status.state !== "starting") return;
    const url = urlFrom(buf.toString());
    if (url) {
      server.status = { state: "running", url, script, message: null };
      push(server, projectPath, kind);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (err) => {
    server.status = { state: "error", url: null, script, message: err.message };
    push(server, projectPath, kind);
  });
  child.on("exit", (code) => {
    const clean = server.status.state === "running" && code === null;
    server.status = {
      state: clean ? "stopped" : code && code !== 0 ? "error" : "stopped",
      url: null,
      script,
      message: clean ? null : code ? `Preview process exited with code ${code}.` : null
    };
    push(server, projectPath, kind);
  });
  push(server, projectPath, kind);
  return server.status;
}
const startDevServer = (sender, projectPath) => startServer(sender, projectPath, "storybook");
const startAppServer = (sender, projectPath) => startServer(sender, projectPath, "app");
const stopDevServer = (projectPath) => stopServer(projectPath, "storybook");
const stopAppServer = (projectPath) => stopServer(projectPath, "app");
const getDevServerStatus = (projectPath) => statusOf(projectPath, "storybook");
const getAppServerStatus = (projectPath) => statusOf(projectPath, "app");
async function getStorybookIndex(url) {
  const base = url.replace(/\/+$/, "");
  for (const path of ["/index.json", "/stories.json"]) {
    try {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) continue;
      const json = await res.json();
      const map = json.entries ?? json.stories;
      if (!map) continue;
      return Object.entries(map).map(([id, e]) => ({
        id: typeof e.id === "string" ? e.id : id,
        title: typeof e.title === "string" ? e.title : "",
        name: typeof e.name === "string" ? e.name : "",
        type: e.type === "docs" ? "docs" : "story",
        importPath: typeof e.importPath === "string" ? e.importPath : void 0
      }));
    } catch {
    }
  }
  return [];
}
function stopServer(projectPath, kind) {
  const server = servers.get(keyOf(projectPath, kind));
  if (!server) return;
  server.child.kill("SIGTERM");
  const child = server.child;
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 4e3);
}
function statusOf(projectPath, kind) {
  return servers.get(keyOf(projectPath, kind))?.status ?? {
    state: "stopped",
    url: null,
    script: null,
    message: null
  };
}
function stopAllDevServers() {
  for (const server of servers.values()) server.child.kill("SIGTERM");
}
const handlers = {
  "system:isElectron": () => true,
  "system:getVersion": () => app.getVersion(),
  "system:checkUpdate": () => checkForUpdate(),
  "env:check": () => checkEnvironment(),
  "env:verifyLogin": () => verifyClaudeLogin(),
  "env:verifyFigmaMcp": () => verifyFigmaMcp(),
  "env:openInstall": ((url) => shell.openExternal(url).then(() => void 0)),
  "workspace:pickFolder": ((req) => pickFolder(req ?? { create: false })),
  "workspace:createFolder": (() => createFolder()),
  "workspace:listProjects": () => listProjects(),
  "workspace:openFolder": ((path) => openFolder(path)),
  "workspace:revealPath": ((req) => {
    revealPath(req.projectPath, req.relPath);
    return void 0;
  }),
  "workspace:refreshProject": ((path) => refreshProject(path)),
  "workspace:createProject": ((req) => createProject(req.path, req.answers)),
  "workspace:listDir": ((r) => listDir(r.projectPath, r.relPath)),
  "workspace:readFile": ((r) => readFile(r.projectPath, r.relPath)),
  "workspace:writeFile": ((r) => writeFile(r.projectPath, r.relPath, r.content)),
  "workspace:watchStart": ((projectPath, sender) => {
    startWatch(sender, projectPath);
    return void 0;
  }),
  "workspace:watchStop": ((projectPath) => {
    stopWatch(projectPath);
    return void 0;
  }),
  "git:fileAtHead": ((r) => getFileAtHead(r.projectPath, r.relPath)),
  "terminal:create": ((r, sender) => {
    createSession(sender, { id: r.id, cwd: r.projectPath, cols: r.cols, rows: r.rows });
    return void 0;
  }),
  "terminal:write": ((r) => {
    writeSession(r.id, r.data);
    return void 0;
  }),
  "terminal:resize": ((r) => {
    resizeSession(r.id, r.cols, r.rows);
    return void 0;
  }),
  "terminal:kill": ((id) => {
    killSession(id);
    return void 0;
  }),
  "toolkit:status": ((path) => getToolkitStatus(path)),
  "toolkit:install": ((path) => installToolkit(path)),
  "agent:startRun": ((opts, sender) => startRun(sender, opts)),
  "agent:cancelRun": ((runId) => {
    cancelRun(runId);
    return void 0;
  }),
  "agent:hasActiveRun": ((projectPath) => hasActiveRun(projectPath)),
  "agent:lastRun": ((projectPath) => getLastRun(projectPath)),
  "usage:get": (() => getUsage()),
  "git:status": ((p) => getStatus(p)),
  "git:branches": ((p) => getBranches(p)),
  "git:remotes": ((p) => getRemotes(p)),
  "git:log": ((p) => getLog(p)),
  "git:stage": ((r) => stage(r.projectPath, r.paths)),
  "git:unstage": ((r) => unstage(r.projectPath, r.paths)),
  "git:commit": ((r) => commit(r.projectPath, r.message)),
  "git:checkout": ((r) => checkout(r.projectPath, r.name)),
  "git:createBranch": ((r) => createBranch(r.projectPath, r.name)),
  "git:fetch": ((p) => fetch$1(p)),
  "git:pull": ((p) => pull(p)),
  "git:push": ((p) => push$1(p)),
  "git:init": ((p) => init(p)),
  "provider:auth": ((projectPath) => providerAuth(projectPath)),
  "provider:switchAccount": ((r) => providerSwitchAccount(r.projectPath, r.account)),
  "provider:createRepo": ((r) => providerCreateRepo(r.projectPath, { providerId: r.providerId, name: r.name, visibility: r.visibility, description: r.description })),
  "provider:createPR": ((r) => providerCreatePR(r.projectPath, { base: r.base, title: r.title, body: r.body })),
  "git:import": ((r) => importInto(r.projectPath, r.url, r.branch)),
  "provider:publish": ((r) => providerPublish(r.projectPath, { branch: r.branch, title: r.title, body: r.body })),
  "task:auth": (() => getJiraAuth()),
  "task:install": (() => installJira()),
  "task:projects": (() => listJiraProjects()),
  "task:createIssue": ((r) => createJiraIssue(r)),
  "task:createFromSpec": ((r) => createIssueFromSpec(r)),
  "task:links": ((projectPath) => readLinks(projectPath)),
  "task:issueStatus": ((key) => getJiraIssue(key)),
  "profile:get": (() => readProfile()),
  "profile:save": ((profile) => saveProfile(profile)),
  "flow:get": ((projectPath) => getFlow(projectPath)),
  "flow:setStageStatus": ((req) => setStageStatus(req.projectPath, req.stageId, req.status)),
  "flow:approveStage": ((req) => approveStage(req.projectPath, req.stageId)),
  "flow:requestChanges": ((req) => requestChanges(req.projectPath, req.stageId, req.notes)),
  "flow:saveIntake": ((req) => saveIntake(req.projectPath, req.content)),
  "flow:completeInput": ((req) => completeInput(req.projectPath, req.stageId)),
  "flow:getHistory": ((projectPath) => getRunHistory(projectPath)),
  "manifest:get": ((projectPath) => getManifest(projectPath)),
  "manifest:save": ((req) => saveManifest(req.projectPath, req.content, (/* @__PURE__ */ new Date()).toISOString())),
  "manifest:listVersions": ((projectPath) => listManifestVersions(projectPath)),
  "manifest:readVersion": ((req) => readManifestVersion(req.projectPath, req.id)),
  "manifest:restoreVersion": ((req) => restoreManifestVersion(req.projectPath, req.id, (/* @__PURE__ */ new Date()).toISOString())),
  "manifest:snapshot": ((req) => snapshotManifest(req.projectPath, {
    reason: req.reason,
    runId: req.runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }).then(() => getManifest(req.projectPath))),
  "devserver:start": ((projectPath, sender) => startDevServer(sender, projectPath)),
  "devserver:stop": ((projectPath) => {
    stopDevServer(projectPath);
    return void 0;
  }),
  "devserver:status": ((projectPath) => getDevServerStatus(projectPath)),
  "appserver:start": ((projectPath, sender) => startAppServer(sender, projectPath)),
  "appserver:stop": ((projectPath) => {
    stopAppServer(projectPath);
    return void 0;
  }),
  "appserver:status": ((projectPath) => getAppServerStatus(projectPath)),
  "devserver:previewInfo": ((projectPath) => getPreviewInfo(projectPath)),
  "devserver:storybookIndex": ((url) => getStorybookIndex(url)),
  "flow:setPublishTarget": ((req) => setPublishTarget(req.projectPath, req.repoUrl)),
  "artifact:read": ((req) => readArtifact(req.projectPath, req.relPath)),
  "artifact:findLatest": ((req) => findLatestArtifact(req.projectPath, req.suffix)),
  "project:config": ((projectPath) => readProjectConfig(projectPath)),
  "inspector:getTokens": ((projectPath) => getInspectorTokens(projectPath)),
  "inspector:getComponents": ((projectPath) => getInspectorComponents(projectPath)),
  "inspector:setTokenValue": ((req) => setInspectorTokenValue(req.projectPath, req.name, req.value)),
  "inspector:getVerification": ((projectPath) => getVerification(projectPath)),
  "inspector:snapshotComponent": ((req) => snapshotComponent(req.projectPath, req.file)),
  "inspector:snapshotTokenScope": ((projectPath) => snapshotTokenScope(projectPath)),
  "inspector:restoreFiles": ((req) => restoreFiles(req.projectPath, req.files).then(() => void 0))
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
const MARKER = "__VS_PATH__";
const FALLBACK_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  `${process.env.HOME ?? ""}/.local/bin`,
  `${process.env.HOME ?? ""}/.volta/bin`,
  `${process.env.HOME ?? ""}/.bun/bin`
];
function mergePath(...parts) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const p of parts) {
    for (const dir of p.split(":")) {
      if (dir && !seen.has(dir)) {
        seen.add(dir);
        out.push(dir);
      }
    }
  }
  return out.join(":");
}
async function fixGuiPath() {
  if (process.platform === "win32") return;
  let shellPath = "";
  const shell2 = process.env.SHELL || "/bin/zsh";
  const r = await execFileSafe(shell2, ["-ilc", `printf '%s' "${MARKER}\${PATH}${MARKER}"`], {
    timeoutMs: 5e3
  });
  if (!r.spawnError && !r.timedOut) {
    const m = r.stdout.match(new RegExp(`${MARKER}(.*?)${MARKER}`, "s"));
    if (m?.[1]) shellPath = m[1];
  }
  process.env.PATH = mergePath(shellPath, FALLBACK_DIRS.join(":"), process.env.PATH ?? "");
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
app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.vortspec.desktop");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  await fixGuiPath();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("before-quit", () => {
  stopAllDevServers();
  killAllSessions();
});
app.on("window-all-closed", () => {
  stopAllDevServers();
  killAllSessions();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
