import { useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Button } from "@vortspec/ui/ui";

/**
 * A slim banner shown when the open project's SDD-DE toolkit is behind the version
 * bundled with this build (change: toolkit-resync). One click re-copies the bundled
 * toolkit into the project — the in-app equivalent of `npx @royvillasana/sdd-de update`,
 * non-interactive (no CLI, no TTY). `project.yaml` is preserved; skills/docs/CLAUDE.md
 * are refreshed. Dismissible for the session.
 */
export function ToolkitUpdateBanner({
  project,
  onUpdated,
}: {
  project: Project;
  /** The re-synced project (fresh toolkit status) — the host swaps it in so the banner clears. */
  onUpdated: (project: Project) => void;
}): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (!project.toolkit.updateAvailable || dismissed) return null;

  async function update(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.resyncToolkit(project.path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the toolkit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-none items-center gap-3 border-b border-vs-accent/40 bg-vs-accent-subtle px-4 py-1.5 text-[12px]">
      <span className="flex-none text-vs-accent" aria-hidden>
        ↑
      </span>
      <span className="min-w-0 flex-1 text-vs-text-primary">
        A newer <b>SDD-DE toolkit</b> is available
        {project.toolkit.version ? ` — this project is on ${project.toolkit.version}` : ""}. Update its skills,
        docs, and <code className="font-mono">CLAUDE.md</code> — your <code className="font-mono">project.yaml</code>{" "}
        config is preserved.
      </span>
      {error && <span className="flex-none text-vs-error">{error}</span>}
      <Button variant="primary" disabled={busy} onClick={() => void update()}>
        {busy ? "Updating…" : "Update toolkit"}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => setDismissed(true)}>
        Later
      </Button>
    </div>
  );
}
