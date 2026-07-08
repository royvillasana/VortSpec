import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Button, Spinner } from "@vortspec/ui/ui";

/**
 * The IDE's entry screen: open a project folder as a workspace, or pick a
 * recent one. Opening resolves the folder into a Project via the shared
 * workspace handlers (same as the cockpit) — no IDE-specific logic.
 */
export function WorkspacePicker({ onOpen }: { onOpen: (project: Project) => void }): JSX.Element {
  const [recent, setRecent] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .listProjects()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  async function openFolder(): Promise<void> {
    setBusy(true);
    try {
      const project = await api.pickFolder(false);
      if (project) onOpen(project);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-vs-bg-primary">
      <div className="w-full max-w-md px-8">
        <h1 className="text-lg font-semibold text-vs-text-primary">VortSpec IDE</h1>
        <p className="mt-1 text-sm text-vs-text-secondary">
          Open a project to create components, document them, and vibe-engineer against a live preview.
        </p>

        <div className="mt-5">
          <Button onClick={() => void openFolder()} disabled={busy}>
            {busy ? <Spinner /> : null}
            Open a folder…
          </Button>
        </div>

        <div className="mt-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Recent
          </p>
          {recent === null ? (
            <div className="flex items-center gap-2 text-sm text-vs-text-muted">
              <Spinner /> Loading…
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-vs-text-muted">No recent projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((p) => (
                <li key={p.path}>
                  <button
                    type="button"
                    onClick={() => onOpen(p)}
                    className="flex w-full flex-col items-start rounded-md border border-vs-border-subtle bg-vs-bg-surface px-3 py-2 text-left transition-colors hover:bg-vs-bg-hover"
                  >
                    <span className="text-sm text-vs-text-primary">{p.name}</span>
                    <span className="truncate font-mono text-[11px] text-vs-text-muted">{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
