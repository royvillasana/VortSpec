import { useEffect, useRef, useState } from "react";
import type { DevServerStatus, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";

/**
 * Run App (M5) — the live localhost runtime for the project's OWN app (its `dev`
 * script), distinct from the Storybook component Playground. VortSpec launches the
 * managed app server (confined to the project folder) and embeds it, so the user
 * can run and iterate on screens they vibe-engineer via the assistant (which is
 * modify-capable on this screen, seeded with a Screen-Creation context in App).
 */
export function RunApp({
  project,
  onBack,
  onFlow,
  onRun,
  onPlayground,
  onTokens,
  onManifest,
  onHistory,
  onSource,
}: {
  project: Project;
  onBack: () => void;
  onFlow: () => void;
  onRun: () => void;
  onPlayground: () => void;
  onTokens: () => void;
  onManifest: () => void;
  onHistory: () => void;
  onSource: () => void;
}): React.JSX.Element {
  const [dev, setDev] = useState<DevServerStatus>({ state: "stopped", url: null, script: null, message: null });
  const [frameLoading, setFrameLoading] = useState(true);
  const autoRef = useRef(false);

  const embedUrl = dev.url ? dev.url.replace(/\/+$/, "") + "/" : "";

  useEffect(() => {
    void api.appServerStatus(project.path).then(setDev);
    return api.onDevServerUpdate(({ projectPath, kind, status }) => {
      if (projectPath === project.path && kind === "app") setDev(status);
    });
  }, [project.path]);

  // Auto-start the app runtime on entry.
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    void (async () => {
      const s = await api.appServerStatus(project.path);
      if (s.url) setDev(s);
      else setDev(await api.startAppServer(project.path));
    })();
  }, [project.path]);

  useEffect(() => setFrameLoading(true), [embedUrl]);

  async function start(): Promise<void> {
    setDev(await api.startAppServer(project.path));
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("runapp", {
          onFlow,
          onRun,
          onPlayground,
          onTokens,
          onManifest,
          onHistory,
          onSource,
          onRunApp: () => undefined,
        })}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-5 py-3">
          <span className="text-[15px] font-semibold">Run app</span>
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            localhost
          </span>
          <span className="text-xs text-vs-text-muted">
            Describe a screen in Chat — it's built from your components and appears here live.
          </span>
          <div className="flex-1" />
          {dev.state === "running" && dev.url ? (
            <>
              <span className="font-mono text-[11px] text-vs-text-secondary">{dev.url.replace(/^https?:\/\//, "")}</span>
              <Button variant="ghost" onClick={() => void api.openInstall(dev.url!)}>Open in browser</Button>
              <Button variant="ghost" onClick={() => api.stopAppServer(project.path)}>Stop</Button>
            </>
          ) : (
            <Button variant="default" disabled={dev.state === "starting"} onClick={() => void start()}>
              {dev.state === "starting" ? "Starting…" : "Start app"}
            </Button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-vs-bg-primary">
          {dev.state === "starting" ? (
            <Centered>
              <Spinner /> Starting your app's dev server…
            </Centered>
          ) : embedUrl ? (
            <div className="relative h-full min-h-[340px]">
              <iframe
                key={embedUrl}
                title="app"
                src={embedUrl}
                onLoad={() => setFrameLoading(false)}
                className="h-full min-h-[340px] w-full border-0 bg-white"
              />
              {frameLoading && (
                <div className="absolute inset-0 grid place-items-center bg-vs-bg-primary/60 text-xs text-vs-text-secondary">
                  Loading the app…
                </div>
              )}
            </div>
          ) : dev.state === "no-script" ? (
            <Centered>
              <div className="max-w-md text-center">
                <p className="text-sm font-semibold text-vs-text-primary">No app dev script found</p>
                <p className="mt-1 text-xs text-vs-text-muted">
                  {dev.message ?? "Add a `dev` (or `start`/`preview`) script to package.json to run the app here."}
                </p>
              </div>
            </Centered>
          ) : dev.state === "error" ? (
            <Centered>
              <div className="max-w-md text-center">
                <p className="text-sm font-semibold text-vs-error">The app failed to start</p>
                <p className="mt-1 text-xs text-vs-text-muted">{dev.message}</p>
                <Button variant="default" className="mt-3" onClick={() => void start()}>Try again</Button>
              </div>
            </Centered>
          ) : (
            <Centered>
              <div className="text-center">
                <p className="text-sm text-vs-text-secondary">Run your project's app to preview it live.</p>
                <Button variant="primary" className="mt-3" onClick={() => void start()}>Start app</Button>
              </div>
            </Centered>
          )}
        </div>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[340px] items-center justify-center gap-2 p-12 text-sm text-vs-text-secondary">
      {children}
    </div>
  );
}
