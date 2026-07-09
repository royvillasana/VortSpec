import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Project, DevServerStatus } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { usePersistentBool, usePersistentString } from "./Resizer";

type Kind = "app" | "storybook";

const statusFor = (k: Kind, p: string): Promise<DevServerStatus> =>
  k === "app" ? api.appServerStatus(p) : api.devServerStatus(p);
const startFor = (k: Kind, p: string): Promise<DevServerStatus> =>
  k === "app" ? api.startAppServer(p) : api.startDevServer(p);

function portOf(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).port || "80";
  } catch {
    return "—";
  }
}

/**
 * The preview nav bar pinned to the bottom of the editor group. Replaces the
 * embedded preview iframe: pick App/Storybook, Open Browser opens the dev
 * server's localhost URL externally (starting it if needed), and the arrow
 * expands local-environment details. Collapsed by default; dark background.
 */
export function PreviewBar({ project }: { project: Project }): JSX.Element {
  const [kind, setKind] = usePersistentString<Kind>("vs.ide.previewKind", "app");
  const [expanded, setExpanded] = usePersistentBool("vs.ide.previewExpanded", false);
  const [dev, setDev] = useState<DevServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    // Clear immediately so a stale App/Storybook status never lingers across a
    // tab switch (its URL must not be reused by Open Browser).
    setDev(null);
    setErr("");
    void statusFor(kind, project.path).then((s) => live && setDev(s));
    const off = api.onDevServerUpdate(({ projectPath, kind: k, status }) => {
      const wanted = kind === "app" ? "app" : "storybook";
      if (projectPath === project.path && k === wanted) setDev(status);
    });
    return () => {
      live = false;
      off();
    };
  }, [project.path, kind]);

  async function openBrowser(): Promise<void> {
    setBusy(true);
    setErr("");
    try {
      // Resolve the CURRENT tab's server fresh — `dev` can lag a tab switch, so
      // trusting it here would open the other server's URL (App vs Storybook).
      let s = await statusFor(kind, project.path);
      if (s.state !== "running" || !s.url) {
        s = await startFor(kind, project.path);
      }
      setDev(s);
      if (s.url) await api.openInstall(s.url);
      else setErr(s.message ?? `Couldn't start the ${kind === "app" ? "app" : "Storybook"} server for this project.`);
    } catch {
      setErr("Couldn't open the browser.");
    } finally {
      setBusy(false);
    }
  }

  const url = dev?.url ?? null;
  const state = dev?.state ?? "stopped";

  return (
    <div data-testid="preview-bar" className="flex-none border-t border-vs-border-default bg-vs-bg-code text-[11px] text-vs-text-muted">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="font-semibold uppercase tracking-wide">Preview</span>
        <div className="flex gap-0.5 rounded border border-vs-border-default">
          {(["app", "storybook"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`px-2 py-0.5 ${
                kind === k ? "bg-vs-bg-elevated text-vs-text-primary" : "hover:text-vs-text-secondary"
              }`}
            >
              {k === "app" ? "App" : "Storybook"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void openBrowser()}
          disabled={busy}
          title="Open the dev server in your browser (starts it if needed)"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-vs-text-secondary hover:text-vs-text-primary disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open Browser"}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 4h5v5" />
            <path d="M16 4l-7 7" />
            <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16h8A1.5 1.5 0 0 0 15 14.5V12" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={expanded ? "Collapse preview details" : "Expand preview details"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="rounded px-1 text-[10px] hover:text-vs-text-secondary"
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-vs-border-subtle px-3 py-1.5">
          <span>
            URL:{" "}
            <span className="font-mono text-vs-text-secondary">{url ?? "not running"}</span>
          </span>
          <span>State: <span className="text-vs-text-secondary">{state}</span></span>
          <span>Script: <span className="font-mono text-vs-text-secondary">{dev?.script ?? "—"}</span></span>
          <span>Port: <span className="font-mono text-vs-text-secondary">{portOf(url)}</span></span>
          {err && <span className="text-vs-error">{err}</span>}
        </div>
      )}
    </div>
  );
}
