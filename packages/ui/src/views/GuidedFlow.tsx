import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FigmaComponent,
  FigmaConnection,
  InspectorComponent,
  LastRun,
  Project,
  ProjectConfig,
  VerificationResult,
} from "@vortspec/core/ipc";
import { DEFAULT_FLOW } from "@vortspec/core/flow";
import {
  buildOnePrompt,
  RESCAN_PROMPT,
  newComponentPrompt,
  newComponentFromFigmaNodePrompt,
  REFACTOR_PROMPT,
  RESUME_PROMPT,
  verifyPrompt,
  chunkByLevel,
  tierForChunk,
  buildChunkPrompt,
  addSourcePrompt,
  type FoundationMode,
  type AddedSource,
} from "@vortspec/core/sdd-prompts";
import { api } from "../lib/api";
import { useAgentRun, useLatestRun } from "../lib/useAgentRun";
import { deriveProgress, type OpKind } from "../lib/run-progress";
import { routedModel, modelHonored, disableRouting, isRoutingDisabled, type ModelTier } from "../lib/model-routing";
import { Button, Card, Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";
import { RunProgress } from "../components/RunProgress";
import { ProjectRail, projectRailItems } from "../components/ProjectRail";

/**
 * The Design System workspace (design: "Guided Flow.dc.html", reframed to v2).
 * A design system grows, so this is not a linear flow that "completes" — it is a
 * living workspace: a one-time Foundation (source → tokens → detect), a
 * continuous component roster with file-derived status where you build one or all
 * and keep adding (incl. brand-new components), and on-demand Outputs (regenerate
 * the manifest, optional publish). Claude Code is the engine for every action.
 */

const FOUNDATION_DEF = DEFAULT_FLOW.find((d) => d.kind === "source")!;

/** Resolve once the managed dev server for this project reports a live URL. */
function waitForDevUrl(projectPath: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: string | null): void => {
      if (settled) return;
      settled = true;
      off();
      clearTimeout(timer);
      resolve(v);
    };
    const off = api.onDevServerUpdate(({ projectPath: p, kind, status }) => {
      if (p !== projectPath || kind !== "storybook") return;
      if (status.state === "running" && status.url) finish(status.url);
      else if (status.state === "error" || status.state === "stopped") finish(null);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/** Map the file-derived inspector status to the roster's display vocabulary. */
type RosterStatus = "detected" | "built" | "verified" | "issues";
function rosterStatus(c: InspectorComponent): RosterStatus {
  if (c.status === "verified") return "verified";
  if (c.status === "has-issues") return "issues";
  if (c.status === "built") return "built";
  return "detected";
}
const STATUS_META: Record<RosterStatus, { label: string; dot: string; text: string }> = {
  detected: { label: "detected", dot: "bg-vs-text-muted", text: "text-vs-text-muted" },
  built: { label: "built", dot: "bg-vs-text-secondary", text: "text-vs-text-secondary" },
  verified: { label: "verified", dot: "bg-vs-success", text: "text-vs-success" },
  issues: { label: "has issues", dot: "bg-vs-warning", text: "text-vs-warning" },
};

const LEVEL_ORDER = ["atom", "molecule", "organism", "other"] as const;
const LEVEL_LABEL: Record<string, string> = {
  atom: "Atoms",
  molecule: "Molecules",
  organism: "Organisms",
  other: "Components",
};
/** Per-level accent swatches (design: Design System Dashboard.dc.html). */
const LEVEL_SWATCH: Record<string, string> = {
  atom: "#7C6FF0",
  molecule: "#4CB8C4",
  organism: "#C48A4C",
  other: "#6B7280",
};

export function GuidedFlow({
  project,
  hideRail = false,
  onBack,
  onOpenInspector,
  onOpenPreview,
  onOpenRun,
  onOpenVerify,
  onOpenHistory,
  onOpenManifest,
  onOpenSource,
  onOpenRunApp,
  onOpenTasks,
}: {
  project: Project;
  /** Hide the internal ProjectRail — the IDE embeds this with its own ActivityBar. */
  hideRail?: boolean;
  onBack: () => void;
  onOpenInspector: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
  onOpenVerify: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
  onOpenSource: () => void;
  onOpenRunApp: () => void;
  onOpenTasks: () => void;
}): React.JSX.Element {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [components, setComponents] = useState<InspectorComponent[] | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [manifestExists, setManifestExists] = useState(false);
  const [foundationOpen, setFoundationOpen] = useState(false);
  const [addNew, setAddNew] = useState(false);
  // Figma component reconciliation (Wave 3): figma-cli reads the design system's
  // components; the cockpit reconciles the code roster against them.
  const [figmaOnly, setFigmaOnly] = useState<FigmaComponent[]>([]);
  const [figmaCompSynced, setFigmaCompSynced] = useState(false);
  const [figmaCli, setFigmaCli] = useState<FigmaConnection | null>(null);
  const [compSyncing, setCompSyncing] = useState(false);
  const [toast, setToast] = useState("");

  const run = useAgentRun();
  const latest = useLatestRun();
  const [runLabel, setRunLabel] = useState("");
  const [opKind, setOpKind] = useState<OpKind>("other");
  const [pipelineTotal, setPipelineTotal] = useState<number | undefined>(undefined);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [harnessMsg, setHarnessMsg] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [externalRun, setExternalRun] = useState(false);
  const [resume, setResume] = useState<LastRun | null>(null);
  const runDismissRef = useRef(false);
  // Chunked build: a queue of component groups built one run at a time, so
  // partial results (Storybook + manifest) land after every chunk. Driven off
  // the run-done effect below (start resolves on kick-off, not completion).
  const [chunksActive, setChunksActive] = useState(false);
  const chunkQueueRef = useRef<
    null | { chunks: InspectorComponent[][]; index: number; verify: boolean; url: string | null; isFigma: boolean }
  >(null);
  const cancelChunksRef = useRef(false);

  async function reload(): Promise<void> {
    const [cfg, comps, toks, man] = await Promise.all([
      api.projectConfig(project.path),
      api.inspectorComponents(project.path),
      api.inspectorTokens(project.path),
      api.getManifest(project.path),
    ]);
    setConfig(cfg);
    setComponents(comps.components);
    setFigmaOnly(comps.figmaOnly ?? []);
    setFigmaCompSynced(comps.figmaSynced ?? false);
    setTokenCount(toks.tokens.length);
    setManifestExists(man.exists);
  }

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  // Prefer figma-cli to read components; fall back to the re-scan (MCP) run when
  // the CLI isn't connected. Symmetric with the token Inspector's sync.
  async function syncComponents(): Promise<void> {
    if (figmaCli?.connected) {
      setCompSyncing(true);
      try {
        const r = await api.figmaSyncComponents(project.path);
        if (r.ok) {
          await reload();
          flash(r.message);
        } else {
          flash(r.message);
        }
      } finally {
        setCompSyncing(false);
      }
      return;
    }
    flash("Connect figma-cli to read components directly, or use ↻ Re-scan (via the Figma MCP).");
  }

  // Convenience for figma-cli users: build the node currently selected in Figma
  // Desktop through the same gated build. Reuses op() — the SDD-DE cycle and
  // gates are unchanged; this only supplies the node the user picked.
  async function buildFigmaSelection(): Promise<void> {
    const sel = await api.figmaSelection();
    if (sel.nodes.length === 0) {
      flash(sel.message);
      return;
    }
    if (sel.nodes.length > 1) {
      flash("Select a single Figma node to build.");
      return;
    }
    const node = sel.nodes[0]!;
    await op(
      `Building "${node.name}" from the Figma selection`,
      newComponentFromFigmaNodePrompt(node.name, node.id),
      { kind: "build" },
    );
  }

  useEffect(() => {
    void reload();
    void api.figmaStatus().then(setFigmaCli);
    // A run may already be in flight for this project (started here before we
    // navigated away, or from another screen) — reflect it so we don't start a
    // duplicate and the user can go watch it.
    void api.hasActiveRun(project.path).then(setExternalRun);
    // Offer to resume the previous run if it was interrupted (cancel/crash/fail).
    void api.lastRun(project.path).then(setResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // When any run finishes, re-read the roster from files (status is file-derived)
  // and, for verify/pipeline runs, load the report summary for the outcome card.
  useEffect(() => {
    if (run.model.status === "done") {
      // R2 capability probe: if we requested a cheaper tier but the session ran a
      // different model, this login doesn't honor `--model` — disable routing for
      // the rest of the session and say so once (never a hard error).
      const tier = lastTierRef.current;
      lastTierRef.current = null;
      if (tier && !isRoutingDisabled() && !modelHonored(tier, run.model.model)) {
        disableRouting();
        flash("Your Claude plan runs everything on its default model — model routing is off.");
      }
      void reload();
      // Refresh resume state (a completed run clears it) after this run finishes.
      void api.lastRun(project.path).then(setResume);
      if (opKind === "verify" || opKind === "pipeline") {
        void api.getVerification(project.path).then(setVerifyResult);
      }
      // Advance a chunked build: the just-built chunk refreshed the roster above;
      // start the next one (or finish the queue).
      if (chunkQueueRef.current) void runNextChunk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  // Follow an externally-started run so the "in progress" banner clears when it ends.
  useEffect(() => {
    if (externalRun && latest.model.status === "done") setExternalRun(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest.model.status]);

  // The model tier requested for the in-flight run, so the done-effect can detect
  // whether the login actually honored `--model` (R2 capability probe).
  const lastTierRef = useRef<ModelTier | null>(null);

  async function op(
    label: string,
    prompt: string,
    opts?: { tools?: string[]; kind?: OpKind; total?: number; resumeSessionId?: string; model?: ModelTier },
  ): Promise<void> {
    const kind = opts?.kind ?? "other";
    setRunLabel(label);
    setVerifyResult(null);
    setShowTranscript(false);
    setOpKind(kind);
    setPipelineTotal(opts?.total);
    setResume(null);
    runDismissRef.current = false;
    lastTierRef.current = opts?.model ?? null;
    await run.start({
      prompt,
      cwd: project.path,
      allowedTools: opts?.tools ?? ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
      resumeSessionId: opts?.resumeSessionId,
      // Route mechanical/structured steps to a cheaper tier when the login allows.
      model: opts?.model ? routedModel(opts.model) : undefined,
      // Persisted so an interrupted run can be resumed with its stage view intact.
      meta: { kind, label, total: opts?.total },
    });
  }

  /** Resume the previous interrupted run's own Claude Code session. */
  async function resumeRun(): Promise<void> {
    if (!resume?.sessionId) return;
    const kind = (resume.kind as OpKind) || "other";
    if (kind === "verify" || kind === "pipeline") await ensureHarness();
    await op(resume.label || resume.title || "Resuming the previous run", RESUME_PROMPT, {
      kind,
      total: resume.total ?? undefined,
      resumeSessionId: resume.sessionId,
    });
  }

  /**
   * Bring the project's managed dev/storybook server up so a verify run has a
   * live surface to inspect, and return its URL. Idempotent; returns null (and
   * verify degrades to a code-level audit) when the project has no run script.
   */
  async function ensureHarness(): Promise<string | null> {
    const status = await api.devServerStatus(project.path);
    if (status.state === "running" && status.url) return status.url;
    const info = await api.previewInfo(project.path);
    if (!info.script) return null;
    setHarnessMsg("Starting the preview harness…");
    try {
      const started = await api.startDevServer(project.path);
      if (started.state === "running" && started.url) return started.url;
      return await waitForDevUrl(project.path, 90_000);
    } finally {
      setHarnessMsg("");
    }
  }

  async function verify(target: string, label: string): Promise<void> {
    const url = await ensureHarness();
    // R3: verification is structured checking (visual-verify + adversarial review),
    // not deep reasoning — route it to Sonnet. Build/implement stays on the default.
    await op(label, verifyPrompt(target, url, config?.designSource === "figma"), { kind: "verify", model: "sonnet" });
  }

  /**
   * Build the not-yet-built components in CHUNKS of five rather than one long run.
   * Each chunk is a separate `claude -p` process routed by complexity
   * (atoms/molecules → Haiku, organisms → Sonnet) and, when it finishes,
   * regenerates Storybook + the manifest — so the first five are usable before
   * the rest are built. Sequencing is driven by the run-done effect (below),
   * because `run.start` resolves on kick-off, not completion.
   */
  async function buildRemaining(verify: boolean): Promise<void> {
    if (remaining.length === 0 || busy) return;
    const chunks = chunkByLevel(remaining, 5);
    // A live preview surface for the per-chunk verify/storybook steps (idempotent).
    const url = verify ? await ensureHarness() : null;
    cancelChunksRef.current = false;
    chunkQueueRef.current = {
      chunks,
      index: 0,
      verify,
      url,
      isFigma: config?.designSource === "figma",
    };
    setChunksActive(true);
    await runNextChunk();
  }

  /** Kick off the next queued chunk, or finish the queue when done/cancelled. */
  async function runNextChunk(): Promise<void> {
    const q = chunkQueueRef.current;
    if (!q || cancelChunksRef.current || q.index >= q.chunks.length) {
      chunkQueueRef.current = null;
      setChunksActive(false);
      return;
    }
    const chunk = q.chunks[q.index]!;
    const names = chunk.map((c) => c.name);
    const label = `Chunk ${q.index + 1}/${q.chunks.length} — ${q.verify ? "building & verifying" : "building"} ${
      names.length
    } component${names.length === 1 ? "" : "s"}`;
    q.index += 1;
    await op(
      label,
      buildChunkPrompt(names, {
        url: q.url,
        isFigma: q.isFigma,
        verify: q.verify,
        storybook: true,
        manifest: true,
      }),
      { kind: "pipeline", total: chunk.length, model: tierForChunk(chunk) },
    );
  }

  /** Stop the chunked build: cancel the in-flight run and drop the remaining queue. */
  async function stopChunks(): Promise<void> {
    cancelChunksRef.current = true;
    chunkQueueRef.current = null;
    setChunksActive(false);
    await run.cancel();
  }

  const total = components?.length ?? 0;
  const builtCount = components?.filter((c) => rosterStatus(c) !== "detected").length ?? 0;
  const verifiedCount = components?.filter((c) => rosterStatus(c) === "verified").length ?? 0;
  const remaining = components?.filter((c) => rosterStatus(c) === "detected") ?? [];
  // Foundation is established once tokens exist or components have been detected.
  const foundationReady = (tokenCount ?? 0) > 0 || total > 0;

  const groups = useMemo(() => {
    if (!components) return [];
    return LEVEL_ORDER.map((level) => ({
      level,
      items: components.filter((c) => (c.level ?? "other") === level),
    })).filter((g) => g.items.length > 0);
  }, [components]);

  const running = run.running;
  // A run is in flight either here or (adopted) elsewhere for this project, or a
  // chunked build is between chunks (queue still draining).
  const busy = running || externalRun || chunksActive;
  const showRunCard = running || (run.model.status === "done" && !runDismissRef.current);
  const showsOutcome = opKind === "verify" || opKind === "pipeline";
  const openFindings = verifyResult?.findings.filter((f) => f.status === "open") ?? [];
  // Holistic stage/progress view of the current run (build, verify, pipeline, …).
  const progress = deriveProgress(run.model, opKind, { total: pipelineTotal });

  const status = !foundationReady
    ? "Set up the foundation to begin"
    : `Foundation ready · ${builtCount}/${total} built · ${verifiedCount} verified`;

  return (
    <div
      className={`flex w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary ${
        hideRail ? "h-full min-h-0" : "h-[calc(100vh-3rem)]"
      }`}
    >
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-vs-border-default bg-vs-bg-elevated px-4 py-2 text-[12px] text-vs-text-primary shadow-lg">
          {toast}
        </div>
      )}
      {!hideRail && (
        <ProjectRail
          project={project}
          onHeaderClick={onBack}
          items={projectRailItems("flow", {
            onFlow: () => undefined,
            onRun: onOpenRun,
            onPlayground: onOpenPreview,
            onTokens: onOpenInspector,
            onManifest: onOpenManifest,
            onSource: onOpenSource,
            onRunApp: onOpenRunApp,
            onTasks: onOpenTasks,
            onHistory: onOpenHistory,
          })}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3.5 border-b border-vs-border-default px-8 pb-4 pt-5">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Design system</h1>
            {!foundationReady && <span className="text-xs text-vs-text-secondary">{status}</span>}
          </div>
          <div className="flex-1" />
          {/* Status pills — foundation state + built/verified counts (design: dashboard). */}
          {foundationReady && (
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-vs-success-border bg-vs-success-muted px-2.5 py-1 text-vs-success">
                <span className="h-1.5 w-1.5 rounded-full bg-vs-success" />
                foundation ready
              </span>
              <span className="rounded-full border border-vs-border-default px-2.5 py-1 text-vs-text-secondary">
                {builtCount}/{total} built
              </span>
              <span className="rounded-full border border-vs-border-default px-2.5 py-1 text-vs-text-secondary">
                {verifiedCount} verified
              </span>
            </div>
          )}
          {foundationReady && builtCount > 0 && (
            <>
              <button
                onClick={onOpenVerify}
                className="text-xs text-vs-text-secondary hover:text-vs-text-primary"
              >
                Verification report →
              </button>
              <Button
                variant="default"
                disabled={busy}
                onClick={() => void verify("all", "Verifying all built components")}
              >
                Verify all
              </Button>
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-16 pt-6">
          <div className="mx-auto flex max-w-[720px] flex-col gap-5">
            {/* The previous run was interrupted — offer to pick up where it stopped. */}
            {resume?.sessionId && !busy && !showRunCard && (
              <Card className="flex items-center gap-3 border-vs-warning-border bg-vs-warning-muted p-3 text-xs">
                <span className="text-vs-warning">⤺</span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-vs-text-primary">
                    “{resume.label || resume.title}” was interrupted.
                  </span>
                  <span className="text-vs-text-secondary">
                    Resume picks up where it stopped — already-finished work is skipped, not redone.
                  </span>
                </div>
                <Button variant="primary" onClick={() => void resumeRun()}>
                  Resume
                </Button>
                <button
                  onClick={() => setResume(null)}
                  className="text-vs-text-muted hover:text-vs-text-primary"
                  title="Dismiss — you can still re-run the action; completed work is skipped either way."
                >
                  Dismiss
                </button>
              </Card>
            )}

            {/* A run started elsewhere for this project is still going. */}
            {externalRun && !running && (
              <Card className="flex items-center gap-2 p-3 text-xs text-vs-text-secondary">
                <Spinner />
                <span className="flex-1">A run is in progress for this project.</span>
                <button onClick={onOpenRun} className="text-vs-accent hover:underline">
                  Watch it →
                </button>
              </Card>
            )}

            {/* Active run */}
            {showRunCard && (
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2 text-sm text-vs-text-primary">
                  {running ? <Spinner /> : <span className="text-vs-success">✓</span>}
                  <span className="flex-1">{harnessMsg || runLabel || "Working…"}</span>
                  {running && chunksActive && (
                    <button
                      onClick={() => void stopChunks()}
                      className="rounded-md border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary hover:border-vs-warning hover:text-vs-text-primary"
                      title="Stop after cancelling the current chunk — already-built components are kept."
                    >
                      Stop
                    </button>
                  )}
                  {!running && (
                    <button
                      onClick={() => {
                        runDismissRef.current = true;
                        setShowTranscript(false);
                        run.reset();
                      }}
                      className="rounded-md border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
                    >
                      Dismiss
                    </button>
                  )}
                </div>

                {/* Holistic stage/progress view — the same structure for every action. */}
                <RunProgress progress={progress} running={running} />

                {running && (
                  <p className="text-xs text-vs-text-muted">
                    Running in the background — you can leave this screen; it keeps going.
                  </p>
                )}

                {/* Verify/pipeline outcome summary from the report files. */}
                {!running && showsOutcome && verifyResult && (
                  <div className="text-sm">
                    {openFindings.length === 0 ? (
                      <span className="text-vs-success">✓ Verification passed — no open findings.</span>
                    ) : (
                      <span className="text-vs-warning">
                        ⚠ {openFindings.length} open finding{openFindings.length === 1 ? "" : "s"}
                        {openFindings[0] ? ` — e.g. ${openFindings[0].component}: ${openFindings[0].title}` : ""}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 text-xs">
                  {showsOutcome && (
                    <button onClick={onOpenVerify} className="text-vs-accent hover:underline">
                      Verification report →
                    </button>
                  )}
                  <button
                    onClick={() => setShowTranscript((v) => !v)}
                    className="text-vs-text-secondary hover:text-vs-text-primary"
                  >
                    {showTranscript ? "Hide details" : "View details"}
                  </button>
                </div>

                {showTranscript && (
                  <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
                )}
              </Card>
            )}

            {!foundationReady ? (
              <FoundationSetup
                config={config}
                running={busy}
                onRun={() =>
                  void op(
                    "Connecting the design source — extracting tokens + detecting components",
                    FOUNDATION_DEF.promptTemplate ?? "Extract tokens and detect components.",
                    { tools: FOUNDATION_DEF.allowedTools, kind: "source" },
                  )
                }
              />
            ) : (
              <>
                <FoundationHeader
                  config={config}
                  tokenCount={tokenCount ?? 0}
                  componentCount={total}
                  open={foundationOpen}
                  onToggle={() => setFoundationOpen((v) => !v)}
                  running={busy}
                  onReSource={(mode, source) =>
                    void op(
                      mode === "merge"
                        ? "Merging the new source into the design system"
                        : "Rebuilding the foundation from the new source",
                      addSourcePrompt(mode, source),
                      { tools: FOUNDATION_DEF.allowedTools, kind: "source" },
                    )
                  }
                  onPickFolder={() => api.pickFolder(false).then((r) => r?.path ?? null).catch(() => null)}
                  onOpenTokens={onOpenInspector}
                />

                {/* Components */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="flex items-baseline gap-2 text-[13px] font-semibold text-vs-text-primary">
                      Components <span className="font-mono text-[11px] font-normal text-vs-text-muted">{total}</span>
                    </h2>
                    {figmaCompSynced && (
                      <span className="text-[11px] text-vs-text-muted">
                        {components?.filter((c) => c.figmaBacked).length ?? 0} in Figma ·{" "}
                        {figmaOnly.length} not built
                      </span>
                    )}
                    <div className="flex-1" />
                    {figmaCli?.connected && (
                      <Button
                        variant="default"
                        disabled={busy || compSyncing}
                        title="Read the design system's components straight from Figma via figma-cli (fast, no token) and reconcile against your code roster."
                        onClick={() => void syncComponents()}
                      >
                        {compSyncing ? "Reading…" : figmaCompSynced ? "↻ Figma components" : "Read Figma components"}
                      </Button>
                    )}
                    <Button
                      variant="default"
                      disabled={busy}
                      title="Re-read the design source and reconcile: refresh tokens and add any newly-detected components. Never touches built code."
                      onClick={() =>
                        void op(
                          `Re-scanning ${config?.designSource === "figma" ? "Figma" : "the design source"} — reconciling tokens + components`,
                          RESCAN_PROMPT,
                          { tools: FOUNDATION_DEF.allowedTools, kind: "source" },
                        )
                      }
                    >
                      ↻ Re-scan {config?.designSource === "figma" ? "Figma" : "source"}
                    </Button>
                    {remaining.length > 0 && (
                      <>
                        <Button
                          variant="default"
                          disabled={busy}
                          title="Build the remaining components in chunks of five — each chunk on a cheaper model by complexity, followed by Storybook + manifest so the first results are usable right away."
                          onClick={() => void buildRemaining(false)}
                        >
                          Build only ({remaining.length})
                        </Button>
                        <Button
                          variant="default"
                          disabled={busy}
                          title="Build every detected component in chunks of five and verify each — the CLI's Apply → Visual-Verify → Adversarial-Review cycle, per chunk."
                          onClick={() => void buildRemaining(true)}
                        >
                          Build &amp; verify the rest ({remaining.length})
                        </Button>
                      </>
                    )}
                    {figmaCli?.connected && (
                      <Button
                        variant="default"
                        disabled={busy}
                        title="Build the component/frame currently selected in Figma Desktop — reads your selection via figma-cli and runs the same gated build."
                        onClick={() => void buildFigmaSelection()}
                      >
                        Build Figma selection
                      </Button>
                    )}
                    <Button variant="primary" disabled={busy} onClick={() => setAddNew(true)}>
                      + New component
                    </Button>
                  </div>

                  {addNew && (
                    <NewComponentForm
                      disabled={busy}
                      onCancel={() => setAddNew(false)}
                      onCreate={(name, intent) => {
                        setAddNew(false);
                        void op(`Creating the "${name}" component`, newComponentPrompt(name, intent), { kind: "build" });
                      }}
                    />
                  )}

                  {components === null ? (
                    <Card className="flex items-center gap-2 p-4 text-sm text-vs-text-secondary">
                      <Spinner /> Reading components…
                    </Card>
                  ) : total === 0 ? (
                    <Card className="p-6 text-center text-sm text-vs-text-muted">
                      No components detected yet. Re-extract the foundation, or add one above.
                    </Card>
                  ) : (
                    <Card className="flex flex-col overflow-hidden p-0">
                      {groups.map((g, gi) => (
                        <div key={g.level}>
                          <div
                            className={`flex items-center gap-2 bg-vs-bg-surface px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-vs-text-secondary ${
                              gi > 0 ? "border-t border-vs-border-default" : ""
                            }`}
                          >
                            <span
                              className="h-2 w-2 rounded-[2px]"
                              style={{ background: LEVEL_SWATCH[g.level] ?? LEVEL_SWATCH.other }}
                            />
                            {LEVEL_LABEL[g.level]} <span className="text-vs-text-muted">{g.items.length}</span>
                          </div>
                          {g.items.map((c) => (
                            <ComponentRow
                              key={c.name}
                              component={c}
                              disabled={busy}
                              onBuild={() =>
                                void op(`Building "${c.name}"`, buildOnePrompt(c.name, c.level), {
                                  kind: "build",
                                  model: tierForChunk([c]),
                                })
                              }
                              onVerify={() => void verify(c.name, `Verifying "${c.name}"`)}
                              onOpen={onOpenPreview}
                            />
                          ))}
                        </div>
                      ))}
                    </Card>
                  )}

                  {figmaOnly.length > 0 && (
                    <Card className="flex flex-col gap-2 p-4">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-accent" />
                        <span className="font-semibold uppercase tracking-wide text-vs-text-muted">
                          In Figma, not yet built
                        </span>
                        <span className="text-vs-text-muted">· {figmaOnly.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {figmaOnly.slice(0, 24).map((c) => (
                          <span
                            key={c.name}
                            title={
                              c.variants.length
                                ? `Variant axes: ${c.variants.join(", ")}`
                                : "A Figma component with no matching code component yet"
                            }
                            className="rounded-full border border-vs-border-default bg-vs-bg-surface px-2 py-0.5 font-mono text-[11px] text-vs-text-secondary"
                          >
                            {c.name}
                            {c.variants.length > 0 && (
                              <span className="text-vs-text-muted"> ·{c.variants.length}</span>
                            )}
                          </span>
                        ))}
                        {figmaOnly.length > 24 && (
                          <span className="px-1 text-[11px] text-vs-text-muted">
                            +{figmaOnly.length - 24} more
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-vs-text-muted">
                        Components designed in Figma with no code match. Use “+ New component” to build one.
                      </p>
                    </Card>
                  )}
                </section>

                {/* Outputs */}
                <section className="flex flex-col gap-3">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">
                    Outputs
                  </h2>
                  <OutputCard
                    title="Design manifest"
                    mono="DESIGN.md"
                    desc={
                      manifestExists
                        ? "The AI hand-off file. Regenerate it after adding or changing components."
                        : "Generate DESIGN.md — the tokens, component contracts, and conventions any AI agent reads to build on-brand screens."
                    }
                    cta={manifestExists ? "Open manifest" : "Generate manifest"}
                    onClick={onOpenManifest}
                  />
                  <OutputCard
                    title="Refactor existing screens"
                    optional
                    disabled={busy || !manifestExists}
                    desc={
                      manifestExists
                        ? "Non-destructive. Duplicate this repo's existing screens onto the built components as new parallel files (originals untouched) + a MIGRATION.md, so your team can switch over on their own timeline. Publish from Source Control."
                        : "Generate DESIGN.md first — the refactor duplicates your screens onto the built design system."
                    }
                    cta="Refactor screens (non-destructive)"
                    onClick={() =>
                      void op("Duplicating screens onto the design system (non-destructive)", REFACTOR_PROMPT, {
                        kind: "build",
                      })
                    }
                  />
                  <OutputCard
                    title="GitHub & source control"
                    optional
                    desc="Connect GitHub, create/switch branches, and stage · commit · pull · push these components, tokens, and DESIGN.md — all in Source Control."
                    cta="Open Source Control"
                    onClick={onOpenSource}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Foundation ───────────────────────────────────────────────────────

function FoundationSetup({
  config,
  running,
  onRun,
}: {
  config: ProjectConfig | null;
  running: boolean;
  onRun: () => void;
}): React.JSX.Element {
  const source =
    config?.designSource === "figma"
      ? config.figmaFileUrl || "Figma file"
      : config?.designSource === "zip"
        ? config.zipFilePath || "ZIP archive"
        : config?.designSource === "github"
          ? config.githubRepoUrl || "GitHub repository"
          : (config?.designSource ?? "your configured source");
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-semibold">Set up the foundation</h2>
        <p className="text-xs leading-relaxed text-vs-text-secondary">
          Claude Code reads <span className="font-mono text-vs-text-primary">{source}</span>,
          extracts the design tokens, and detects every component — the base your design system is
          built from. No brief needed.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-3">
        <Row label="Source" value={String(config?.designSource ?? "—")} />
        <Row
          label="Target"
          value={`${config?.framework ?? "—"} · ${config?.language ?? "—"} · ${config?.styling ?? "—"}`}
        />
        <Row label="Tokens →" value={config?.tokenFile ?? "—"} mono />
        <Row label="Components →" value={config?.componentDir ?? "—"} mono />
      </div>
      <div>
        <Button variant="primary" disabled={running} onClick={onRun}>
          Extract tokens &amp; detect components
        </Button>
      </div>
    </Card>
  );
}

function FoundationHeader({
  config,
  tokenCount,
  componentCount,
  open,
  onToggle,
  running,
  onReSource,
  onPickFolder,
  onOpenTokens,
}: {
  config: ProjectConfig | null;
  tokenCount: number;
  componentCount: number;
  open: boolean;
  onToggle: () => void;
  running: boolean;
  /** Re-run the Foundation against a source, replacing (clean-sweep) or merging. */
  onReSource: (mode: FoundationMode, source: AddedSource) => void;
  /** Pick a local folder/zip as a source; resolves to its path or null. */
  onPickFolder: () => Promise<string | null>;
  onOpenTokens: () => void;
}): React.JSX.Element {
  const sourceLabel = config?.designSource ?? "source";
  return (
    <Card className="flex flex-col p-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-2.5 px-4 py-3 text-left hover:bg-vs-bg-hover"
      >
        <span
          className="text-[10px] text-vs-text-muted transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span className="text-[13px] font-semibold text-vs-text-primary">Foundation</span>
        <span className="font-mono text-[11px] text-vs-text-secondary">
          {sourceLabel} · {tokenCount} tokens · {componentCount} components
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-vs-success">ready</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-vs-border-default px-4 py-3.5">
          <div className="flex flex-col gap-1.5">
            <Row label="Design source" value={String(config?.designSource ?? "—")} />
            <Row
              label="Target"
              value={`${config?.framework ?? "—"} · ${config?.language ?? "—"} · ${config?.styling ?? "—"}`}
            />
            <Row label="Tokens →" value={config?.tokenFile ?? "—"} mono />
            <Row label="Components →" value={config?.componentDir ?? "—"} mono />
          </div>
          <Button variant="default" onClick={onOpenTokens}>
            View tokens
          </Button>
          <AddSourcePanel
            defaultFigmaUrl={config?.figmaFileUrl ?? ""}
            running={running}
            onReSource={onReSource}
            onPickFolder={onPickFolder}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * Re-source the Foundation (change: ide-guided-flow-parity Steps 4/5). A Figma URL
 * (prefilled from the project's configured file) or a picked local folder/zip, plus
 * the Clean-sweep vs Merge choice — only shown once a foundation already exists.
 */
function AddSourcePanel({
  defaultFigmaUrl,
  running,
  onReSource,
  onPickFolder,
}: {
  defaultFigmaUrl: string;
  running: boolean;
  onReSource: (mode: FoundationMode, source: AddedSource) => void;
  onPickFolder: () => Promise<string | null>;
}): React.JSX.Element {
  const [url, setUrl] = useState(defaultFigmaUrl);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const source: AddedSource = localPath ? { kind: "local", ref: localPath } : { kind: "figma", ref: url.trim() };
  const canRun = localPath ? true : url.trim().length > 0;
  return (
    <div
      className="flex flex-col gap-2 rounded border border-vs-border-default bg-vs-bg-surface p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // A dropped folder or .zip becomes a local source (the engine extracts a zip).
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        const p = f ? api.getPathForFile(f) : "";
        if (p) {
          setLocalPath(p);
          setUrl("");
        }
      }}
    >
      <span className="text-[11px] font-semibold text-vs-text-secondary">Add a design source</span>
      <input
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setLocalPath(null);
        }}
        placeholder="Figma file URL"
        className="w-full rounded border border-vs-border-default bg-vs-bg-primary px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
      />
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          onClick={async () => {
            const p = await onPickFolder();
            if (p) setLocalPath(p);
          }}
        >
          Pick a folder…
        </Button>
        <Button
          variant="default"
          onClick={async () => {
            const p = await api.pickFile([{ name: "ZIP archive", extensions: ["zip"] }]);
            if (p) {
              setLocalPath(p);
              setUrl("");
            }
          }}
        >
          Choose .zip…
        </Button>
        {localPath && <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-vs-text-muted">{localPath}</span>}
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button variant="primary" disabled={running || !canRun} onClick={() => onReSource("merge", source)}>
          Merge
        </Button>
        <Button variant="default" disabled={running || !canRun} onClick={() => onReSource("clean-sweep", source)}>
          Clean sweep
        </Button>
      </div>
      <p className="text-[10px] leading-relaxed text-vs-text-muted">
        <b>Merge</b> adds new tokens &amp; components (same-name conflicts are flagged, not overwritten). <b>Clean sweep</b>{" "}
        replaces the design system from this source.
      </p>
    </div>
  );
}

// ── Component roster ─────────────────────────────────────────────────

function ComponentRow({
  component,
  disabled,
  onBuild,
  onVerify,
  onOpen,
}: {
  component: InspectorComponent;
  disabled: boolean;
  onBuild: () => void;
  onVerify: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const s = rosterStatus(component);
  const meta = STATUS_META[s];
  const isBuilt = s !== "detected";
  return (
    <div className="grid grid-cols-[10px_minmax(0,200px)_1fr_auto_auto] items-center gap-3.5 border-t border-vs-border-subtle px-4 py-2 transition-colors first:border-t-0 hover:bg-vs-bg-hover">
      <span className={`h-1.5 w-1.5 justify-self-center rounded-full ${meta.dot}`} />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-vs-text-primary">{component.name}</span>
        {component.figmaBacked && (
          <span
            title={
              component.figmaVariants && component.figmaVariants.length > 0
                ? `Backed by a Figma component · variant axes: ${component.figmaVariants.join(", ")}`
                : "Backed by a Figma component"
            }
            className="shrink-0 rounded-full border border-vs-accent/40 bg-vs-accent/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-vs-accent"
          >
            Figma{component.figmaVariants && component.figmaVariants.length > 0 ? ` ·${component.figmaVariants.length}` : ""}
          </span>
        )}
      </div>
      <span className="truncate text-[12px] text-vs-text-muted">{component.description ?? ""}</span>
      <span className={`font-mono text-[10.5px] ${meta.text}`}>{meta.label}</span>
      <div className="flex items-center gap-1.5">
        {isBuilt ? (
          <>
            <RowButton disabled={disabled} onClick={onVerify}>
              Verify
            </RowButton>
            <RowButton disabled={disabled} onClick={onOpen}>
              Open
            </RowButton>
          </>
        ) : (
          <RowButton disabled={disabled} primary onClick={onBuild}>
            Build
          </RowButton>
        )}
      </div>
    </div>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-vs-accent text-white hover:brightness-110"
          : "border border-vs-border-strong text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function NewComponentForm({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (name: string, intent: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const canCreate = name.trim().length > 0 && intent.trim().length > 0 && !disabled;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Component name — e.g. Tooltip"
        className="h-9 rounded-md border border-vs-border-default bg-vs-bg-primary px-3 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
      />
      <textarea
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        rows={2}
        placeholder="What it is and does — states, variants, when to use it."
        className="resize-none rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-vs-text-muted">
          Added to components.json and generated with the extracted tokens.
        </span>
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!canCreate} onClick={() => onCreate(name.trim(), intent.trim())}>
          Create component
        </Button>
      </div>
    </Card>
  );
}

// ── Outputs ──────────────────────────────────────────────────────────

function OutputCard({
  title,
  mono,
  desc,
  cta,
  optional,
  onClick,
  disabled,
}: {
  title: string;
  mono?: string;
  desc: string;
  cta: string;
  optional?: boolean;
  onClick: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-vs-text-primary">{title}</span>
          {mono && (
            <span className="rounded border border-vs-border-default px-1.5 py-px font-mono text-[10px] text-vs-text-secondary">
              {mono}
            </span>
          )}
          {optional && (
            <span className="rounded-full border border-vs-border-default px-1.5 text-[9px] uppercase tracking-wide text-vs-text-muted">
              optional
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-vs-text-secondary">{desc}</p>
      </div>
      <Button variant={optional ? "default" : "primary"} disabled={disabled} onClick={onClick}>
        {cta}
      </Button>
    </Card>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-28 shrink-0 text-vs-text-muted">{label}</span>
      <span className={`truncate text-vs-text-primary ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
