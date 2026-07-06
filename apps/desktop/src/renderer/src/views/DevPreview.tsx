import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DevServerStatus,
  FileSnapshot,
  InspectorComponent,
  Project,
  StorybookEntry,
} from "../../../shared/ipc";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Button, Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";
import { ProjectRail } from "../components/ProjectRail";

const STORYBOOK_PROMPT = [
  "Set up Storybook for this project so VortSpec can embed real component docs, controls, and variants.",
  "",
  "1. Read `.sdd-de/project.yaml` (framework, language, styling, component_dir) and",
  "   `.sdd-de/components.json` (the component inventory).",
  "2. Install and initialize Storybook for this framework with the project's package manager",
  "   (for React + Vite + TypeScript, use `@storybook/react-vite` with the essentials addon).",
  "   Add `.storybook/main.ts` (a stories glob covering the component dir, the framework, and",
  "   `docs: { autodocs: true }`) and `.storybook/preview.ts` that imports the project's global",
  "   styles / design-token CSS so components render themed, with `parameters.layout = 'centered'`.",
  "3. For EVERY component in components.json, write a `<Component>.stories.tsx` beside it under the",
  "   component dir with:",
  "   - `title: '<ComponentName>'` (exactly the component name, no folder prefix), `tags: ['autodocs']`,",
  "     and `component: <Component>`.",
  "   - `argTypes` for the component's real props/variants (variant enum → select control, boolean →",
  "     boolean control) with short descriptions.",
  "   - A `Default` story with representative args PLUS a named story for each meaningful variant/state",
  "     (every `variant`, every `size`, disabled, etc.) so the autodocs page shows the full matrix.",
  "4. Add scripts to package.json: `\"storybook\": \"storybook dev -p 6006 --no-open\"` and",
  "   `\"build-storybook\": \"storybook build\"`. Install any missing deps.",
  "5. Do NOT modify the components themselves. Leave everything else untouched.",
  "",
  "When done, `storybook dev` should serve at http://localhost:6006 with an autodocs page per component.",
].join("\n");

function modifyPrompt(name: string, file: string | null, request: string): string {
  return [
    `Modify the "${name}" component${file ? ` (source: ${file}, and its .variants.ts sibling if present)` : ""} per this request.`,
    "Edit ONLY that component's source under the component directory — do not touch other components or the token file.",
    "Keep every value token-referenced (no hardcoded hex or px). Match the surrounding code style.",
    "",
    "Request:",
    request,
  ].join("\n");
}

const LEVEL_ORDER = ["atom", "molecule", "organism", "other"] as const;
const LEVEL_LABEL: Record<string, string> = {
  atom: "Atoms",
  molecule: "Molecules",
  organism: "Organisms",
  other: "Components",
};

/** Match a component name to its Storybook autodocs entry (title first, then import path). */
function docsIdFor(entries: StorybookEntry[], name: string): string | null {
  const lower = name.toLowerCase();
  const docs = entries.filter((e) => e.type === "docs");
  const hit =
    docs.find((e) => e.title.toLowerCase() === lower) ??
    docs.find((e) => e.title.toLowerCase().endsWith(`/${lower}`)) ??
    docs.find((e) => (e.importPath ?? "").toLowerCase().includes(`/${lower}.`));
  return hit?.id ?? null;
}

/**
 * Component Playground — generates and embeds a real Storybook for the project.
 * VortSpec's sidebar drives which component you see; the canvas is genuine
 * Storybook autodocs (description, Primary, interactive Controls, every variant
 * story) for that component. The cockpit panel adds tokens, verify findings,
 * source links, and gated Modify-with-Claude. Claude Code is the engine — VortSpec
 * doesn't re-implement Storybook, it stands one up and embeds it.
 */
export function DevPreview({
  project,
  onBack,
  onOpenRun,
  onOpenInspector,
  onOpenHistory,
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenInspector: () => void;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const [components, setComponents] = useState<InspectorComponent[] | null>(null);
  const [selName, setSelName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [dev, setDev] = useState<DevServerStatus>({
    state: "stopped",
    url: null,
    script: null,
    message: null,
  });
  const [sbEntries, setSbEntries] = useState<StorybookEntry[]>([]);
  const [frameLoading, setFrameLoading] = useState(true);

  useEffect(() => {
    void api.inspectorComponents(project.path).then((r) => {
      setComponents(r.components);
      setSelName((cur) => cur ?? r.components[0]?.name ?? null);
    });
  }, [project.path]);

  // Follow the managed dev server for this project.
  useEffect(() => {
    void api.devServerStatus(project.path).then(setDev);
    return api.onDevServerUpdate(({ projectPath, status }) => {
      if (projectPath === project.path) setDev(status);
    });
  }, [project.path]);

  const storybook = useAgentRun();
  const modify = useAgentRun();
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const [modifyReview, setModifyReview] = useState(false);
  const autoRef = useRef(false);

  const selected = components?.find((c) => c.name === selName) ?? null;
  const base = (devUrl.trim() || dev.url || "").replace(/\/+$/, "");
  const docsId = selName ? docsIdFor(sbEntries, selName) : null;
  // Embed Storybook's autodocs canvas directly (no manager chrome): description,
  // Primary, interactive Controls, and every variant story for this component.
  const embedUrl = base
    ? docsId
      ? `${base}/iframe.html?viewMode=docs&id=${docsId}`
      : base
    : "";

  async function requestModify(request: string): Promise<void> {
    if (!selName) return;
    const file = components?.find((c) => c.name === selName)?.file ?? null;
    setModifyReview(false);
    if (file) setSnapshot(await api.snapshotComponent(project.path, file));
    await modify.start({
      prompt: modifyPrompt(selName, file, request),
      cwd: project.path,
      allowedTools: ["Read", "Edit", "Write"],
      bypassPermissions: true,
    });
  }

  // When the modify run finishes, re-read the components and enter review.
  useEffect(() => {
    if (modify.model.status !== "done") return;
    void api.inspectorComponents(project.path).then((r) => setComponents(r.components));
    setModifyReview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modify.model.status]);

  async function revertModify(): Promise<void> {
    if (snapshot) await api.restoreFiles(project.path, snapshot);
    await api.inspectorComponents(project.path).then((r) => setComponents(r.components));
    setSnapshot(null);
    setModifyReview(false);
    modify.reset();
  }
  function keepModify(): void {
    setSnapshot(null);
    setModifyReview(false);
    modify.reset();
  }

  async function startPreview(): Promise<void> {
    setDev(await api.startDevServer(project.path));
  }
  function stopPreview(): void {
    void api.stopDevServer(project.path);
  }
  async function generateStorybook(): Promise<void> {
    await storybook.start({
      prompt: STORYBOOK_PROMPT,
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }

  // Once Storybook is written, launch it automatically.
  useEffect(() => {
    if (storybook.model.status === "done") void startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storybook.model.status]);

  // Auto bring-up: on entering, embed a running Storybook instantly; if Storybook
  // is set up, launch it; otherwise generate it (then it launches) — no clicks.
  async function autoPreview(): Promise<void> {
    const status = await api.devServerStatus(project.path);
    if (status.url) {
      setDev(status);
      return;
    }
    const info = await api.previewInfo(project.path);
    if (info.hasStorybook) {
      await startPreview();
      return;
    }
    if (!storybook.running) void generateStorybook();
  }

  useEffect(() => {
    if (components === null || autoRef.current) return;
    autoRef.current = true;
    void autoPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components]);

  // Once Storybook is serving, pull its story index (it builds a moment after the
  // URL appears, so poll until entries land) to deep-link the right autodocs page.
  useEffect(() => {
    if (!dev.url) {
      setSbEntries([]);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const poll = async (): Promise<void> => {
      const entries = await api.storybookIndex(dev.url!).catch(() => [] as StorybookEntry[]);
      if (cancelled) return;
      if (entries.length) setSbEntries(entries);
      else timer = window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dev.url]);

  // Reset the loading veil whenever the embedded story changes.
  useEffect(() => setFrameLoading(true), [embedUrl]);

  const groups = useMemo(() => {
    if (!components) return [];
    const q = query.trim().toLowerCase();
    const filtered = components.filter((c) => q === "" || c.name.toLowerCase().includes(q));
    return LEVEL_ORDER.map((level) => ({
      level,
      items: filtered.filter((c) => (c.level ?? "other") === level),
    })).filter((g) => g.items.length > 0);
  }, [components, query]);

  const building = storybook.running || (storybook.model.status === "done" && !dev.url);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={[
          { label: "Flow", onClick: onBack },
          { label: "Run", onClick: onOpenRun },
          { label: "Playground", active: true },
          { label: "Tokens", onClick: onOpenInspector },
          { label: "History", onClick: onOpenHistory },
        ]}
      />

      {/* Stories sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface">
        <div className="border-b border-vs-border-default p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Components {components && <span className="text-vs-text-muted">· {components.length}</span>}
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-[30px] w-full rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {components === null ? (
            <div className="flex items-center gap-2 p-3 text-xs text-vs-text-secondary">
              <Spinner /> Reading…
            </div>
          ) : groups.length === 0 ? (
            <p className="p-3 text-xs text-vs-text-muted">No components detected.</p>
          ) : (
            groups.map((g) => (
              <div key={g.level} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted">
                  {LEVEL_LABEL[g.level]} <span className="text-vs-border-strong">{g.items.length}</span>
                </p>
                {g.items.map((c) => {
                  const active = c.name === selName;
                  return (
                    <button
                      key={c.name}
                      onClick={() => setSelName(c.name)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                        active ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-elevated"
                      }`}
                    >
                      <span
                        className={`h-3 w-3 shrink-0 rounded-sm border ${
                          active ? "border-vs-accent" : "border-vs-text-muted"
                        }`}
                      />
                      <span
                        className={`flex-1 truncate text-[13px] ${
                          active ? "font-medium text-vs-text-primary" : "text-vs-text-secondary"
                        }`}
                      >
                        {c.name}
                      </span>
                      <StatusDot status={c.status} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Canvas */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-5 py-3">
          <span className="text-[15px] font-semibold">{selected?.name ?? "—"}</span>
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            Storybook
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            disabled={storybook.running}
            onClick={() => void generateStorybook()}
            title="Have Claude Code (re)generate Storybook stories for this project"
          >
            {storybook.running ? "Setting up…" : "Regenerate Storybook"}
          </Button>
          <DevServerControl
            status={dev}
            onStart={() => void startPreview()}
            onStop={stopPreview}
            onOpen={(u) => void api.openInstall(u)}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-vs-bg-primary">
          {modify.running ? (
            <RunOverlay title="Applying your change with Claude Code…" run={modify} />
          ) : building ? (
            <RunOverlay
              title={
                storybook.running
                  ? "Setting up Storybook — installing + writing stories (first time only)…"
                  : "Storybook ready — starting it up…"
              }
              run={storybook}
              done={!storybook.running}
            />
          ) : embedUrl ? (
            <div className="relative h-full min-h-[340px]">
              <iframe
                key={embedUrl}
                title="storybook"
                src={embedUrl}
                onLoad={() => setFrameLoading(false)}
                className="h-full min-h-[340px] w-full border-0 bg-white"
              />
              {frameLoading && <LoadingVeil label="Loading Storybook…" />}
              {modifyReview && (
                <KeepRevertBar onKeep={keepModify} onRevert={() => void revertModify()} />
              )}
            </div>
          ) : dev.state === "error" ? (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-vs-border-default bg-vs-bg-surface p-6 text-center">
                <p className="text-sm font-semibold text-vs-error">Storybook failed to start</p>
                <p className="text-xs text-vs-text-muted">{dev.message}</p>
                <div className="flex gap-2">
                  <Button variant="default" onClick={() => void startPreview()}>
                    Try again
                  </Button>
                  <Button variant="primary" onClick={() => void generateStorybook()}>
                    Regenerate Storybook
                  </Button>
                </div>
                <UrlOverride value={devUrl} onChange={setDevUrl} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-vs-border-default bg-vs-bg-surface p-6 text-center">
                <Spinner />
                <p className="text-sm font-medium text-vs-text-secondary">
                  {dev.state === "starting"
                    ? "Starting Storybook — the first boot can take a moment…"
                    : "Preparing the Storybook playground…"}
                </p>
                <p className="text-xs text-vs-text-muted">
                  VortSpec is standing up Storybook for you — no setup needed.
                </p>
                <UrlOverride value={devUrl} onChange={setDevUrl} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Cockpit panel */}
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-vs-border-default bg-vs-bg-surface">
        <div className="flex flex-none items-center gap-2 border-b border-vs-border-default px-4 py-3">
          <span className="text-sm font-semibold">Component</span>
        </div>
        {selected ? (
          <CockpitPanel
            key={selected.name}
            component={selected}
            projectPath={project.path}
            onModify={(req) => void requestModify(req)}
            modifyBusy={modify.running}
          />
        ) : (
          <p className="p-4 text-xs text-vs-text-muted">Select a component.</p>
        )}
      </aside>
    </div>
  );
}

/** A translucent veil over the Storybook iframe while it loads. */
function LoadingVeil({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
        <Spinner /> {label}
      </div>
    </div>
  );
}

function RunOverlay({
  title,
  run,
  done,
}: {
  title: string;
  run: ReturnType<typeof useAgentRun>;
  done?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[340px] items-start justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-vs-border-default bg-vs-bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-vs-text-primary">
          {done ? <span className="text-vs-success">✓</span> : <Spinner />} {title}
        </div>
        <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
      </div>
    </div>
  );
}

function KeepRevertBar({
  onKeep,
  onRevert,
  inline,
}: {
  onKeep: () => void;
  onRevert: () => void;
  inline?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={
        inline
          ? "flex items-center gap-2"
          : "absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-vs-border-default bg-vs-bg-surface px-4 py-2.5"
      }
    >
      <span className="flex-1 text-xs text-vs-text-secondary">
        Change applied to the component source — keep it, or revert to the previous version.
      </span>
      <Button variant="ghost" onClick={onRevert}>
        Revert
      </Button>
      <Button variant="primary" onClick={onKeep}>
        Keep
      </Button>
    </div>
  );
}

function DevServerControl({
  status,
  onStart,
  onStop,
  onOpen,
}: {
  status: DevServerStatus;
  onStart: () => void;
  onStop: () => void;
  onOpen: (url: string) => void;
}): React.JSX.Element {
  if (status.state === "running" && status.url) {
    const port = status.url.match(/:(\d+)/)?.[1] ?? "";
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpen(status.url!)}
          title={status.url}
          className="flex items-center gap-1.5 rounded-lg border border-vs-border-default px-2.5 py-1.5 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-vs-success" />
          <span className="font-mono">:{port}</span>
          <span className="text-vs-text-muted">↗</span>
        </button>
        <button
          onClick={onStop}
          className="rounded-lg border border-vs-border-strong px-2.5 py-1.5 text-[11px] text-vs-text-secondary hover:border-vs-error hover:text-vs-error"
        >
          Stop
        </button>
      </div>
    );
  }
  if (status.state === "starting") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
        <Spinner /> Starting{status.script ? ` ${status.script}` : ""}…
      </span>
    );
  }
  const disabled = status.state === "no-script";
  return (
    <Button
      variant="default"
      disabled={disabled}
      onClick={onStart}
      title={disabled ? "No storybook/dev script in package.json" : undefined}
    >
      Start Storybook
    </Button>
  );
}

function UrlOverride({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="http://localhost:6006"
      className="mt-1 w-56 rounded-md border border-vs-border-strong bg-vs-bg-primary px-2.5 py-1.5 text-center font-mono text-[11px] text-vs-text-secondary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
    />
  );
}

function StatusDot({ status }: { status: InspectorComponent["status"] }): React.JSX.Element {
  const color =
    status === "verified"
      ? "bg-vs-success"
      : status === "has-issues"
        ? "bg-vs-warning"
        : status === "built"
          ? "bg-vs-text-muted"
          : "bg-vs-border-strong";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} title={status} />;
}

/** The cockpit side panel: component identity + tokens, a11y, source links, and gated modify. */
function CockpitPanel({
  component,
  projectPath,
  onModify,
  modifyBusy,
}: {
  component: InspectorComponent;
  projectPath: string;
  onModify: (request: string) => void;
  modifyBusy: boolean;
}): React.JSX.Element {
  const [modifyDraft, setModifyDraft] = useState("");

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="flex items-center gap-2 py-3">
        <span className="text-[15px] font-semibold">{component.name}</span>
        {component.level && (
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            {component.level}
          </span>
        )}
      </div>
      {component.description && (
        <p className="pb-2 text-xs leading-relaxed text-vs-text-secondary">{component.description}</p>
      )}
      <p className="pb-1 text-[11px] text-vs-text-muted">
        {component.props.length} prop{component.props.length === 1 ? "" : "s"} · edit controls live in
        Storybook
      </p>

      <Section title="Tokens consumed">
        {component.tokens.length === 0 ? (
          <span className="text-xs text-vs-text-muted">
            — (uses token utilities; var() scan found none)
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {component.tokens.map((t) => (
              <span
                key={t}
                className="rounded border border-vs-border-default bg-vs-bg-primary px-1.5 py-0.5 font-mono text-[11px] text-vs-text-secondary"
              >
                --{t}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Accessibility">
        {component.status === "verified" ? (
          <Check icon="✓" color="text-vs-success" label="visual-verify passed" />
        ) : component.status === "has-issues" ? (
          <div className="flex flex-col gap-1.5">
            {component.issues.map((i) => (
              <Check key={i} icon="!" color="text-vs-warning" label={i} />
            ))}
          </div>
        ) : (
          <Check icon="—" color="text-vs-text-muted" label="Run /visual-verify to populate checks" />
        )}
      </Section>

      <Section title="Source & spec">
        <div className="flex flex-col gap-1">
          <FileLink projectPath={projectPath} path={component.file} label="Component source" />
          <FileLink projectPath={projectPath} path={component.specPath} label="Spec" />
          <FileLink
            projectPath={projectPath}
            path={component.reportPath}
            label="Visual-verify report"
          />
        </div>
      </Section>

      <Section title="Modify with Claude">
        <textarea
          rows={2}
          value={modifyDraft}
          onChange={(e) => setModifyDraft(e.target.value)}
          placeholder="Describe a change — e.g. add a loading state, tighten the padding…"
          className="w-full resize-none rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-2 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-vs-text-muted">
            Applied by Claude Code, then reviewable — keep or revert.
          </span>
          <Button
            variant="primary"
            disabled={modifyBusy || modifyDraft.trim().length === 0}
            onClick={() => {
              onModify(modifyDraft.trim());
              setModifyDraft("");
            }}
          >
            {modifyBusy ? "Applying…" : "Apply"}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="border-b border-vs-border-subtle py-3.5">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

/** A row that reveals a project file in Finder, or shows it's absent (dimmed). */
function FileLink({
  projectPath,
  path,
  label,
}: {
  projectPath: string;
  path: string | null;
  label: string;
}): React.JSX.Element {
  if (!path) {
    return (
      <div className="flex items-center gap-2 text-xs text-vs-text-muted">
        <span className="w-3.5 text-center">—</span>
        <span className="flex-1">{label}</span>
        <span className="text-[10px]">not created yet</span>
      </div>
    );
  }
  return (
    <button
      onClick={() => void api.revealPath(projectPath, path)}
      title={`Reveal ${path} in Finder`}
      className="group flex items-center gap-2 text-left text-xs text-vs-text-secondary hover:text-vs-text-primary"
    >
      <span className="w-3.5 text-center text-vs-accent">↗</span>
      <span className="flex-1">{label}</span>
      <span className="max-w-[150px] truncate font-mono text-[10px] text-vs-text-muted group-hover:text-vs-text-secondary">
        {path}
      </span>
    </button>
  );
}

function Check({
  icon,
  color,
  label,
}: {
  icon: string;
  color: string;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3.5 text-center text-xs ${color}`}>{icon}</span>
      <span className="flex-1 text-xs text-vs-text-primary">{label}</span>
    </div>
  );
}
