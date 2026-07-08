/**
 * A browser-side stub of `window.vortspec` for component tests. It returns
 * fixture data for the read methods the views call on mount and replays a
 * recorded agent-event transcript when a run is started, so the Tokens /
 * Components / Playground views can be driven deterministically without Electron
 * or the real main process. Test-only: loose typing is intentional here.
 */
import type { RunEvent } from "../../../src/shared/run-events";
import type {
  InspectorTokensResult,
  InspectorComponentsResult,
  EnvCheck,
  DevServerStatus,
  ManifestResult,
  ManifestVersion,
  VerificationResult,
} from "../../../src/shared/ipc";

export interface MockConfig {
  tokens?: InspectorTokensResult;
  components?: InspectorComponentsResult;
  figmaMcp?: EnvCheck;
  /** Initial dev-server status returned by devServerStatus(). */
  devStatus?: DevServerStatus;
  /** Status returned by startDevServer() — defaults to a running server with a URL. */
  devStartStatus?: DevServerStatus;
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
  /** Whether hasActiveRun() reports an in-flight run for the project (reconnect banner). */
  hasActiveRun?: boolean;
  /** The resumable last run returned by lastRun() — drives the resume card. */
  lastRun?: import("../../../src/shared/ipc").LastRun | null;
  /** Usage snapshot returned by getUsage() — drives the Profile usage bars. */
  usage?: import("../../../src/shared/ipc").UsageResult;
  /** Profile returned by getProfile(). */
  profile?: import("../../../src/shared/ipc").Profile;
  /** Git status for the Source Control view. */
  gitStatus?: import("../../../src/shared/ipc").GitStatus;
  gitBranches?: import("../../../src/shared/ipc").GitBranch[];
  gitRemotes?: import("../../../src/shared/ipc").GitRemote[];
  githubAuth?: import("../../../src/shared/ipc").ProviderAuth;
  /** Versions returned by listManifestVersions(). */
  manifestVersions?: ManifestVersion[];
  /** Flow returned by getFlow() — used by the manifest screen to read approval. */
  flow?: { state: { currentStageId: string; stages: { id: string; status: string }[] } } | null;
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
  let runSeq = 0;
  // Flips true once a run's transcript has been replayed — lets getManifest
  // return the post-generation manifest (mirrors design-doc writing DESIGN.md).
  let generated = false;

  const startRun = async (): Promise<{ runId: string }> => {
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

    pickFolder: async () => null,
    createFolder: async () => null,
    listProjects: async () => [],
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
    githubAuth: async () =>
      cfg.githubAuth ?? { provider: "github", cliInstalled: true, authenticated: false, accounts: [], activeAccount: null, hint: "Run gh auth login." },
    getProfile: async () => cfg.profile ?? { name: "", avatarDataUrl: null, preferences: {} },
    saveProfile: async (p: import("../../../src/shared/ipc").Profile) => p,
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
    previewInfo: async () => cfg.previewInfo ?? { hasStorybook: false, script: "storybook" },
    storybookIndex: async () => cfg.storybookIndex ?? [],
    onDevServerUpdate: (cb: (e: { projectPath: string; status: DevServerStatus }) => void) => {
      devSubs.add(cb);
      return () => devSubs.delete(cb);
    },
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
}
