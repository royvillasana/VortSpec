/**
 * A browser-side stub of `window.vortspec` for component tests. It returns
 * fixture data for the read methods the views call on mount and replays a
 * recorded agent-event transcript when a run is started, so the Tokens /
 * Components / Playground views can be driven deterministically without Electron
 * or the real main process. Test-only: loose typing is intentional here.
 */
import type { RunEvent } from "@vortspec/core/run-events";
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
  /** Replayed to onAgentEvent subscribers (with the started run's id) on startRun. */
  runScript?: RunEvent[];
  /** Manifest returned by getManifest(). */
  manifest?: ManifestResult;
  /** Manifest returned by getManifest() after a run transcript completes (design-doc wrote it). */
  manifestAfterGenerate?: ManifestResult;
  /** Components returned by inspectorComponents() after a run transcript completes (built from files). */
  componentsAfterRun?: InspectorComponentsResult;
  /** Verification report returned by getVerification() — drives the verify outcome card. */
  verification?: VerificationResult;
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
  /** Workspace file tree for the IDE Explorer, keyed by relative dir ("" = root). */
  fsTree?: Record<string, import("@vortspec/core/ipc").FsEntry[]>;
  /** File contents for the IDE editor, keyed by relative path. */
  fsFiles?: Record<string, string>;
  /** Entries returned by searchFiles() — the @-mention picker (filtered by query). */
  searchResults?: import("@vortspec/core/ipc").FsEntry[];
  /** HEAD contents for git diffs, keyed by relative path. */
  fsHead?: Record<string, string>;
  /** Text emitted to onTerminalData shortly after a terminal session is created. */
  terminalGreeting?: string;
  /** Figma connection status returned by figmaStatus(). */
  figma?: import("@vortspec/core/ipc").FigmaConnection;
  /** Result returned by figmaSyncVariables(). */
  figmaSync?: import("@vortspec/core/ipc").FigmaSyncResult;
  /** Result returned by figmaSyncComponents(). */
  figmaSyncComponents?: import("@vortspec/core/ipc").FigmaSyncResult;
  /** Result returned by figmaSelection(). */
  figmaSelection?: import("@vortspec/core/ipc").FigmaSelection;
}

const EMPTY_TOKENS: InspectorTokensResult = {
  tokenFile: null,
  tokens: [],
  usage: {},
  figmaOnly: [],
  figmaSynced: false,
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
  let runSeq = 0;
  // Flips true once a run's transcript has been replayed — lets getManifest
  // return the post-generation manifest (mirrors design-doc writing DESIGN.md).
  let generated = false;

  // Records the prompt of every startRun so tests can assert what was actually
  // sent to Claude (e.g. injected IDE grounding) vs. what shows in the bubble.
  const runPrompts: string[] = [];
  const startRun = async (opts?: { prompt?: string }): Promise<{ runId: string }> => {
    if (typeof opts?.prompt === "string") runPrompts.push(opts.prompt);
    const runId = `run-${runSeq++}`;
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
    openInstall: async () => undefined,

    pickFolder: async () => cfg.pickFolderResult ?? null,
    createFolder: async () => null,
    listProjects: async () => cfg.projects ?? [],
    openFolder: async () => undefined,
    revealPath: async () => undefined,
    refreshProject: async (path: string) => ({ id: "p", name: "p", path }),
    createProject: async () => null,
    toolkitStatus: async () => ({ present: true, version: "1.0.0", updateAvailable: false }),
    installToolkit: async () => ({ present: true, version: "1.0.0", updateAvailable: false }),

    startRun,
    cancelRun: async () => undefined,
    hasActiveRun: async () => cfg.hasActiveRun ?? false,
    lastRun: async () => cfg.lastRun ?? null,
    getUsage: async () =>
      cfg.usage ?? { available: false, headline: null, limits: [], note: null, raw: "", capturedAt: "", error: "no usage" },

    // Git (source control)
    gitStatus: async () =>
      cfg.gitStatus ?? { isRepo: true, branch: "main", upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], conflicts: [], clean: true },
    gitBranches: async () => cfg.gitBranches ?? [{ name: "main", current: true, remote: false, upstream: null }],
    gitRemotes: async () => cfg.gitRemotes ?? [],
    gitLog: async () => [],
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
    searchFiles: async (_projectPath: string, query: string) =>
      (cfg.searchResults ?? []).filter((e) => e.path.toLowerCase().includes(query.toLowerCase())),
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

    setPublishTarget: async () => null,
    readArtifact: async () => null,
    findLatestArtifact: async () => null,
    projectConfig: async () => null,

    inspectorTokens: async () => cfg.tokens ?? EMPTY_TOKENS,
    inspectorComponents: async () =>
      (generated && cfg.componentsAfterRun) || cfg.components || EMPTY_COMPONENTS,
    setTokenValue: async () => cfg.tokens ?? EMPTY_TOKENS,
    getVerification: async () => cfg.verification ?? { findings: [] },
    snapshotComponent: async () => [],
    snapshotTokenScope: async () => [],
    restoreFiles: async () => undefined,
  };

  (window as unknown as { vortspec: unknown }).vortspec = api;
  (window as unknown as { __runPrompts: string[] }).__runPrompts = runPrompts;
  // Let tests drive an IDE action (as if Claude called a tool) and inspect replies.
  (window as unknown as { __pushIdeAction: (a: IdeAction) => void }).__pushIdeAction = (a) => {
    for (const cb of ideActionSubs) cb(a);
  };
  (window as unknown as { __ideResolutions: IdeActionResult[] }).__ideResolutions = ideResolutions;
}
