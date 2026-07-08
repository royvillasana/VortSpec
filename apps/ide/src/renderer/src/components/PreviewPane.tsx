import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { DevServerStatus, Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { useIde } from "../lib/ide-context";

type Kind = "app" | "storybook";

const STOPPED: DevServerStatus = { state: "stopped", url: null, script: null, message: null };

function statusFor(kind: Kind, path: string): Promise<DevServerStatus> {
  return kind === "app" ? api.appServerStatus(path) : api.devServerStatus(path);
}
function startFor(kind: Kind, path: string): Promise<DevServerStatus> {
  return kind === "app" ? api.startAppServer(path) : api.startDevServer(path);
}
function stopFor(kind: Kind, path: string): Promise<void> {
  return kind === "app" ? api.stopAppServer(path) : api.stopDevServer(path);
}

/**
 * The live preview: embeds the project's running app (its `dev` script) or its
 * Storybook beside the editor. It attaches to an already-running server (keyed
 * by kind in the shared dev-server) and never double-starts; when nothing is
 * running it offers a start-on-demand button. Server problems render as fix-it
 * cards, not raw logs.
 */
export function PreviewPane({ project }: { project: Project }): JSX.Element {
  const [kind, setKind] = useState<Kind>("app");
  const [dev, setDev] = useState<DevServerStatus>(STOPPED);
  const [frameLoading, setFrameLoading] = useState(true);
  const { setPreviewUrl } = useIde();
  const embedUrl = dev.url ? dev.url.replace(/\/+$/, "") + "/" : "";

  // Publish the running preview URL to the assistant's context.
  useEffect(() => {
    setPreviewUrl(dev.state === "running" ? dev.url : null);
    return () => setPreviewUrl(null);
  }, [dev.state, dev.url, setPreviewUrl]);

  // Attach to the current server for this kind and follow its updates.
  useEffect(() => {
    setDev(STOPPED);
    void statusFor(kind, project.path).then(setDev);
    return api.onDevServerUpdate(({ projectPath, kind: k, status }) => {
      if (projectPath === project.path && k === kind) setDev(status);
    });
  }, [project.path, kind]);

  useEffect(() => setFrameLoading(true), [embedUrl]);

  async function start(): Promise<void> {
    setDev(await startFor(kind, project.path));
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-vs-bg-primary">
      <header className="flex flex-none items-center gap-2 border-b border-vs-border-default px-3 py-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-vs-text-muted">Preview</span>
        {/* App / Storybook kind toggle */}
        <div className="flex overflow-hidden rounded border border-vs-border-default">
          {(["app", "storybook"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`px-2 py-0.5 capitalize ${kind === k ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"}`}
            >
              {k === "app" ? "App" : "Storybook"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {dev.state === "running" && dev.url ? (
          <>
            <span className="font-mono text-vs-text-secondary">{dev.url.replace(/^https?:\/\//, "")}</span>
            <button type="button" onClick={() => void api.openInstall(dev.url!)} className="text-vs-text-muted hover:text-vs-text-secondary">
              Open in browser
            </button>
            <button type="button" onClick={() => void stopFor(kind, project.path)} className="text-vs-text-muted hover:text-vs-text-secondary">
              Stop
            </button>
          </>
        ) : (
          <Button variant="ghost" disabled={dev.state === "starting"} onClick={() => void start()}>
            {dev.state === "starting" ? "Starting…" : "Start"}
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {dev.state === "starting" ? (
          <Centered>
            <Spinner /> Starting the {kind === "app" ? "app" : "Storybook"} server…
          </Centered>
        ) : embedUrl ? (
          <div className="relative h-full">
            <iframe
              key={embedUrl}
              title="preview"
              src={embedUrl}
              onLoad={() => setFrameLoading(false)}
              className="h-full w-full border-0 bg-white"
            />
            {frameLoading && (
              <div className="absolute inset-0 grid place-items-center bg-vs-bg-primary/60 text-xs text-vs-text-secondary">
                Loading…
              </div>
            )}
          </div>
        ) : dev.state === "no-script" ? (
          <FixIt title={`No ${kind === "app" ? "app dev" : "Storybook"} script found`} detail={dev.message ?? "Add the relevant script to package.json to preview it here."} />
        ) : dev.state === "error" ? (
          <FixIt title="The server failed to start" detail={dev.message ?? "Check the terminal for details."} onRetry={() => void start()} />
        ) : (
          <Centered>
            <div className="text-center">
              <p className="text-vs-text-secondary">Preview the running {kind === "app" ? "app" : "Storybook"} beside your code.</p>
              <Button variant="primary" className="mt-3" onClick={() => void start()}>
                Start {kind === "app" ? "app" : "Storybook"}
              </Button>
            </div>
          </Centered>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="flex h-full items-center justify-center gap-2 p-6 text-xs text-vs-text-secondary">{children}</div>;
}

function FixIt({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-md border border-vs-border-default bg-vs-bg-surface p-4 text-center">
        <p className="text-sm font-semibold text-vs-text-primary">{title}</p>
        <p className="mt-1 text-xs text-vs-text-muted">{detail}</p>
        {onRetry && (
          <Button variant="default" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
