import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DevServerStatus,
  InspectorComponent,
  PropControl,
  Project,
} from "../../../shared/ipc";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Button, Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";
import { ProjectRail } from "../components/ProjectRail";

const HARNESS_PROMPT = [
  "Set up a live component preview so this project's dev server renders every component.",
  "",
  "1. Read `.sdd-de/project.yaml` (framework, language, styling, component_dir) and",
  "   `.sdd-de/components.json` (the component inventory).",
  "2. Create a preview harness for that framework: a mount entry + a gallery page that imports",
  "   and renders EVERY component from components.json across its main variants/states, using the",
  "   project's design tokens. If the project already uses Storybook, generate stories instead.",
  "3. Ensure a working dev script serves the harness at the root (e.g. for a Vite React app, add",
  "   src/main.tsx + index.html and a `dev` script). Install any missing dev deps with the",
  "   project's package manager.",
  "4. Keep it minimal and self-contained. Do NOT modify the components themselves; make the",
  "   harness git-ignorable where practical.",
  "",
  "When done, the dev server should render the component gallery at its root URL.",
].join("\n");

type Values = Record<string, string | boolean>;
type Bg = "app" | "white" | "dark";
const BG: Record<Bg, string> = { app: "#EFEFF1", white: "#FFFFFF", dark: "#0F0F10" };
const LEVEL_ORDER = ["atom", "molecule", "organism", "other"] as const;
const LEVEL_LABEL: Record<string, string> = {
  atom: "Atoms",
  molecule: "Molecules",
  organism: "Organisms",
  other: "Components",
};

/**
 * Dev Preview — the component Playground (design: "Dev Preview.dc.html", adapted
 * to v2). Component picker (from the project's components.json) → live canvas
 * (embedded dev-server webview when available) → controls derived from the
 * component's real CVA props, tokens it consumes, a11y from its verify report,
 * and a generated code snippet. Everything is file-derived; no IR store.
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selName, setSelName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bg, setBg] = useState<Bg>("app");
  const [devUrl, setDevUrl] = useState("");
  const [dev, setDev] = useState<DevServerStatus>({
    state: "stopped",
    url: null,
    script: null,
    message: null,
  });

  useEffect(() => {
    void api.inspectorComponents(project.path).then((r) => {
      setComponents(r.components);
      setPreviewUrl(r.previewUrl);
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

  const harness = useAgentRun();

  async function startPreview(): Promise<void> {
    setDev(await api.startDevServer(project.path));
  }
  function stopPreview(): void {
    void api.stopDevServer(project.path);
  }
  async function generateHarness(): Promise<void> {
    await harness.start({
      prompt: HARNESS_PROMPT,
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }

  // Once Claude Code has written the harness, launch the dev server automatically.
  useEffect(() => {
    if (harness.model.status === "done") void startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harness.model.status]);

  const groups = useMemo(() => {
    if (!components) return [];
    const q = query.trim().toLowerCase();
    const filtered = components.filter((c) => q === "" || c.name.toLowerCase().includes(q));
    return LEVEL_ORDER.map((level) => ({
      level,
      items: filtered.filter((c) => (c.level ?? "other") === level),
    })).filter((g) => g.items.length > 0);
  }, [components, query]);

  const selected = components?.find((c) => c.name === selName) ?? null;
  const embedUrl = devUrl.trim() || dev.url || previewUrl || "";

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={[
          { label: "Flow", onClick: onBack },
          { label: "Run", onClick: onOpenRun },
          { label: "Preview", active: true },
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
          {selected?.file && (
            <span className="rounded border border-vs-border-default px-1.5 py-px font-mono text-[11px] text-vs-text-secondary">
              {selected.file}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex gap-0.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
            {(Object.keys(BG) as Bg[]).map((b) => (
              <button
                key={b}
                onClick={() => setBg(b)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ${
                  bg === b ? "bg-vs-bg-elevated" : "hover:opacity-85"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-[3px] border border-vs-border-strong"
                  style={{ background: BG[b] }}
                />
                <span className={`text-[11px] ${bg === b ? "text-vs-text-primary" : "text-vs-text-secondary"}`}>
                  {b === "app" ? "App" : b === "white" ? "White" : "Dark"}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            disabled={harness.running}
            onClick={() => void generateHarness()}
            title="Have Claude Code write a preview harness for this project"
          >
            {harness.running ? "Generating…" : "Generate harness"}
          </Button>
          <DevServerControl
            status={dev}
            onStart={() => void startPreview()}
            onStop={stopPreview}
            onOpen={(u) => void api.openInstall(u)}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto transition-colors" style={{ background: BG[bg] }}>
          {harness.running || (harness.model.status === "done" && !dev.url) ? (
            <div className="flex min-h-[340px] items-start justify-center p-6">
              <div className="w-full max-w-2xl rounded-xl border border-vs-border-default bg-vs-bg-surface p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-vs-text-primary">
                  {harness.running ? (
                    <>
                      <Spinner /> Generating a preview harness with Claude Code…
                    </>
                  ) : (
                    <>
                      <span className="text-vs-success">✓</span> Harness generated — starting the
                      preview…
                    </>
                  )}
                </div>
                <RunPanel
                  model={harness.model}
                  onSend={(t) => void harness.send(t)}
                  canChat={harness.canChat}
                />
              </div>
            </div>
          ) : embedUrl ? (
            <iframe
              title="preview"
              src={embedUrl}
              className="h-full min-h-[340px] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-black/10 bg-white/80 p-6 text-center">
                {dev.state === "starting" ? (
                  <>
                    <Spinner />
                    <p className="text-sm font-medium text-zinc-700">
                      Starting the dev server{dev.script ? ` (${dev.script})` : ""}…
                    </p>
                  </>
                ) : dev.state === "no-script" ? (
                  <>
                    <p className="text-sm font-semibold text-zinc-800">No preview surface yet</p>
                    <p className="text-xs text-zinc-500">
                      {dev.message} Claude Code can generate a gallery/Storybook harness so the dev
                      server renders every component.
                    </p>
                    <Button variant="primary" onClick={() => void generateHarness()}>
                      Generate preview harness
                    </Button>
                    <UrlOverride value={devUrl} onChange={setDevUrl} />
                  </>
                ) : dev.state === "error" ? (
                  <>
                    <p className="text-sm font-semibold text-red-600">Preview failed to start</p>
                    <p className="text-xs text-zinc-500">{dev.message}</p>
                    <Button variant="default" onClick={() => void startPreview()}>
                      Try again
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-zinc-800">No live preview yet</p>
                    <p className="text-xs text-zinc-500">
                      Start the project&rsquo;s dev server to render components live. If it renders
                      nothing, have Claude Code generate a preview harness.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => void startPreview()}>
                        Start preview
                      </Button>
                      <Button variant="default" onClick={() => void generateHarness()}>
                        Generate harness
                      </Button>
                    </div>
                    <UrlOverride value={devUrl} onChange={setDevUrl} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Controls panel */}
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-vs-border-default bg-vs-bg-surface">
        <div className="flex flex-none items-center gap-2 border-b border-vs-border-default px-4 py-3">
          <span className="text-sm font-semibold">Controls</span>
          <div className="flex-1" />
        </div>
        {selected ? (
          <ControlsPanel key={selected.name} component={selected} />
        ) : (
          <p className="p-4 text-xs text-vs-text-muted">Select a component.</p>
        )}
      </aside>
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
      title={disabled ? "No dev/storybook script in package.json" : undefined}
    >
      Start preview
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
      placeholder="http://localhost:5173"
      className="mt-1 w-56 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-center font-mono text-[11px] text-zinc-700 placeholder:text-zinc-400 focus:outline-none"
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

function initialValues(props: PropControl[]): Values {
  const v: Values = {};
  for (const p of props) {
    if (p.kind === "boolean") v[p.key] = p.defaultValue === "true";
    else v[p.key] = p.defaultValue ?? p.options[0] ?? "";
  }
  return v;
}

function ControlsPanel({ component }: { component: InspectorComponent }): React.JSX.Element {
  const [values, setValues] = useState<Values>(() => initialValues(component.props));
  const set = (k: string, v: string | boolean): void => setValues((s) => ({ ...s, [k]: v }));
  const reset = (): void => setValues(initialValues(component.props));

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="flex items-center py-2">
        <span className="text-[11px] text-vs-text-muted">
          {component.props.length} prop{component.props.length === 1 ? "" : "s"} · from source
        </span>
        <div className="flex-1" />
        <button
          onClick={reset}
          className="rounded-md border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
        >
          Reset
        </button>
      </div>

      {component.props.length === 0 && (
        <p className="py-2 text-xs text-vs-text-muted">No source-declared variant props found.</p>
      )}
      {component.props.map((p) => (
        <div key={p.key} className="flex flex-col gap-1.5 border-b border-vs-border-subtle py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-vs-text-primary">{p.key}</span>
            <span className="font-mono text-[10px] text-vs-text-muted">{p.kind}</span>
          </div>
          <PropInput prop={p} value={values[p.key]} onChange={(v) => set(p.key, v)} />
        </div>
      ))}

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

      <Section title="Code">
        <div className="whitespace-pre-wrap break-words rounded-md border border-vs-border-default bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-vs-text-secondary">
          {snippet(component.name, component.props, values)}
        </div>
      </Section>
    </div>
  );
}

function PropInput({
  prop,
  value,
  onChange,
}: {
  prop: PropControl;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}): React.JSX.Element {
  if (prop.kind === "boolean") {
    const on = value === true;
    return (
      <button
        onClick={() => onChange(!on)}
        className={`flex h-[19px] w-[34px] rounded-full border border-vs-border-strong p-px hover:border-vs-accent ${
          on ? "justify-end bg-vs-accent" : "justify-start bg-vs-border-default"
        }`}
      >
        <span className="block h-[15px] w-[15px] rounded-full bg-vs-text-primary" />
      </button>
    );
  }
  if (prop.kind === "enum" && prop.options.length <= 4) {
    return (
      <div className="flex flex-wrap gap-0.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-0.5">
        {prop.options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`min-w-[44px] flex-1 rounded px-2 py-1 font-mono text-[11px] ${
              value === o ? "bg-vs-bg-elevated text-vs-accent" : "text-vs-text-muted hover:text-vs-text-primary"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (prop.kind === "enum") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 text-xs text-vs-text-primary focus:outline-none focus-visible:border-vs-accent"
      >
        {prop.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 text-xs text-vs-text-primary focus:outline-none focus-visible:border-vs-accent"
    />
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

function snippet(name: string, props: PropControl[], values: Values): string {
  const attrs = props
    .map((p) => {
      const v = values[p.key];
      if (p.kind === "boolean") return v ? `\n  ${p.key}` : "";
      return `\n  ${p.key}="${String(v)}"`;
    })
    .filter(Boolean)
    .join("");
  return attrs ? `<${name}${attrs}\n/>` : `<${name} />`;
}
