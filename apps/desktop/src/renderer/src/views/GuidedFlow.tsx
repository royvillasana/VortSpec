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

function StageDot({
  status,
  locked,
}: {
  status: StageStatus;
  locked: boolean;
}): React.JSX.Element {
  if (locked) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-vs-border-strong" />;
  }
  if (status === "running") return <Spinner />;
  const color: Record<Exclude<StageStatus, "running">, string> = {
    pending: "bg-vs-text-muted",
    "needs-review": "bg-vs-warning",
    approved: "bg-vs-success",
    failed: "bg-vs-error",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color[status]}`} />;
}

/**
 * The guided SDD-DE flow (US-05..US-09): the CLI's steps rendered as a stepper
 * with intake forms, agent runs, and artifact approval gates. Only the current
 * stage is actionable; nothing advances without an explicit approval.
 */
export function GuidedFlow({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
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

  if (!flow || !selectedId) {
    return <div className="px-6 py-10 text-sm text-vs-text-secondary">Loading flow…</div>;
  }

  const def = flow.definitions.find((d) => d.id === selectedId)!;
  const state = flow.state.stages.find((s) => s.id === selectedId)!;
  const currentIndex = flow.definitions.findIndex((d) => d.id === flow.state.currentStageId);
  const selectedIndex = flow.definitions.findIndex((d) => d.id === selectedId);
  const locked = selectedIndex > currentIndex;

  // The flow is "done" once every REQUIRED (non-optional) stage is approved —
  // so a project can be finished entirely locally, with commit/publish optional.
  const flowComplete = flow.definitions
    .filter((d) => !d.optional)
    .every((d) => flow.state.stages.find((s) => s.id === d.id)?.status === "approved");
  const commitStage = flow.definitions.find((d) => d.optional);

  return (
    <div className="mx-auto flex w-full max-w-4xl gap-6 px-6 py-8">
      <aside className="w-56 shrink-0">
        <button
          onClick={onBack}
          className="mb-3 text-xs text-vs-text-secondary hover:text-vs-text-primary"
        >
          ← Projects
        </button>
        <h2 className="mb-1 truncate text-sm font-semibold text-vs-text-primary">
          {project.name}
        </h2>
        <p className="mb-4 text-xs text-vs-text-muted">Guided SDD flow</p>
        <Stepper
          flow={flow}
          selectedId={selectedId}
          currentIndex={currentIndex}
          onSelect={setSelectedId}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        {flowComplete && (
          <CompletionBanner
            project={project}
            published={flow.state.publishRepoUrl}
            canPublish={Boolean(commitStage)}
            onPublish={() => commitStage && setSelectedId(commitStage.id)}
            onBack={onBack}
          />
        )}
        <StageDetail
          key={def.id}
          project={project}
          def={def}
          state={state}
          locked={locked}
          config={config}
          publishRepoUrl={flow.state.publishRepoUrl}
          onFlow={setFlow}
        />
      </section>
    </div>
  );
}

function Stepper({
  flow,
  selectedId,
  currentIndex,
  onSelect,
}: {
  flow: Flow;
  selectedId: string;
  currentIndex: number;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const total = flow.definitions.length;
  // Progress is measured over required stages, so it reaches 100% when the
  // project is done locally — optional stages (commit/publish) don't hold it back.
  const requiredDefs = flow.definitions.filter((d) => !d.optional);
  const requiredDone = requiredDefs.filter(
    (d) => flow.state.stages.find((s) => s.id === d.id)?.status === "approved",
  ).length;
  const pct = requiredDefs.length ? Math.round((requiredDone / requiredDefs.length) * 100) : 0;
  const complete = pct === 100;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5">
        {flow.definitions.map((def, i) => {
          const state = flow.state.stages.find((s) => s.id === def.id)!;
          const locked = i > currentIndex;
          const selected = def.id === selectedId;
          const running = state.status === "running";
          return (
            <li key={def.id}>
              <button
                disabled={locked}
                onClick={() => onSelect(def.id)}
                style={running ? { boxShadow: "inset 2px 0 0 #7C6FF0" } : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[13px] transition-colors ${
                  selected
                    ? "border-vs-border-strong bg-vs-bg-elevated text-vs-text-primary"
                    : "border-transparent text-vs-text-secondary hover:bg-vs-bg-hover"
                } ${locked ? "opacity-40" : ""}`}
              >
                <span className="w-4 shrink-0 font-mono text-[11px] text-vs-text-muted">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">{def.title}</span>
                {def.optional && (
                  <span className="shrink-0 rounded-full border border-vs-border-default px-1.5 text-[9px] uppercase tracking-wide text-vs-text-muted">
                    opt
                  </span>
                )}
                <StageDot status={state.status} locked={locked} />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1.5 px-1">
        <div className="h-1 overflow-hidden rounded-full bg-vs-border-default">
          <div
            className={`h-full rounded-full transition-all ${complete ? "bg-vs-success" : "bg-vs-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-vs-text-muted">
          {complete ? "Complete · commit optional" : `Stage ${Math.min(currentIndex + 1, total)} of ${total}`}
        </span>
      </div>
    </div>
  );
}

function StageDetail({
  project,
  def,
  state,
  locked,
  config,
  publishRepoUrl,
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  locked: boolean;
  config: ProjectConfig | null;
  publishRepoUrl?: string;
  onFlow: (f: Flow) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="flex items-center gap-2">
          <StageDot status={state.status} locked={locked} />
          <h3 className="text-base font-semibold text-vs-text-primary">{def.title}</h3>
          <StatusBadge status={state.status} locked={locked} />
        </div>
        <p className="mt-1 text-sm text-vs-text-secondary">{def.summary}</p>
      </header>

      {locked ? (
        <Card className="px-4 py-6 text-center text-sm text-vs-text-muted">
          Complete the previous stages first.
        </Card>
      ) : def.kind === "source" ? (
        <AgentStage
          project={project}
          def={def}
          state={state}
          onFlow={onFlow}
          header={<SourceInfo config={config} />}
          runLabel="Connect & extract tokens + detect components"
        />
      ) : def.kind === "components" ? (
        <ComponentsStage project={project} def={def} state={state} onFlow={onFlow} />
      ) : def.optional ? (
        <PublishStage
          project={project}
          def={def}
          state={state}
          publishRepoUrl={publishRepoUrl}
          onFlow={onFlow}
        />
      ) : (
        <AgentStage project={project} def={def} state={state} onFlow={onFlow} />
      )}
    </div>
  );
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
  const label = locked ? "locked" : status;
  return (
    <span className="rounded-full border border-vs-border-default px-2 py-0.5 text-[10px] uppercase tracking-wide text-vs-text-muted">
      {label}
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
  onBack,
}: {
  project: Project;
  published?: string;
  canPublish: boolean;
  onPublish: () => void;
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
        {canPublish && (
          <Button variant="primary" onClick={onPublish}>
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
