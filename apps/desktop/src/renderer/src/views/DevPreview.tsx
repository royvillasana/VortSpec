import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorComponent, PropControl, Project } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Spinner } from "../components/ui";
import { ProjectRail } from "../components/ProjectRail";

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
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenInspector: () => void;
}): React.JSX.Element {
  const [components, setComponents] = useState<InspectorComponent[] | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selName, setSelName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bg, setBg] = useState<Bg>("app");
  const [devUrl, setDevUrl] = useState("");

  useEffect(() => {
    void api.inspectorComponents(project.path).then((r) => {
      setComponents(r.components);
      setPreviewUrl(r.previewUrl);
      setSelName((cur) => cur ?? r.components[0]?.name ?? null);
    });
  }, [project.path]);

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
  const embedUrl = devUrl.trim() || previewUrl || "";

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
          <input
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="http://localhost:5173"
            className="w-44 rounded-lg border border-vs-border-default bg-vs-bg-surface px-2.5 py-1.5 font-mono text-[11px] text-vs-text-secondary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto transition-colors" style={{ background: BG[bg] }}>
          {embedUrl ? (
            <iframe
              title="preview"
              src={embedUrl}
              className="h-full min-h-[340px] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="max-w-md rounded-xl border border-black/10 bg-white/70 p-6 text-center">
                <p className="text-sm font-semibold text-zinc-800">No live preview yet</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Rendering the real component needs a running dev server or a generated harness.
                  Start your project's dev server (or Storybook) and paste its URL above to embed it,
                  or wait for the managed-preview slice that launches and generates a harness for you.
                </p>
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
