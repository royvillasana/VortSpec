import { useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Button, Spinner } from "@vortspec/ui/ui";

/**
 * Project dashboard (US-03, design: "Projects Dashboard.dc.html") — a two-column
 * card grid with each project's last-run status and quick actions. "New project"
 * creates the workspace folder, then routes into the design-source screen
 * (Design Input) where the source — ZIP, Figma, or an existing folder/repo — is
 * chosen. There's no separate "Open folder" entry; the folder source lives there.
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

  async function startProject(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // Create the project's workspace folder, then hand off to the design-source
      // screen. The design source (incl. an existing folder/repo) is chosen there.
      const project = await api.createFolder();
      if (!project) return;
      onProjects([project, ...projects.filter((p) => p.path !== project.path)]);
      onSetup(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-16 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Projects</h1>
        <span className="font-mono text-xs text-vs-text-muted">{projects.length} local</span>
        <div className="flex-1" />
        <Button variant="primary" disabled={busy} onClick={() => void startProject()}>
          {busy ? "…" : "New project"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-vs-error/40 bg-vs-error/10 px-4 py-2 text-sm text-vs-error">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState onNew={() => void startProject()} />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              // A set-up project (has .sdd-de/project.yaml) opens straight into the
              // guided flow. An empty or not-yet-set-up folder goes to intake first
              // — same path as creating a new project — instead of jumping into
              // component extraction on a folder that was never configured.
              onOpen={() => (project.toolkit.configured ? onOpenProject(project) : onSetup(project))}
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
}: {
  project: Project;
  onOpen: () => void;
}): React.JSX.Element {
  const ready = project.toolkit.configured ?? false;
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-surface transition-colors hover:border-vs-border-strong">
      <button
        onClick={onOpen}
        className="flex flex-col gap-3.5 px-5 pb-4 pt-5 text-left hover:shadow-[inset_2px_0_0_#7C6FF0]"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold text-vs-text-primary">{project.name}</span>
            {ready ? (
              <span className="rounded border border-vs-border-default bg-vs-bg-primary px-1.5 py-0.5 font-mono text-[10px] text-vs-text-secondary">
                SDD-DE{project.toolkit.version ? ` ${project.toolkit.version}` : ""}
              </span>
            ) : (
              <span className="rounded border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 font-mono text-[10px] text-vs-warning">
                not set up
              </span>
            )}
          </div>
          <span className="truncate font-mono text-[11px] text-vs-text-muted">{project.path}</span>
        </div>
        <StatusRow status={project.lastRunStatus} ready={ready} />
      </button>

      <div className="flex items-center gap-0.5 border-t border-vs-border-default p-1.5">
        <ActionButton onClick={onOpen} icon={<PlayIcon />}>
          {ready ? "Open flow" : "Set up"}
        </ActionButton>
        <ActionButton onClick={() => void api.openFolder(project.path)} icon={<FolderIcon />}>
          Folder
        </ActionButton>
        <span className="flex-1" />
        <span className="pr-2 text-[11px] text-vs-text-muted">{relativeTime(project.addedAt)}</span>
      </div>
    </div>
  );
}

function StatusRow({
  status,
  ready,
}: {
  status: Project["lastRunStatus"];
  ready: boolean;
}): React.JSX.Element {
  if (!ready) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-vs-warning" />
        <span className="text-xs text-vs-warning">Setup needed before the first run</span>
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Spinner />
          <span className="text-xs text-vs-accent">Run in progress</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-vs-border-default">
          <div className="h-full w-1/3 rounded-full bg-vs-accent animate-[vsSlide_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }
  const map = {
    "needs-review": { dot: "bg-vs-warning", text: "text-vs-warning", label: "Needs review", icon: null },
    approved: { dot: "bg-vs-success", text: "text-vs-text-secondary", label: "Passed verification", icon: "✓" },
    failed: { dot: "bg-vs-error", text: "text-vs-error", label: "Last run failed", icon: "✕" },
    none: { dot: "bg-vs-text-muted", text: "text-vs-text-muted", label: "No runs yet", icon: null },
  } as const;
  const m = map[status];
  return (
    <div className="flex items-center gap-2">
      {m.icon ? (
        <span className={`text-xs ${status === "approved" ? "text-vs-success" : "text-vs-error"}`}>
          {m.icon}
        </span>
      ) : (
        <span className={`h-2 w-2 rounded-full ${m.dot}`} />
      )}
      <span className={`text-xs ${m.text}`}>{m.label}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }): React.JSX.Element {
  return (
    <div className="mt-14 flex flex-col items-center gap-3 rounded-lg border border-vs-border-default bg-vs-bg-surface px-6 py-14 text-center">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <rect x="10" y="14" width="22" height="22" rx="4" fill="none" stroke="#34373D" strokeWidth="2" />
        <rect x="18" y="10" width="22" height="22" rx="4" fill="none" stroke="#7C6FF0" strokeWidth="2" strokeDasharray="5 4" />
      </svg>
      <div className="text-[15px] font-semibold text-vs-text-primary">No projects yet</div>
      <div className="max-w-xs text-sm text-vs-text-secondary">
        Create a project, then pick your design source — a ZIP, a Figma link, or an existing
        folder — to start a run.
      </div>
      <Button variant="primary" className="mt-1" onClick={onNew}>
        New project
      </Button>
    </div>
  );
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 3 L10 7 L4 11 Z" fill="currentColor" />
    </svg>
  );
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M1.5 4 A1 1 0 0 1 2.5 3 H5 L6.3 4.3 H11.5 A1 1 0 0 1 12.5 5.3 V10.5 A1 1 0 0 1 11.5 11.5 H2.5 A1 1 0 0 1 1.5 10.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
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
