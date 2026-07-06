import { useEffect, useRef, useState } from "react";
import type { DevServerStatus, Project } from "../../../shared/ipc";
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

/**
 * Component Playground — generates and embeds a real Storybook for the project.
 * Storybook's own sidebar drives which component/story you see; VortSpec just
 * stands the server up and embeds it. Component changes go through the global
 * assistant dock (top-bar Chat), which is modify-capable on this screen.
 * Claude Code is the engine — VortSpec doesn't re-implement Storybook.
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
  const [devUrl, setDevUrl] = useState("");
  const [dev, setDev] = useState<DevServerStatus>({
    state: "stopped",
    url: null,
    script: null,
    message: null,
  });
  const [frameLoading, setFrameLoading] = useState(true);

  const storybook = useAgentRun();
  const autoRef = useRef(false);

  const base = (devUrl.trim() || dev.url || "").replace(/\/+$/, "");
  const embedUrl = base ? `${base}/` : "";

  // Follow the managed dev server for this project.
  useEffect(() => {
    void api.devServerStatus(project.path).then(setDev);
    return api.onDevServerUpdate(({ projectPath, status }) => {
      if (projectPath === project.path) setDev(status);
    });
  }, [project.path]);

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

  // Auto bring-up on entering: embed a running Storybook instantly; if Storybook
  // is set up, launch it; otherwise generate it (then it launches) — no clicks.
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    void (async () => {
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  useEffect(() => setFrameLoading(true), [embedUrl]);

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

      {/* Canvas */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-5 py-3">
          <span className="text-[15px] font-semibold">Playground</span>
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            Storybook
          </span>
          <span className="text-xs text-vs-text-muted">Browse components in the Storybook sidebar →</span>
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
          {building ? (
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
