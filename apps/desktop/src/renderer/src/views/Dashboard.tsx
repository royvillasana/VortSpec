import { useState } from "react";
import type { Project } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button } from "../components/ui";

/**
 * Project dashboard (US-03) — card grid per the VortSpec design.
 * "New folder" / "Open folder" both run the setup wizard before the flow.
 */
export function Dashboard({
  projects,
  onProjects,
  onOpenProject,
  onSetup,
}: {
  projects: Project[];
  onProjects: (p: Project[]) => void;
  onOpenProject: (project: Project) => void;
  onSetup: (project: Project) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startProject(source: "new" | "existing"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const project =
        source === "new" ? await api.createFolder() : await api.pickFolder(false);
      if (!project) return;
      onProjects([project, ...projects.filter((p) => p.path !== project.path)]);
      onSetup(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-16 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Projects</h1>
        <div className="flex-1" />
        <Button variant="default" disabled={busy} onClick={() => void startProject("existing")}>
          Open folder
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void startProject("new")}>
          {busy ? "…" : "New folder"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-vs-error/40 bg-vs-error/10 px-4 py-2 text-sm text-vs-error">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState onNew={() => void startProject("new")} onOpen={() => void startProject("existing")} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpenProject(project)}
              onSetup={() => onSetup(project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onSetup,
}: {
  project: Project;
  onOpen: () => void;
  onSetup: () => void;
}): React.JSX.Element {
  const ready = project.toolkit.present;
  return (
    <button
      onClick={ready ? onOpen : onSetup}
      className="group flex flex-col gap-3.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-5 text-left transition-all hover:border-vs-border-strong hover:shadow-[inset_2px_0_0_#7C6FF0]"
    >
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-vs-text-primary">{project.name}</span>
        <div className="flex gap-1.5">
          {ready ? (
            <Chip>SDD-DE</Chip>
          ) : (
            <span className="rounded border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 font-mono text-[10px] text-vs-warning">
              not set up
            </span>
          )}
        </div>
      </div>

      <p className="truncate font-mono text-[11px] text-vs-text-muted">{project.path}</p>

      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-xs text-vs-text-secondary">{runLabel(project.lastRunStatus)}</span>
        <span className="text-xs text-vs-text-muted">Added {relativeTime(project.addedAt)}</span>
      </div>

      <span className="text-xs font-medium text-vs-accent opacity-0 transition-opacity group-hover:opacity-100">
        {ready ? "Open flow →" : "Set up →"}
      </span>
    </button>
  );
}

function EmptyState({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 rounded-lg border border-vs-border-default bg-vs-bg-surface px-6 py-14 text-center">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <rect x="10" y="14" width="22" height="22" rx="4" fill="none" stroke="#34373D" strokeWidth="2" />
        <rect x="18" y="10" width="22" height="22" rx="4" fill="none" stroke="#7C6FF0" strokeWidth="2" strokeDasharray="5 4" />
      </svg>
      <div className="text-[15px] font-semibold text-vs-text-primary">No projects yet</div>
      <div className="max-w-xs text-sm text-vs-text-secondary">
        Create a new folder or open an existing one, answer a few setup questions, and start
        building your design system.
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="default" onClick={onOpen}>
          Open folder
        </Button>
        <Button variant="primary" onClick={onNew}>
          New folder
        </Button>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded border border-vs-border-default bg-vs-bg-primary px-1.5 py-0.5 font-mono text-[10px] text-vs-text-secondary">
      {children}
    </span>
  );
}

function runLabel(status: Project["lastRunStatus"]): string {
  switch (status) {
    case "running":
      return "Run in progress";
    case "needs-review":
      return "Needs review";
    case "approved":
      return "Approved";
    case "failed":
      return "Last run failed";
    default:
      return "No runs yet";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
