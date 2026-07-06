import { useEffect, useMemo, useState } from "react";
import type {
  Flow,
  Project,
  ProjectConfig,
  StageDef,
  StageState,
  StageStatus,
} from "../../../shared/ipc";
import {
  COMPONENTS_MANIFEST,
  detectedComponentsSchema,
  type DetectedComponent,
} from "../../../shared/flow";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Button, Card, Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";

/**
 * The guided SDD-DE flow (US-05..US-09), design "Guided Flow.dc.html" adapted to
 * v2: the CLI's steps as a vertical timeline of stage cards inside the shared
 * left-rail shell. The current stage expands inline (run, gate); nothing advances
 * without an explicit approval.
 */
export function GuidedFlow({
  project,
  onBack,
  onOpenInspector,
  onOpenPreview,
  onOpenRun,
}: {
  project: Project;
  onBack: () => void;
  onOpenInspector: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
}): React.JSX.Element {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void api.getFlow(project.path).then((f) => {
      setFlow(f);
      setSelectedId(f.state.currentStageId);
    });
    void api.projectConfig(project.path).then(setConfig);
  }, [project.path]);

  const currentIndex = flow
    ? flow.definitions.findIndex((d) => d.id === flow.state.currentStageId)
    : 0;

  const requiredDefs = flow?.definitions.filter((d) => !d.optional) ?? [];
  const requiredDone = flow
    ? requiredDefs.filter(
        (d) => flow.state.stages.find((s) => s.id === d.id)?.status === "approved",
      ).length
    : 0;
  const flowComplete = flow ? requiredDone === requiredDefs.length : false;
  const commitStage = flow?.definitions.find((d) => d.optional);
  const reviewStage = flow?.definitions.find(
    (d) => flow.state.stages.find((s) => s.id === d.id)?.status === "needs-review",
  );
  const progressLabel = !flow
    ? ""
    : flowComplete
      ? "Complete · commit optional"
      : `${requiredDone} of ${requiredDefs.length} approved${reviewStage ? ` · paused at ${reviewStage.title}` : ""}`;

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <FlowRail
        project={project}
        paused={Boolean(reviewStage)}
        onBack={onBack}
        onOpenRun={onOpenRun}
        onOpenPreview={onOpenPreview}
        onOpenInspector={onOpenInspector}
      />
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3.5 border-b border-vs-border-default px-8 pb-4 pt-5">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Guided flow</h1>
            <span className="text-xs text-vs-text-secondary">
              The SDD-DE cycle, driven through Claude Code
            </span>
          </div>
          <div className="flex-1" />
          <span className="font-mono text-xs text-vs-warning">{progressLabel}</span>
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-16 pt-7">
          {!flow ? (
            <div className="flex items-center gap-2 text-sm text-vs-text-secondary">
              <Spinner /> Loading flow…
            </div>
          ) : (
            <div className="mx-auto flex max-w-[640px] flex-col">
              {flowComplete && (
                <div className="mb-4">
                  <CompletionBanner
                    project={project}
                    published={flow.state.publishRepoUrl}
                    canPublish={Boolean(commitStage)}
                    onPublish={() => commitStage && setSelectedId(commitStage.id)}
                    onOpenInspector={onOpenInspector}
                    onBack={onBack}
                  />
                </div>
              )}
              {flow.definitions.map((def, i) => {
                const state = flow.state.stages.find((s) => s.id === def.id)!;
                return (
                  <TimelineStage
                    key={def.id}
                    project={project}
                    def={def}
                    state={state}
                    index={i}
                    isLast={i === flow.definitions.length - 1}
                    locked={i > currentIndex}
                    selected={def.id === selectedId}
                    config={config}
                    publishRepoUrl={flow.state.publishRepoUrl}
                    onSelect={() => setSelectedId(def.id)}
                    onFlow={setFlow}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** The shared app-shell left rail (Flow active). */
function FlowRail({
  project,
  paused,
  onBack,
  onOpenRun,
  onOpenPreview,
  onOpenInspector,
}: {
  project: Project;
  paused: boolean;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenPreview: () => void;
  onOpenInspector: () => void;
}): React.JSX.Element {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface p-3">
      <button
        onClick={onBack}
        title="All projects"
        className="mb-3 flex items-center gap-2 border-b border-vs-border-default px-2 pb-3 text-left hover:opacity-85"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-vs-accent font-mono text-[11px] font-medium text-vs-bg-primary">
          {project.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{project.name}</span>
          <span className="block truncate font-mono text-[11px] text-vs-text-muted">
            {project.path}
          </span>
        </span>
      </button>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2.5 rounded-md bg-vs-bg-elevated px-2 py-1.5 text-[13px] font-medium text-vs-accent">
          <span className="flex-1">Flow</span>
          {paused && (
            <span className="rounded-full border border-vs-warning-border px-1.5 font-mono text-[10px] text-vs-warning">
              review
            </span>
          )}
        </div>
        <RailLink label="Run" onClick={onOpenRun} />
        <RailLink label="Preview" onClick={onOpenPreview} />
        <RailLink label="Tokens" onClick={onOpenInspector} />
      </div>
    </nav>
  );
}

function RailLink({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
    >
      <span className="flex-1">{label}</span>
    </button>
  );
}

/** The gutter status ring for a timeline stage. */
function StageRing({
  status,
  locked,
  n,
}: {
  status: StageStatus;
  locked: boolean;
  n: number;
}): React.JSX.Element {
  const ringColor = locked
    ? "#34373D"
    : status === "approved"
      ? "#30A46C"
      : status === "running"
        ? "#7C6FF0"
        : status === "needs-review"
          ? "#FFB224"
          : "#34373D";
  return (
    <span
      className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px]"
      style={{ borderColor: ringColor, background: status === "approved" ? "#30A46C" : "transparent" }}
    >
      {status === "approved" ? (
        <span className="text-xs font-semibold text-vs-bg-primary">✓</span>
      ) : status === "running" ? (
        <Spinner />
      ) : status === "needs-review" ? (
        <span className="h-[7px] w-[7px] rounded-full bg-vs-warning" />
      ) : (
        <span className="font-mono text-[11px] text-vs-text-muted">{n}</span>
      )}
    </span>
  );
}

/** One stage in the vertical timeline: ring + card; expands to its body when selected. */
function TimelineStage({
  project,
  def,
  state,
  index,
  isLast,
  locked,
  selected,
  config,
  publishRepoUrl,
  onSelect,
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  index: number;
  isLast: boolean;
  locked: boolean;
  selected: boolean;
  config: ProjectConfig | null;
  publishRepoUrl?: string;
  onSelect: () => void;
  onFlow: (f: Flow) => void;
}): React.JSX.Element {
  const review = state.status === "needs-review";
  const artifact = def.artifact ?? def.artifactGlob;
  const edge =
    review && !selected
      ? "inset 2px 0 0 #FFB224"
      : state.status === "running"
        ? "inset 2px 0 0 #7C6FF0"
        : "none";
  return (
    <div className="flex gap-4">
      <div className="flex w-6 flex-none flex-col items-center">
        <StageRing status={state.status} locked={locked} n={index + 1} />
        {!isLast && (
          <span
            className="my-1 w-[1.5px] flex-1"
            style={{ background: state.status === "approved" ? "rgba(48,164,108,0.4)" : "#26282D" }}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-3.5">
        <div
          className="overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-surface"
          style={{ boxShadow: edge }}
        >
          <button
            onClick={locked ? undefined : onSelect}
            className={`flex w-full flex-col items-start gap-1.5 px-4 py-3.5 text-left ${
              locked ? "cursor-default opacity-50" : "hover:bg-vs-bg-hover"
            }`}
          >
            <div className="flex w-full items-center gap-2.5">
              <span
                className={`text-sm font-semibold ${
                  state.status === "pending" || locked ? "text-vs-text-secondary" : "text-vs-text-primary"
                }`}
              >
                {def.title}
              </span>
              <StatusBadge status={state.status} locked={locked} />
              {def.optional && (
                <span className="rounded-full border border-vs-border-default px-1.5 font-mono text-[9px] uppercase tracking-wide text-vs-text-muted">
                  opt
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-vs-text-secondary">{def.summary}</p>
            {artifact && (
              <span className="mt-0.5 rounded border border-vs-border-default bg-vs-bg-primary px-2 py-0.5 font-mono text-[11px] text-vs-text-secondary">
                {artifact.split("/").pop()}
              </span>
            )}
          </button>

          {review && !selected && (
            <div className="flex items-center gap-3 border-t border-vs-border-default bg-vs-warning-muted px-4 py-3">
              <span className="flex-1 text-xs text-vs-warning">
                Flow paused — this artifact needs your approval before implementation.
              </span>
              <Button variant="primary" onClick={onSelect}>
                Review →
              </Button>
            </div>
          )}
        </div>

        {selected && !locked && (
          <div className="mt-3">
            <StageBody
              project={project}
              def={def}
              state={state}
              config={config}
              publishRepoUrl={publishRepoUrl}
              onFlow={onFlow}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** The interactive body of the selected stage (run, gate, publish). */
function StageBody({
  project,
  def,
  state,
  config,
  publishRepoUrl,
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  config: ProjectConfig | null;
  publishRepoUrl?: string;
  onFlow: (f: Flow) => void;
}): React.JSX.Element {
  if (def.kind === "source")
    return (
      <AgentStage
        project={project}
        def={def}
        state={state}
        onFlow={onFlow}
        header={<SourceInfo config={config} />}
        runLabel="Connect & extract tokens + detect components"
      />
    );
  if (def.kind === "components")
    return <ComponentsStage project={project} def={def} state={state} onFlow={onFlow} />;
  if (def.optional)
    return (
      <PublishStage
        project={project}
        def={def}
        state={state}
        publishRepoUrl={publishRepoUrl}
        onFlow={onFlow}
      />
    );
  return <AgentStage project={project} def={def} state={state} onFlow={onFlow} />;
}

/** Shows the configured design source + build target for the design-system stage. */
function SourceInfo({ config }: { config: ProjectConfig | null }): React.JSX.Element {
  if (!config) {
    return (
      <Card className="p-4 text-sm text-vs-text-muted">Reading project configuration…</Card>
    );
  }
  const source =
    config.designSource === "figma"
      ? config.figmaFileUrl || "Figma file (URL not set)"
      : config.designSource === "library"
        ? `Component library: ${config.componentLibrary ?? "—"}`
        : config.designSource === "github"
          ? config.githubRepoUrl || "GitHub repository"
          : config.designSource === "zip"
            ? config.zipFilePath || "ZIP archive"
            : config.designSource === "stitch"
              ? `Google Stitch (${config.stitchConnection ?? "mcp"})`
              : "Not configured";
  return (
    <Card className="flex flex-col gap-2 p-4">
      <Row label="Design source" value={`${config.designSource ?? "—"}`} />
      <Row label="Source" value={source} mono />
      <Row
        label="Target"
        value={`${config.framework ?? "—"} · ${config.language ?? "—"} · ${config.styling ?? "—"}`}
      />
      <Row label="Tokens →" value={config.tokenFile ?? "—"} mono />
      <Row label="Components →" value={config.componentDir ?? "—"} mono />
      <p className="mt-1 text-xs text-vs-text-muted">
        No brief needed — the agent reads this source, extracts tokens &amp; variables, and
        generates every component.
      </p>
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

function StatusBadge({
  status,
  locked,
}: {
  status: StageStatus;
  locked: boolean;
}): React.JSX.Element {
  const map: Record<StageStatus, { label: string; color: string; border: string; bg: string }> = {
    approved: { label: "approved", color: "#30A46C", border: "rgba(48,164,108,0.35)", bg: "rgba(48,164,108,0.08)" },
    running: { label: "running", color: "#7C6FF0", border: "rgba(124,111,240,0.4)", bg: "rgba(124,111,240,0.08)" },
    "needs-review": { label: "needs review", color: "#FFB224", border: "rgba(255,178,36,0.4)", bg: "rgba(255,178,36,0.08)" },
    pending: { label: "pending", color: "#6B7280", border: "#26282D", bg: "#0B0C0E" },
    failed: { label: "failed", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.08)" },
  };
  const m = locked ? { label: "locked", color: "#6B7280", border: "#26282D", bg: "#0B0C0E" } : map[status];
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[10px]"
      style={{ color: m.color, borderColor: m.border, background: m.bg }}
    >
      {m.label}
    </span>
  );
}

// ── Stage: agent / source (+ gate) ───────────────────────────────────

function AgentStage({
  project,
  def,
  state,
  onFlow,
  header,
  runLabel,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  onFlow: (f: Flow) => void;
  header?: React.ReactNode;
  runLabel?: string;
}): React.JSX.Element {
  const run = useAgentRun();
  const [artifact, setArtifact] = useState<string | null>(null);
  const [artifactPath, setArtifactPath] = useState("");
  const [notes, setNotes] = useState("");
  const justFinished = run.model.status === "done";
  const approved = state.status === "approved";
  // A gated stage is awaiting review once its run finishes, or if it was left in
  // needs-review from a prior session. Without this, a gated stage with no
  // artifact (e.g. visual-verify) had no approve control at all and soft-locked.
  const showGate =
    def.gated && !approved && (justFinished || state.status === "needs-review");

  const prompt = useMemo(() => {
    const base = def.promptTemplate ?? "Run this step.";
    return state.decisionNotes
      ? `${base}\n\nRequested changes to address:\n${state.decisionNotes}`
      : base;
  }, [def.promptTemplate, state.decisionNotes]);

  async function start(): Promise<void> {
    setArtifact(null);
    await run.start({
      prompt,
      cwd: project.path,
      allowedTools: def.allowedTools,
      bypassPermissions: true,
    });
    if (def.gated) await onFlow(await api.setStageStatus(project.path, def.id, "running"));
  }

  // Mark the stage needs-review exactly once, when its run finishes.
  useEffect(() => {
    if (!justFinished || !def.gated) return;
    void api.setStageStatus(project.path, def.id, "needs-review").then(onFlow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justFinished]);

  // Resolve the artifact whenever the gate is showing — including reloads where
  // the stage is already needs-review with no fresh run in memory.
  useEffect(() => {
    if (!showGate) return;
    const resolve = def.artifactGlob
      ? api.findLatestArtifact(project.path, def.artifactGlob)
      : def.artifact
        ? api
            .readArtifact(project.path, def.artifact)
            .then((c) => (c === null ? null : { path: def.artifact!, content: c }))
        : Promise.resolve(null);
    void resolve.then((r) => {
      setArtifact(r?.content ?? null);
      setArtifactPath(r?.path ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGate, def.artifactGlob, def.artifact]);

  async function approve(): Promise<void> {
    onFlow(await api.approveStage(project.path, def.id));
  }
  async function requestChanges(): Promise<void> {
    onFlow(await api.requestChanges(project.path, def.id, notes));
    setNotes("");
  }
  async function completeImplement(): Promise<void> {
    onFlow(await api.approveStage(project.path, def.id));
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-vs-text-muted">
            {state.decisionNotes
              ? "Re-run addresses your requested changes."
              : "Runs autonomously — Figma MCP, file, and shell access are granted for this run."}
          </p>
          <div className="flex gap-2">
            {run.running ? (
              <Button onClick={() => void run.cancel()}>Cancel</Button>
            ) : (
              <Button variant="primary" onClick={() => void start()}>
                {state.status === "pending" ? (runLabel ?? "Run step") : "Run again"}
              </Button>
            )}
          </div>
        </div>
        <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
      </Card>

      {showGate && (
        <ArtifactGate
          path={artifactPath || undefined}
          content={artifact}
          notes={notes}
          onNotes={setNotes}
          onApprove={() => void approve()}
          onRequestChanges={() => void requestChanges()}
        />
      )}

      {!def.gated && justFinished && !approved && (
        <div className="flex items-center justify-between rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-3">
          <p className="text-sm text-vs-text-secondary">Implementation run complete.</p>
          <Button variant="primary" onClick={() => void completeImplement()}>
            Mark done & continue
          </Button>
        </div>
      )}

      {approved && (
        <div className="rounded-md border border-vs-success-border bg-vs-success-muted px-4 py-2 text-sm text-vs-success">
          Approved. {def.artifact ? `Artifact: ${def.artifact}` : ""}
        </div>
      )}
    </div>
  );
}

// ── Stage: components (build all at once, or one by one) ─────────────

function ComponentsStage({
  project,
  def,
  state,
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  onFlow: (f: Flow) => void;
}): React.JSX.Element {
  const run = useAgentRun();
  const [components, setComponents] = useState<DetectedComponent[] | null>(null);
  const [mode, setMode] = useState<"all" | "each">("all");
  const [built, setBuilt] = useState<Set<string>>(new Set());
  const [activeName, setActiveName] = useState<string | null>(null);

  useEffect(() => {
    void api
      .readArtifact(project.path, COMPONENTS_MANIFEST)
      .then((raw) => setComponents(parseComponents(raw)));
  }, [project.path]);

  useEffect(() => {
    if (run.model.status === "done" && activeName) {
      setBuilt((prev) => new Set(prev).add(activeName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  const total = components?.length ?? 0;
  const approved = state.status === "approved";
  const allBuilt = total > 0 && built.size >= total;
  const canApprove = mode === "all" ? run.model.status === "done" : allBuilt;

  async function buildAll(): Promise<void> {
    setActiveName(null);
    await run.start({
      prompt:
        "Read .sdd-de/components.json and .sdd-de/project.yaml. Implement EVERY detected component " +
        "into component_dir as components in the configured framework and language, using ONLY the " +
        "extracted design tokens. For each, run /generate-artifacts to produce its specs, then " +
        "implement it. Build in order: atoms → molecules → organisms.",
      cwd: project.path,
      allowedTools: def.allowedTools,
      bypassPermissions: true,
    });
  }

  async function buildOne(c: DetectedComponent): Promise<void> {
    setActiveName(c.name);
    await run.start({
      prompt:
        `Read .sdd-de/project.yaml. Implement the "${c.name}" component` +
        (c.level ? ` (${c.level})` : "") +
        " into component_dir in the configured framework and language, using ONLY the extracted " +
        "design tokens. Run /generate-artifacts for it to produce its specs, then implement it.",
      cwd: project.path,
      allowedTools: def.allowedTools,
      bypassPermissions: true,
    });
  }

  async function approve(): Promise<void> {
    onFlow(await api.approveStage(project.path, def.id));
  }

  if (approved) {
    return (
      <div className="rounded-md border border-vs-success-border bg-vs-success-muted px-4 py-2 text-sm text-vs-success">
        Components approved.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between p-3">
        <span className="text-xs text-vs-text-muted">
          {total > 0 ? `${total} components detected` : "No components detected yet"}
        </span>
        <div className="flex gap-0.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-0.5 text-xs">
          <Segmented active={mode === "all"} onClick={() => setMode("all")}>
            Build all at once
          </Segmented>
          <Segmented active={mode === "each"} onClick={() => setMode("each")}>
            One by one
          </Segmented>
        </div>
      </Card>

      {mode === "all" ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-vs-text-secondary">
              Generate all {total} components in one run.
            </p>
            {run.running ? (
              <Button onClick={() => void run.cancel()}>Cancel</Button>
            ) : (
              <Button variant="primary" disabled={total === 0} onClick={() => void buildAll()}>
                Build all {total || ""} components
              </Button>
            )}
          </div>
          <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col divide-y divide-vs-border-subtle p-0">
            {(components ?? []).map((c) => {
              const isBuilt = built.has(c.name);
              const isActive = activeName === c.name && run.running;
              return (
                <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-vs-text-primary">{c.name}</p>
                    {c.level && (
                      <p className="font-mono text-[10px] uppercase tracking-wide text-vs-text-muted">
                        {c.level}
                      </p>
                    )}
                  </div>
                  {isBuilt ? (
                    <span className="text-xs text-vs-success">Built ✓</span>
                  ) : isActive ? (
                    <Button onClick={() => void run.cancel()}>Cancel</Button>
                  ) : (
                    <Button
                      variant="default"
                      disabled={run.running}
                      onClick={() => void buildOne(c)}
                    >
                      Build
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
          <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
        </div>
      )}

      {canApprove && (
        <div className="flex items-center justify-between rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-3">
          <p className="text-sm text-vs-text-secondary">
            {mode === "all" ? "All components built." : `All ${total} components built.`}
          </p>
          <Button variant="primary" onClick={() => void approve()}>
            Approve &amp; continue
          </Button>
        </div>
      )}
    </div>
  );
}

function Segmented({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 transition-colors ${
        active ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function parseComponents(raw: string | null): DetectedComponent[] | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  try {
    const parsed = detectedComponentsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Flow completion + optional publish ───────────────────────────────

/** Shown once every required stage is approved: the project is done locally. */
function CompletionBanner({
  project,
  published,
  canPublish,
  onPublish,
  onOpenInspector,
  onBack,
}: {
  project: Project;
  published?: string;
  canPublish: boolean;
  onPublish: () => void;
  onOpenInspector: () => void;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 border-vs-success-border bg-vs-success-muted p-4">
      <div>
        <p className="text-sm font-semibold text-vs-success">Design system complete 🎉</p>
        <p className="mt-1 text-xs text-vs-text-secondary">
          Every required step is done — everything lives in your project folder. Publishing to
          GitHub is optional; you can keep working entirely locally.
        </p>
        {published && (
          <p className="mt-1 text-xs text-vs-text-muted">
            Publish target: <span className="font-mono">{published}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onOpenInspector}>
          Open Inspector
        </Button>
        {canPublish && (
          <Button variant="default" onClick={onPublish}>
            {published ? "Publish to GitHub" : "Connect GitHub & publish…"}
          </Button>
        )}
        <Button variant="default" onClick={() => void api.openFolder(project.path)}>
          Open project folder
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back to projects
        </Button>
      </div>
      <p className="text-[11px] text-vs-text-muted">
        Want true pixel &amp; axe QA? Run <span className="font-mono">/storybook</span> in the
        project to make the components browsable, then screenshot against the Figma frames.
      </p>
    </Card>
  );
}

/**
 * The optional commit/publish stage. Local-first: the work is already saved on
 * disk. Publishing is opt-in — the user pastes a GitHub repo URL (stored, not
 * credentials) and the push runs through their own git/gh via the /commit agent.
 */
function PublishStage({
  project,
  def,
  state,
  publishRepoUrl,
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  publishRepoUrl?: string;
  onFlow: (f: Flow) => void;
}): React.JSX.Element {
  const run = useAgentRun();
  const [url, setUrl] = useState(publishRepoUrl ?? "");
  const approved = state.status === "approved";
  const justFinished = run.model.status === "done";

  async function publish(): Promise<void> {
    const target = url.trim();
    if (!target) return;
    onFlow(await api.setPublishTarget(project.path, target));
    const prompt =
      (def.promptTemplate ?? "/commit") +
      `\n\nPublish target: ${target}\n` +
      "Ensure this project is a git repository (run `git init` if it is not yet). " +
      "If no `origin` remote exists, add the publish target as `origin` (never overwrite an " +
      "existing origin). Stage and commit all changes with a clear message, push the current " +
      "branch, and open a pull request whose description is the component spec. Use the user's " +
      "existing git and gh credentials — never ask for or store tokens. If git or gh is not " +
      "authenticated, stop and tell the user exactly what to run (e.g. `gh auth login`).";
    await run.start({
      prompt,
      cwd: project.path,
      allowedTools: def.allowedTools,
      bypassPermissions: true,
    });
  }

  async function markDone(): Promise<void> {
    onFlow(await api.approveStage(project.path, def.id));
  }

  if (approved) {
    return (
      <div className="rounded-md border border-vs-success-border bg-vs-success-muted px-4 py-2 text-sm text-vs-success">
        Commit &amp; publish resolved.{" "}
        {publishRepoUrl ? `Published to ${publishRepoUrl}.` : "Kept local — nothing pushed."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs text-vs-text-muted">
          Optional. Your work is already saved locally. To publish, connect a GitHub repo — VortSpec
          uses your own <span className="font-mono">git</span>/<span className="font-mono">gh</span>{" "}
          and stores only the URL, never credentials.
        </p>
        <label className="flex flex-col gap-1 text-xs text-vs-text-secondary">
          GitHub repository URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/you/your-repo"
            className="rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
          />
        </label>
        <div className="flex gap-2">
          {run.running ? (
            <Button onClick={() => void run.cancel()}>Cancel</Button>
          ) : (
            <Button
              variant="primary"
              disabled={url.trim().length === 0}
              onClick={() => void publish()}
            >
              Publish to GitHub
            </Button>
          )}
          <Button variant="ghost" onClick={() => void markDone()}>
            Skip — keep it local
          </Button>
        </div>
        <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
      </Card>

      {justFinished && (
        <div className="flex items-center justify-between rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-3">
          <p className="text-sm text-vs-text-secondary">Publish run complete.</p>
          <Button variant="primary" onClick={() => void markDone()}>
            Mark done
          </Button>
        </div>
      )}
    </div>
  );
}

function ArtifactGate({
  path,
  content,
  notes,
  onNotes,
  onApprove,
  onRequestChanges,
}: {
  path?: string;
  content: string | null;
  notes: string;
  onNotes: (v: string) => void;
  onApprove: () => void;
  onRequestChanges: () => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<"view" | "changes">("view");
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-vs-text-secondary">
          {path ? (
            <>
              Review artifact · <span className="font-mono">{path}</span>
            </>
          ) : (
            "Review this step, then approve to continue"
          )}
        </p>
        <span className="rounded-full border border-vs-warning-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-vs-warning">
          needs review
        </span>
      </div>
      {content !== null && (
        <div className="max-h-80 overflow-auto rounded-md border border-vs-border-default bg-vs-bg-primary p-3">
          <pre className="whitespace-pre-wrap font-mono text-xs text-vs-text-primary">
            {content}
          </pre>
        </div>
      )}
      {mode === "changes" ? (
        <div className="flex flex-col gap-2">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Describe the changes you want the agent to make…"
            className="resize-y rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={notes.trim().length === 0}
              onClick={onRequestChanges}
            >
              Send back for changes
            </Button>
            <Button variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onApprove}>
            Approve
          </Button>
          <Button variant="default" onClick={() => setMode("changes")}>
            Request changes
          </Button>
        </div>
      )}
    </Card>
  );
}
