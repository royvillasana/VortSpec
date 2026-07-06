import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorComponent, Project, ProjectConfig } from "../../../shared/ipc";
import { DEFAULT_FLOW } from "../../../shared/flow";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Button, Card, Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";
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
const COMMIT_DEF = DEFAULT_FLOW.find((d) => d.id === "commit");
const COMMIT_PROMPT =
  COMMIT_DEF?.promptTemplate ??
  "/commit\n\nRun the commit skill: commit the changes and open a PR. No direct pushes to main.";

function buildOnePrompt(name: string, level?: string): string {
  return (
    `Read .sdd-de/project.yaml. Implement the "${name}" component` +
    (level ? ` (${level})` : "") +
    " into component_dir in the configured framework and language, using ONLY the extracted " +
    "design tokens. Run /generate-artifacts for it to produce its specs, then implement it."
  );
}

const BUILD_REMAINING_PROMPT =
  "Read .sdd-de/components.json and .sdd-de/project.yaml. Implement EVERY component listed in " +
  "components.json that is NOT yet implemented in component_dir, in the configured framework and " +
  "language, using ONLY the extracted design tokens. For each, run /generate-artifacts to produce " +
  "its specs, then implement it. Build in order: atoms → molecules → organisms. Skip components that " +
  "already have a source file.";

/**
 * Re-scan the design source and RECONCILE — additive, never destructive. Refresh
 * tokens and merge newly-detected components into the inventory so the roster
 * shows what's on the source vs. what's already built, without touching built
 * code or dropping hand-added components.
 */
const RESCAN_PROMPT = [
  "Re-scan this project's design source and reconcile the design system. Do NOT implement or",
  "modify any component code — this only refreshes tokens and the component inventory.",
  "",
  "1. Read `.sdd-de/project.yaml` for `design_source` and the config. Connect to the configured",
  "   source. For `design_source: figma`, use the Figma MCP to read `figma_file_url` and the",
  "   variable collection `figma_token_collection`.",
  "2. Re-extract design tokens into the configured `token_file`: add newly-found tokens and update",
  "   values that changed. Do NOT remove tokens that existing components still reference.",
  "3. Detect EVERY component in the source and MERGE into `.sdd-de/components.json`:",
  "   - keep every existing entry (including components added by hand),",
  "   - add any component found in the source that isn't already listed ({ name, level, description }),",
  "   - do NOT delete entries and do NOT touch component source files.",
  "4. End with a one-line summary: how many components are in the source, how many are already",
  "   implemented (have a source file under the component dir), and how many are new since last scan.",
].join("\n");

function newComponentPrompt(name: string, intent: string): string {
  return [
    `Add a brand-new component "${name}" to this design system.`,
    "1. Append an entry to .sdd-de/components.json: { \"name\": \"" +
      name +
      "\", \"level\": <atom|molecule|organism>, \"description\": <one line from the intent below> }.",
    "2. Run /generate-artifacts for it to produce its specs.",
    "3. Implement it into component_dir in the configured framework and language, using ONLY the",
    "   extracted design tokens and matching the existing components' conventions.",
    "",
    "Intent:",
    intent,
  ].join("\n");
}

function verifyOnePrompt(name: string): string {
  return (
    `/visual-verify\n\nRun the visual-verify skill focused on the "${name}" component: compare its ` +
    "implementation to its spec across 375/768/1440px, check every token/variant/state, run the " +
    "accessibility audit, and write specs/<component>/visual-verify-report.md with the findings."
  );
}

const VERIFY_ALL_PROMPT =
  "/visual-verify\n\nRun the visual-verify skill across every built component: compare each to its " +
  "spec across viewports, check tokens/variants/states, run the a11y audit, and write each " +
  "specs/<component>/visual-verify-report.md.";

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

export function GuidedFlow({
  project,
  onBack,
  onOpenInspector,
  onOpenPreview,
  onOpenRun,
  onOpenVerify,
  onOpenHistory,
  onOpenManifest,
}: {
  project: Project;
  onBack: () => void;
  onOpenInspector: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
  onOpenVerify: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
}): React.JSX.Element {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [components, setComponents] = useState<InspectorComponent[] | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [manifestExists, setManifestExists] = useState(false);
  const [foundationOpen, setFoundationOpen] = useState(false);
  const [addNew, setAddNew] = useState(false);

  const run = useAgentRun();
  const [runLabel, setRunLabel] = useState("");
  const runDismissRef = useRef(false);

  async function reload(): Promise<void> {
    const [cfg, comps, toks, man] = await Promise.all([
      api.projectConfig(project.path),
      api.inspectorComponents(project.path),
      api.inspectorTokens(project.path),
      api.getManifest(project.path),
    ]);
    setConfig(cfg);
    setComponents(comps.components);
    setTokenCount(toks.tokens.length);
    setManifestExists(man.exists);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // When any run finishes, re-read the roster from files (status is file-derived).
  useEffect(() => {
    if (run.model.status === "done") void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  async function op(label: string, prompt: string, tools?: string[]): Promise<void> {
    setRunLabel(label);
    runDismissRef.current = false;
    await run.start({
      prompt,
      cwd: project.path,
      allowedTools: tools ?? ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
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
  const showRunCard = running || (run.model.status === "done" && !runDismissRef.current);

  const status = !foundationReady
    ? "Set up the foundation to begin"
    : `Foundation ready · ${builtCount}/${total} built · ${verifiedCount} verified`;

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("flow", {
          onFlow: () => undefined,
          onRun: onOpenRun,
          onPlayground: onOpenPreview,
          onTokens: onOpenInspector,
          onManifest: onOpenManifest,
          onHistory: onOpenHistory,
        })}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3.5 border-b border-vs-border-default px-8 pb-4 pt-5">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Design system</h1>
            <span className="text-xs text-vs-text-secondary">{status}</span>
          </div>
          <div className="flex-1" />
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
                disabled={running}
                onClick={() => void op("Verify all built components", VERIFY_ALL_PROMPT, ["Read", "Bash"])}
              >
                Verify all
              </Button>
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-16 pt-6">
          <div className="mx-auto flex max-w-[720px] flex-col gap-5">
            {/* Active run */}
            {showRunCard && (
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2 text-sm text-vs-text-primary">
                  {running ? <Spinner /> : <span className="text-vs-success">✓</span>}
                  <span className="flex-1">{runLabel || "Working…"}</span>
                  {!running && (
                    <button
                      onClick={() => {
                        runDismissRef.current = true;
                        run.reset();
                      }}
                      className="rounded-md border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
                <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
              </Card>
            )}

            {!foundationReady ? (
              <FoundationSetup
                config={config}
                running={running}
                onRun={() =>
                  void op(
                    "Connecting the design source — extracting tokens + detecting components",
                    FOUNDATION_DEF.promptTemplate ?? "Extract tokens and detect components.",
                    FOUNDATION_DEF.allowedTools,
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
                  running={running}
                  onReExtract={() =>
                    void op(
                      "Re-extracting tokens + re-detecting components",
                      FOUNDATION_DEF.promptTemplate ?? "Re-extract tokens and detect components.",
                      FOUNDATION_DEF.allowedTools,
                    )
                  }
                  onOpenTokens={onOpenInspector}
                />

                {/* Components */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">
                      Components <span className="text-vs-border-strong">· {total}</span>
                    </h2>
                    <div className="flex-1" />
                    <Button
                      variant="default"
                      disabled={running}
                      title="Re-read the design source and reconcile: refresh tokens and add any newly-detected components. Never touches built code."
                      onClick={() =>
                        void op(
                          `Re-scanning ${config?.designSource === "figma" ? "Figma" : "the design source"} — reconciling tokens + components`,
                          RESCAN_PROMPT,
                          FOUNDATION_DEF.allowedTools,
                        )
                      }
                    >
                      ↻ Re-scan {config?.designSource === "figma" ? "Figma" : "source"}
                    </Button>
                    {remaining.length > 0 && (
                      <Button
                        variant="default"
                        disabled={running}
                        onClick={() =>
                          void op(
                            `Building ${remaining.length} remaining component${remaining.length === 1 ? "" : "s"}`,
                            BUILD_REMAINING_PROMPT,
                          )
                        }
                      >
                        Build all detected ({remaining.length})
                      </Button>
                    )}
                    <Button variant="primary" disabled={running} onClick={() => setAddNew(true)}>
                      + New component
                    </Button>
                  </div>

                  {addNew && (
                    <NewComponentForm
                      disabled={running}
                      onCancel={() => setAddNew(false)}
                      onCreate={(name, intent) => {
                        setAddNew(false);
                        void op(`Creating the "${name}" component`, newComponentPrompt(name, intent));
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
                    <Card className="flex flex-col p-0">
                      {groups.map((g, gi) => (
                        <div key={g.level}>
                          <div
                            className={`bg-vs-bg-primary px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted ${
                              gi > 0 ? "border-t border-vs-border-default" : ""
                            }`}
                          >
                            {LEVEL_LABEL[g.level]} <span className="text-vs-border-strong">{g.items.length}</span>
                          </div>
                          {g.items.map((c) => (
                            <ComponentRow
                              key={c.name}
                              component={c}
                              disabled={running}
                              onBuild={() => void op(`Building "${c.name}"`, buildOnePrompt(c.name, c.level))}
                              onVerify={() =>
                                void op(`Verifying "${c.name}"`, verifyOnePrompt(c.name), ["Read", "Bash"])
                              }
                              onOpen={onOpenPreview}
                            />
                          ))}
                        </div>
                      ))}
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
                    title="Publish to GitHub"
                    optional
                    desc="Optional. Publish these components, tokens, and DESIGN.md with your own git/gh when you're ready to build screens for your site."
                    cta="Commit & publish"
                    onClick={() =>
                      void op("Committing & publishing with your git/gh", COMMIT_PROMPT, ["Read", "Bash"])
                    }
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
  onReExtract,
  onOpenTokens,
}: {
  config: ProjectConfig | null;
  tokenCount: number;
  componentCount: number;
  open: boolean;
  onToggle: () => void;
  running: boolean;
  onReExtract: () => void;
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
          <div className="flex gap-2">
            <Button variant="default" onClick={onOpenTokens}>
              View tokens
            </Button>
            <Button variant="default" disabled={running} onClick={onReExtract}>
              Re-extract
            </Button>
          </div>
        </div>
      )}
    </Card>
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
    <div className="flex items-center gap-3 border-t border-vs-border-subtle px-4 py-2.5 first:border-t-0">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-vs-text-primary">{component.name}</p>
        {component.description && (
          <p className="truncate text-[11px] text-vs-text-muted">{component.description}</p>
        )}
      </div>
      <span className={`font-mono text-[10px] ${meta.text}`}>{meta.label}</span>
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
}: {
  title: string;
  mono?: string;
  desc: string;
  cta: string;
  optional?: boolean;
  onClick: () => void;
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
      <Button variant={optional ? "default" : "primary"} onClick={onClick}>
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
