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

      <section className="min-w-0 flex-1">
        <StageDetail
          key={def.id}
          project={project}
          def={def}
          state={state}
          locked={locked}
          config={config}
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
  const done = flow.state.stages.filter((s) => s.status === "approved").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

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
                <StageDot status={state.status} locked={locked} />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1.5 px-1">
        <div className="h-1 overflow-hidden rounded-full bg-vs-border-default">
          <div
            className="h-full rounded-full bg-vs-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-vs-text-muted">
          Stage {Math.min(currentIndex + 1, total)} of {total}
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
  onFlow,
}: {
  project: Project;
  def: StageDef;
  state: StageState;
  locked: boolean;
  config: ProjectConfig | null;
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

  const prompt = useMemo(() => {
    const base = def.promptTemplate ?? "Run this step.";
    return state.decisionNotes
      ? `${base}\n\nRequested changes to address:\n${state.decisionNotes}`
      : base;
  }, [def.promptTemplate, state.decisionNotes]);

  async function start(): Promise<void> {
    setArtifact(null);
    await run.start({ prompt, cwd: project.path, allowedTools: def.allowedTools });
    if (def.gated) await onFlow(await api.setStageStatus(project.path, def.id, "running"));
  }

  useEffect(() => {
    if (!justFinished || !def.gated) return;
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
    void api.setStageStatus(project.path, def.id, "needs-review").then(onFlow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justFinished]);

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

  const approved = state.status === "approved";

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-vs-text-muted">
            {state.decisionNotes ? "Re-run addresses your requested changes." : "Runs your own Claude Code."}
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
        <RunPanel model={run.model} />
      </Card>

      {def.gated && artifact !== null && !approved && (
        <ArtifactGate
          path={artifactPath}
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
          <RunPanel model={run.model} />
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
          <RunPanel model={run.model} />
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

function ArtifactGate({
  path,
  content,
  notes,
  onNotes,
  onApprove,
  onRequestChanges,
}: {
  path: string;
  content: string;
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
          Review artifact · <span className="font-mono">{path}</span>
        </p>
        <span className="rounded-full border border-vs-warning-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-vs-warning">
          needs review
        </span>
      </div>
      <div className="max-h-80 overflow-auto rounded-md border border-vs-border-default bg-vs-bg-primary p-3">
        <pre className="whitespace-pre-wrap font-mono text-xs text-vs-text-primary">{content}</pre>
      </div>
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
