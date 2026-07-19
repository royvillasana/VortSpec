/**
 * A browser-side stub of `window.vortspec` for component tests. It returns
 * fixture data for the read methods the views call on mount and replays a
 * recorded agent-event transcript when a run is started, so the Tokens /
 * Components / Playground views can be driven deterministically without Electron
 * or the real main process. Test-only: loose typing is intentional here.
 */
import type { RunEvent } from "@vortspec/core/run-events";
import type { CommentThread, CommentCollaborator } from "@vortspec/core/comment";
import type { GitResult } from "@vortspec/core/git";
import type {
  InspectorTokensResult,
  InspectorComponentsResult,
  EnvCheck,
  DevServerStatus,
  ManifestResult,
  ManifestVersion,
  VerificationResult,
  IdeAction,
  IdeActionResult,
} from "@vortspec/core/ipc";

export interface MockConfig {
  tokens?: InspectorTokensResult;
  components?: InspectorComponentsResult;
  figmaMcp?: EnvCheck;
  /** Initial dev-server status returned by devServerStatus(). */
  devStatus?: DevServerStatus;
  /** Status returned by startDevServer() — defaults to a running server with a URL. */
  devStartStatus?: DevServerStatus;
  /** Initial app-server status returned by appServerStatus(). */
  appStatus?: DevServerStatus;
  /** Status returned by startAppServer(). */
  appStartStatus?: DevServerStatus;
  /** Whether the project already has a Storybook setup. */
  previewInfo?: { hasStorybook: boolean; script: string | null };
  /** Entries returned by storybookIndex(). */
  storybookIndex?: { id: string; title: string; name: string; type: "docs" | "story" }[];
  /** Result of storybookStatus() — drives the Playground provisioning gate. */
  storybookStatus?: {
    installed: boolean;
    hasConfig: boolean;
    hasScript: boolean;
    storyCount: number;
    components: number;
    missingStories: number;
  };
  /** Result of ensureStorybook(). */
  ensureStorybook?: { state: "present" | "installed" | "failed"; installed: boolean; storyCount: number; error?: string };
  /** Replayed to onAgentEvent subscribers (with the started run's id) on startRun. */
  runScript?: RunEvent[];
  /** FileSnapshot[] returned by snapshotTokenScope() (compose flow). */
  snapshot?: { path: string; content: string }[];
  /** When false, composeCheckTarget() reports the run's file is not committable (§6.8). */
  composeTargetOk?: boolean;
  /** Manifest returned by getManifest(). */
  manifest?: ManifestResult;
  /** Manifest returned by getManifest() after a run transcript completes (design-doc wrote it). */
  manifestAfterGenerate?: ManifestResult;
  /** Components returned by inspectorComponents() after a run transcript completes (built from files). */
  componentsAfterRun?: InspectorComponentsResult;
  /** Verification report returned by getVerification() — drives the verify outcome card. */
  verification?: VerificationResult;
  /** Seed threads for the run-canvas comments store (list/upsert/resolve are stateful). */
  comments?: CommentThread[];
  /** @mention autocomplete candidates returned by commentCollaborators(). */
  collaborators?: CommentCollaborator[];
  /** Result returned by shareComments() (the manual push). */
  shareResult?: GitResult;
  /** `--mcp-config` path returned by ideMcpConfigPath() (null keeps the bridge off). */
  ideMcpConfig?: { path: string } | null;
  /** Whether hasActiveRun() reports an in-flight run for the project (reconnect banner). */
  hasActiveRun?: boolean;
  /** The resumable last run returned by lastRun() — drives the resume card. */
  lastRun?: import("@vortspec/core/ipc").LastRun | null;
  /** Usage snapshot returned by getUsage() — drives the Profile usage bars. */
  usage?: import("@vortspec/core/ipc").UsageResult;
  /** Profile returned by getProfile(). */
  profile?: import("@vortspec/core/ipc").Profile;
  /** Git status for the Source Control view. */
  gitStatus?: import("@vortspec/core/ipc").GitStatus;
  gitBranches?: import("@vortspec/core/ipc").GitBranch[];
  gitGraph?: import("@vortspec/core/ipc").GitGraphResult;
  envStatus?: { hasEnv: boolean; examples: string[]; placeholders: string[] };
  openWalkthrough?: { ok: boolean; message: string };
  gitRemotes?: import("@vortspec/core/ipc").GitRemote[];
  githubAuth?: import("@vortspec/core/ipc").ProviderAuth;
  taskAuth?: import("@vortspec/core/ipc").TaskAuth;
  taskProjects?: import("@vortspec/core/ipc").TaskProject[];
  taskLinks?: import("@vortspec/core/ipc").IssueLinks;
  /** Versions returned by listManifestVersions(). */
  manifestVersions?: ManifestVersion[];
  /** Flow returned by getFlow() — used by the manifest screen to read approval. */
  flow?: { state: { currentStageId: string; stages: { id: string; status: string }[] } } | null;
  /** Projects returned by listProjects() — e.g. the IDE workspace picker's "Recent". */
  projects?: import("@vortspec/core/ipc").Project[];
  /** Project returned by pickFolder() — the IDE "Open a folder…" result. */
  pickFolderResult?: import("@vortspec/core/ipc").Project | null;
  /** Absolute path returned by pickFile() — e.g. the chosen .zip. */
  pickFileResult?: string | null;
  /** Folder returned by createFolder() — the destination for a new project. */
  createFolderResult?: import("@vortspec/core/ipc").Project | null;
  /** Workspace file tree for the IDE Explorer, keyed by relative dir ("" = root). */
  fsTree?: Record<string, import("@vortspec/core/ipc").FsEntry[]>;
  /** File contents for the IDE editor, keyed by relative path. */
  fsFiles?: Record<string, string>;
  /** Image data URLs for the Explorer preview, keyed by relative path. */
  fsAssets?: Record<string, string>;
  /** Entries returned by searchFiles() — the @-mention picker (filtered by query). */
  searchResults?: import("@vortspec/core/ipc").FsEntry[];
  /** Result of clipboardImage() — a pasted-image path + thumbnail, or null. */
  clipboardImage?: { path: string; dataUrl: string } | null;
  /** HEAD contents for git diffs, keyed by relative path. */
  fsHead?: Record<string, string>;
  /** Text emitted to onTerminalData shortly after a terminal session is created. */
  terminalGreeting?: string;
  /** Figma connection status returned by figmaStatus(). */
  figma?: import("@vortspec/core/ipc").FigmaConnection;
  /** Result returned by checkFigmaHealth(). */
  figmaHealth?: import("@vortspec/core/ipc").FigmaHealth;
  /** Status returned by figmaTokenStatus(). */
  figmaTokenStatus?: import("@vortspec/core/ipc").FigmaTokenStatus;
  /** Result returned by setFigmaToken(). */
  setFigmaTokenResult?: { ok: boolean; message: string };
  /** Result returned by figmaSyncVariables(). */
  figmaSync?: import("@vortspec/core/ipc").FigmaSyncResult;
  /** Result returned by figmaSyncComponents(). */
  figmaSyncComponents?: import("@vortspec/core/ipc").FigmaSyncResult;
  /** Result returned by figmaSelection(). */
  figmaSelection?: import("@vortspec/core/ipc").FigmaSelection;
  /** Report returned by getSanitation() — orphan/duplicate tokens for the sanitation UI. */
  sanitation?: import("@vortspec/core/ipc").TokenSanitation;
  /** Plan returned by figmaComputePushPlan() — the code→Figma push confirm gate. */
  pushPlan?: import("@vortspec/core/ipc").PushPlan;
  /** Result returned by figmaPushVariables(). */
  figmaPush?: import("@vortspec/core/ipc").FigmaPushResult;
  /** Route sitemap returned by discoverRoutes(). */
  routes?: import("@vortspec/core/ipc").RouteDiscovery;
}

export const EMPTY_TOKENS: InspectorTokensResult = {
  tokenFile: null,
  tokens: [],
  usage: {},
  figmaOnly: [],
  figmaSynced: false,
  collections: [],
  activeCollection: null,
  activeMode: null,
  modeMap: {},
};
/** A minimal "founded" token result — a project whose design-system foundation exists. */
export const FOUNDED_TOKENS: InspectorTokensResult = {
  tokenFile: "src/styles/tokens.css",
  tokens: [
    { name: "spacing-4", type: "spacing", rawValue: "16px", resolvedValue: "16px", source: "generated-code", uses: 3 },
  ],
  usage: {},
  figmaOnly: [],
  figmaSynced: false,
  collections: [],
  activeCollection: null,
  activeMode: null,
  modeMap: {},
};
const EMPTY_COMPONENTS: InspectorComponentsResult = {
  componentDir: null,
  previewUrl: null,
  components: [],
  figmaOnly: [],
  figmaSynced: false,
};
const STOPPED: DevServerStatus = { state: "stopped", url: null, script: null, message: null };
const RUNNING: DevServerStatus = {
  state: "running",
  url: "http://localhost:5199",
  script: "dev",
  message: null,
};

export function installMockVortspec(cfg: MockConfig = {}): void {
  const eventSubs = new Set<(e: { runId: string; event: RunEvent }) => void>();
  const rawSubs = new Set<(e: { runId: string; line: string }) => void>();
  const devSubs = new Set<(e: { projectPath: string; status: DevServerStatus }) => void>();
  const termSubs = new Set<(e: { id: string; data: string; exit?: number | null }) => void>();
  const ideActionSubs = new Set<(a: IdeAction) => void>();
  const ideResolutions: IdeActionResult[] = [];
  // Stateful in-memory comment threads (seeded from cfg; list/upsert/resolve mutate it).
  const comments: CommentThread[] = [...(cfg.comments ?? [])];
  // Records Explorer file operations (create/rename/trash) for assertions.
  const fsOps: { op: string; path: string; to?: string }[] = [];
  const composeOps: { op: string; file?: string; runId?: string; keepOption?: number; files?: string[] }[] = [];
  // Records URLs passed to openInstall (e.g. the Preview bar's Open Browser).
  const installOpens: string[] = [];
  let runSeq = 0;
  // Flips true once a run's transcript has been replayed — lets getManifest
  // return the post-generation manifest (mirrors design-doc writing DESIGN.md).
  let generated = false;

  // Records the prompt (and full options) of every startRun so tests can assert
  // what was sent to Claude (injected grounding, agent tools/system prompt, …).
  const runPrompts: string[] = [];
  const runOpts: Record<string, unknown>[] = [];
  let lastRunId: string | null = null;
  const startRun = async (opts?: { prompt?: string }): Promise<{ runId: string }> => {
    if (typeof opts?.prompt === "string") runPrompts.push(opts.prompt);
    if (opts) runOpts.push(opts as Record<string, unknown>);
    const runId = `run-${runSeq++}`;
    lastRunId = runId;
    // Replay AFTER useAgentRun stores runIdRef (a microtask after this resolves),
    // so its `runId === runIdRef.current` filter passes — hence a macrotask.
    setTimeout(() => {
      for (const event of cfg.runScript ?? []) {
        for (const sub of eventSubs) sub({ runId, event });
      }
      generated = true;
    }, 0);
    return { runId };
  };

  const api = {
    isElectron: async () => true,
    getVersion: async () => "test",
    homeDir: async () => "/Users/dev",
    // Empty → the Run Canvas shows its "Preparing…" state instead of mounting a
    // real Electron <webview> (which doesn't exist in the CT browser).
    guestPreloadUrl: async () => "",
    clipboardImage: async () => cfg.clipboardImage ?? null,
    getPathForFile: (file: File) => (file as unknown as { __path?: string }).__path ?? file.name,
    checkUpdate: async () => ({
      current: "0.1.0",
      latest: null,
      hasUpdate: false,
      releaseUrl: null,
      downloadUrl: null,
    }),
    checkEnvironment: async () => ({ checks: [], ready: true }),
    verifyLogin: async () => ({ id: "claude-login", label: "Claude", status: "pass" }),
    verifyFigmaMcp: async () =>
      cfg.figmaMcp ?? { id: "figma-mcp", label: "Figma MCP", status: "unknown", detail: "" },
    openInstall: async (url: string) => {
      installOpens.push(url);
      return undefined;
    },

    pickFolder: async () => cfg.pickFolderResult ?? null,
    createFolder: async () => cfg.createFolderResult ?? null,
    pickFile: async () => cfg.pickFileResult ?? null,
    listProjects: async () => cfg.projects ?? [],
    removeProject: async (id: string) => (cfg.projects ?? []).filter((p) => p.id !== id),
    openFolder: async () => undefined,
    revealPath: async () => undefined,
    refreshProject: async (path: string) => ({
      id: "p",
      name: "p",
      path,
      // A refreshed recent/opened project is a set-up one by default, so the ide
      // App's `openProject` routes it to the workspace (not the intake stepper).
      // Tests that want the un-configured intake path pass an explicit project.
      toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
    }),
    createProject: async () => null,
    toolkitStatus: async () => ({ present: true, configured: true, version: "1.0.0", updateAvailable: false }),
    installToolkit: async () => ({ present: true, configured: true, version: "1.0.0", updateAvailable: false }),

    startRun,
    // Cancelling ends the run — emit a terminal result so the UI leaves its
    // running state (Stop → Send), as a real cancel would.
    cancelRun: async () => {
      if (lastRunId) {
        const id = lastRunId;
        setTimeout(() => {
          for (const sub of eventSubs) sub({ runId: id, event: { kind: "result", isError: true, sessionId: "s" } });
        }, 0);
      }
      return undefined;
    },
    hasActiveRun: async () => cfg.hasActiveRun ?? false,
    lastRun: async () => cfg.lastRun ?? null,
    getUsage: async () =>
      cfg.usage ?? { available: false, headline: null, limits: [], note: null, raw: "", capturedAt: "", error: "no usage" },

    // Git (source control)
    gitStatus: async () =>
      cfg.gitStatus ?? { isRepo: true, branch: "main", upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], conflicts: [], clean: true },
    gitBranches: async () => cfg.gitBranches ?? [{ name: "main", current: true, remote: false, upstream: null }],
    gitRemotes: async () => cfg.gitRemotes ?? [],
    envStatus: async () => cfg.envStatus ?? { hasEnv: true, examples: [], placeholders: [] },
    createEnv: async () => ({ ok: true, message: "Created .env" }),
    openWalkthrough: async () => cfg.openWalkthrough ?? { ok: true, message: "Walk-through ready." },
    gitLog: async () => [],
    gitGraph: async () =>
      cfg.gitGraph ?? {
        commits: [],
        stats: { commits: 0, branches: 1, remoteBranches: 0, merges: 0, tags: 0 },
        truncated: false,
      },
    gitStage: async () => ({ ok: true, message: "Staged." }),
    gitUnstage: async () => ({ ok: true, message: "Unstaged." }),
    gitCommit: async () => ({ ok: true, message: "Committed." }),
    gitCheckout: async () => ({ ok: true, message: "Switched." }),
    gitCreateBranch: async () => ({ ok: true, message: "Created." }),
    gitFetch: async () => ({ ok: true, message: "Fetched." }),
    gitPull: async () => ({ ok: true, message: "Pulled." }),
    gitPush: async () => ({ ok: true, message: "Pushed." }),
    gitInit: async () => ({ ok: true, message: "Initialized." }),
    providerAuth: async () =>
      cfg.githubAuth ?? { provider: "github", cliInstalled: true, authenticated: false, accounts: [], activeAccount: null, hint: "Run gh auth login." },
    providerSwitchAccount: async () => ({ ok: true, message: "Switched." }),
    providerCreateRepo: async () => ({ ok: true, message: "Created.", url: "https://github.com/me/app" }),
    providerCreatePR: async () => ({ ok: true, message: "Opened a PR.", url: "https://github.com/me/app/pull/1" }),
    providerPublish: async () => ({ ok: true, message: "Published.", url: "https://github.com/me/app/pull/2" }),
    gitImport: async () => ({ ok: true, message: "Imported." }),

    // Tasks (Jira)
    taskAuth: async () =>
      cfg.taskAuth ?? { provider: "jira", cliInstalled: false, configured: false, account: null, sites: [], installCommand: "brew install ankitpokhrel/jira-cli/jira-cli", hint: "Install the Jira CLI." },
    taskInstall: async () => ({ ok: true, message: "Installed." }),
    taskProjects: async () => cfg.taskProjects ?? [],
    taskCreateIssue: async () => ({ ok: true, message: "Created DES-1.", key: "DES-1", url: "https://x.atlassian.net/browse/DES-1" }),
    taskCreateFromSpec: async () => ({ ok: true, message: "Created DES-2.", key: "DES-2", url: null }),
    taskLinks: async () => cfg.taskLinks ?? {},
    taskIssueStatus: async () => ({ key: "DES-1", url: null, summary: null, status: "To Do" }),
    getProfile: async () => cfg.profile ?? { name: "", avatarDataUrl: null, preferences: {} },
    saveProfile: async (p: import("@vortspec/core/ipc").Profile) => p,
    onAgentEvent: (cb: (e: { runId: string; event: RunEvent }) => void) => {
      eventSubs.add(cb);
      return () => eventSubs.delete(cb);
    },
    onAgentRaw: (cb: (e: { runId: string; line: string }) => void) => {
      rawSubs.add(cb);
      return () => rawSubs.delete(cb);
    },

    getFlow: async () => cfg.flow ?? null,
    getManifest: async () =>
      (generated && cfg.manifestAfterGenerate) ||
      cfg.manifest || { path: "DESIGN.md", content: "", exists: false },
    saveManifest: async (_p: string, content: string) => ({
      path: "DESIGN.md",
      content,
      exists: true,
    }),
    listManifestVersions: async () => ({ versions: cfg.manifestVersions ?? [] }),
    readManifestVersion: async () => null,
    restoreManifestVersion: async () =>
      cfg.manifest ?? { path: "DESIGN.md", content: "", exists: false },
    snapshotManifest: async () =>
      cfg.manifest ?? { path: "DESIGN.md", content: "", exists: false },
    setStageStatus: async () => null,
    approveStage: async () => null,
    requestChanges: async () => null,
    saveIntake: async () => null,
    completeInput: async () => null,
    getHistory: async () => ({ runs: [] }),
    startDevServer: async () => cfg.devStartStatus ?? RUNNING,
    stopDevServer: async () => undefined,
    devServerStatus: async () => cfg.devStatus ?? STOPPED,
    startAppServer: async () => cfg.appStartStatus ?? cfg.appStatus ?? RUNNING,
    stopAppServer: async () => undefined,
    appServerStatus: async () => cfg.appStatus ?? STOPPED,
    previewInfo: async () => cfg.previewInfo ?? { hasStorybook: false, script: "storybook" },
    storybookIndex: async () => cfg.storybookIndex ?? [],
    storybookStatus: async () =>
      cfg.storybookStatus ?? {
        installed: true,
        hasConfig: true,
        hasScript: true,
        storyCount: 0,
        components: 0,
        missingStories: 0,
      },
    ensureStorybook: async () =>
      cfg.ensureStorybook ?? { state: "present" as const, installed: true, storyCount: 0 },
    onDevServerUpdate: (cb: (e: { projectPath: string; status: DevServerStatus }) => void) => {
      devSubs.add(cb);
      return () => devSubs.delete(cb);
    },

    // Workspace filesystem (IDE Explorer / editor)
    listDir: async (_projectPath: string, relPath: string) => cfg.fsTree?.[relPath] ?? [],
    readFile: async (_projectPath: string, relPath: string) => ({
      path: relPath,
      content: cfg.fsFiles?.[relPath] ?? "",
      truncated: false,
    }),
    readAsset: async (_projectPath: string, relPath: string) => ({
      dataUrl: cfg.fsAssets?.[relPath] ?? null,
      tooLarge: false,
    }),
    searchFiles: async (_projectPath: string, query: string) =>
      (cfg.searchResults ?? []).filter((e) => e.path.toLowerCase().includes(query.toLowerCase())),
    createFile: async (_p: string, relPath: string) => {
      fsOps.push({ op: "createFile", path: relPath });
      return { ok: true, message: "Created." };
    },
    createDir: async (_p: string, relPath: string) => {
      fsOps.push({ op: "createDir", path: relPath });
      return { ok: true, message: "Created." };
    },
    renamePath: async (_p: string, from: string, to: string) => {
      fsOps.push({ op: "rename", path: from, to });
      return { ok: true, message: "Moved." };
    },
    trashPath: async (_p: string, relPath: string) => {
      fsOps.push({ op: "trash", path: relPath });
      return { ok: true, message: "Moved to Trash." };
    },
    writeFile: async () => ({ ok: true, message: "Saved." }),
    watchWorkspace: async () => undefined,
    unwatchWorkspace: async () => undefined,
    fileAtHead: async (_projectPath: string, relPath: string) => cfg.fsHead?.[relPath] ?? null,
    onWorkspaceChange: () => () => undefined,

    // Integrated terminal
    terminalCreate: async (req: { id: string }) => {
      if (cfg.terminalGreeting) {
        setTimeout(() => {
          for (const cb of termSubs) cb({ id: req.id, data: cfg.terminalGreeting! });
        }, 0);
      }
      return undefined;
    },
    terminalWrite: async () => undefined,
    terminalResize: async () => undefined,
    terminalKill: async () => undefined,
    onTerminalData: (cb: (e: { id: string; data: string; exit?: number | null }) => void) => {
      termSubs.add(cb);
      return () => termSubs.delete(cb);
    },

    // IDE MCP integration
    ideMcpConfigPath: async () => cfg.ideMcpConfig ?? null,
    reportIdeState: async () => ({ ok: true }),
    resolveIdeAction: async (r: IdeActionResult) => {
      ideResolutions.push(r);
      return { ok: true };
    },
    onIdeMcpAction: (cb: (a: IdeAction) => void) => {
      ideActionSubs.add(cb);
      return () => ideActionSubs.delete(cb);
    },

    // Figma connection (figma-cli)
    figmaStatus: async () =>
      cfg.figma ?? {
        installed: false,
        cliDir: "/Users/dev/figma-cli",
        daemonRunning: false,
        connected: false,
        mode: null,
        openFiles: [],
        appName: "VortSpec",
        message: "figma-cli isn't installed yet.",
      },
    // Warm-up call the IDE fires whenever a workspace opens (App.tsx). It is
    // fire-and-forget in the app, but a MISSING mock method is a TypeError at the
    // call site, not a rejected promise — so `.catch()` never sees it, React
    // unmounts, and every workspace-scoped CT times out on an empty page.
    figmaEnsureConnected: async () =>
      cfg.figma ?? {
        installed: false,
        cliDir: "/Users/dev/figma-cli",
        daemonRunning: false,
        connected: false,
        mode: null,
        openFiles: [],
        appName: "VortSpec",
        message: "figma-cli isn't installed yet.",
      },
    figmaOpenAppManagement: async () => undefined,
    figmaConnect: async () =>
      cfg.figma ?? {
        installed: true,
        cliDir: "/Users/dev/figma-cli",
        daemonRunning: true,
        connected: true,
        mode: "yolo",
        openFiles: ["Design System"],
        appName: "VortSpec",
        message: "Connected to Figma Desktop (yolo mode).",
      },
    figmaSyncVariables: async () =>
      cfg.figmaSync ?? {
        ok: true,
        count: 12,
        source: "cli",
        mode: "yolo",
        message: "Read 12 Figma variables via figma-cli (yolo mode).",
      },
    figmaSyncComponents: async () =>
      cfg.figmaSyncComponents ?? {
        ok: true,
        count: 8,
        source: "cli",
        mode: "yolo",
        message: "Read 8 Figma components via figma-cli (yolo mode).",
      },
    figmaSelection: async () =>
      cfg.figmaSelection ?? { nodes: [], message: "Nothing selected in Figma." },
    checkFigmaHealth: async () =>
      cfg.figmaHealth ?? {
        mode: "ok",
        tokenValid: true,
        bridgeConnected: true,
        canRead: true,
        variableCount: 80,
        styleCount: 12,
        message: "Figma connection healthy — read 80 variables and 12 styles.",
        detail: "",
      },
    figmaTokenStatus: async () =>
      cfg.figmaTokenStatus ?? {
        configured: true,
        serverName: "figma-console",
        envVar: "FIGMA_ACCESS_TOKEN",
        message: "A Figma token is set on “figma-console” (FIGMA_ACCESS_TOKEN). Paste a new one to replace it.",
      },
    setFigmaToken: async () => cfg.setFigmaTokenResult ?? { ok: true, message: "Figma token updated." },

    setPublishTarget: async () => null,
    readArtifact: async () => null,
    findLatestArtifact: async () => null,
    projectConfig: async () => null,

    inspectorTokens: async () => cfg.tokens ?? EMPTY_TOKENS,
    inspectorComponents: async () =>
      (generated && cfg.componentsAfterRun) || cfg.components || EMPTY_COMPONENTS,
    setTokenValue: async () => cfg.tokens ?? EMPTY_TOKENS,
    // Token sanitation + edit methods (change: token-fidelity-sanitation). The
    // Inspector calls getSanitation on mount — a missing mock method is a synchronous
    // TypeError that unmounts React and blanks the page (see figmaEnsureConnected note
    // above), so every one of these must exist even when a test doesn't exercise it.
    getSanitation: async () => cfg.sanitation ?? { orphans: [], duplicates: [] },
    collapseToken: async () => cfg.tokens ?? EMPTY_TOKENS,
    createToken: async () => cfg.tokens ?? EMPTY_TOKENS,
    setTokenModeMap: async () => cfg.tokens ?? EMPTY_TOKENS,
    figmaComputePushPlan: async () => cfg.pushPlan ?? { collection: "VortSpec", entries: [] },
    figmaPushVariables: async () =>
      cfg.figmaPush ?? { ok: true, created: 0, updated: 0, source: "cli", message: "Pushed to Figma." },
    getVerification: async () => cfg.verification ?? { findings: [] },
    snapshotComponent: async () => [],
    snapshotTokenScope: async () => cfg.snapshot ?? [],
    snapshotSourceScope: async () => cfg.snapshot ?? [],
    discoverRoutes: async () =>
      cfg.routes ?? {
        router: "none",
        routes: [{ path: "/", label: "Home", file: "src/App.tsx", dynamic: false, navigable: true, children: [] }],
        note: null,
      },
    restoreFiles: async (_p: string, files: { path: string }[]) => {
      composeOps.push({ op: "restore", files: files.map((f) => f.path) });
      return undefined;
    },
    composeAccept: async (_p: string, file: string, runId: string, keepOption: number) => {
      composeOps.push({ op: "accept", file, runId, keepOption });
      return { ok: true, file };
    },
    composeSweep: async (_p: string, files: string[]) => {
      composeOps.push({ op: "sweep", files });
      return undefined;
    },
    composeCheckTarget: async (_p: string, file: string) =>
      cfg.composeTargetOk === false
        ? { ok: false, reason: `${file} is git-ignored (a generated or build file) — an edit there would be lost.` }
        : { ok: true },
    composeSweepProject: async (_p: string) => {
      composeOps.push({ op: "sweepProject" });
      return { swept: [] };
    },

    // Stateful in-memory comment store (mirrors the repo-backed store's merge/append).
    listComments: async () => [...comments].sort((a, b) => a.id.localeCompare(b.id)),
    upsertComment: async (_p: string, thread: CommentThread) => {
      const i = comments.findIndex((t) => t.id === thread.id);
      const existing = i >= 0 ? comments[i] : null;
      const seen = new Set((existing?.messages ?? []).map((m) => m.id));
      const merged: CommentThread = existing
        ? { ...existing, ...thread, messages: [...existing.messages, ...thread.messages.filter((m) => !seen.has(m.id))] }
        : thread;
      if (i >= 0) comments[i] = merged;
      else comments.push(merged);
      return { thread: merged, path: `.vortspec/comments/${thread.id}.json` };
    },
    resolveComment: async (_p: string, id: string, resolved: boolean) => {
      const i = comments.findIndex((t) => t.id === id);
      if (i < 0) return null;
      comments[i] = { ...comments[i], resolved, updatedAt: comments[i].updatedAt };
      return { thread: comments[i], path: `.vortspec/comments/${id}.json` };
    },
    commentCollaborators: async () => cfg.collaborators ?? [],
    notifyComment: async () => ({ notified: false, reason: "GitHub not connected in tests." }),
    shareComments: async () => cfg.shareResult ?? { ok: true, message: "Pushed comment commits." },
  };

  (window as unknown as { vortspec: unknown }).vortspec = api;
  (window as unknown as { __runPrompts: string[] }).__runPrompts = runPrompts;
  (window as unknown as { __runOpts: Record<string, unknown>[] }).__runOpts = runOpts;
  // Let tests drive an IDE action (as if Claude called a tool) and inspect replies.
  (window as unknown as { __pushIdeAction: (a: IdeAction) => void }).__pushIdeAction = (a) => {
    for (const cb of ideActionSubs) cb(a);
  };
  (window as unknown as { __ideResolutions: IdeActionResult[] }).__ideResolutions = ideResolutions;
  (window as unknown as { __fsOps: typeof fsOps }).__fsOps = fsOps;
  (window as unknown as { __composeOps: typeof composeOps }).__composeOps = composeOps;
  (window as unknown as { __openInstalls: string[] }).__openInstalls = installOpens;
}
