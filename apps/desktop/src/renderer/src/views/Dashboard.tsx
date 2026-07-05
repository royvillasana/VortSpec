import { useState } from "react";
import type { Project } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

/**
 * Project dashboard (US-03). Lists known projects with toolkit version and
 * quick actions. "New project" opens a folder picker. Flow/terminal actions
 * are placeholders until D1.
 */
export function Dashboard({
  projects,
  onProjects,
}: {
  projects: Project[];
  onProjects: (p: Project[]) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addProject(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const project = await api.pickFolder(false);
      if (!project) return;
      const next = [project, ...projects.filter((p) => p.path !== project.path)];
      onProjects(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add project");
    } finally {
      setBusy(false);
    }
  }

  async function installToolkit(project: Project): Promise<void> {
    setError(null);
    try {
      const toolkit = await api.installToolkit(project.path);
      onProjects(
        projects.map((p) => (p.path === project.path ? { ...p, toolkit } : p)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toolkit install failed");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-vs-text-primary">Projects</h2>
          <p className="text-sm text-vs-text-secondary">
            Choose a project to run the Spec-Driven Design Engineering flow.
          </p>
        </div>
        <Button variant="primary" disabled={busy} onClick={() => void addProject()}>
          {busy ? "Opening…" : "New project"}
        </Button>
      </header>

      {error && (
        <div className="rounded-md border border-vs-error/40 bg-vs-error/10 px-4 py-2 text-sm text-vs-error">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm font-medium text-vs-text-primary">No projects yet</p>
          <p className="max-w-xs text-xs text-vs-text-muted">
            Add a project folder to install the SDD-DE toolkit and start the guided flow.
          </p>
          <Button variant="primary" className="mt-2" onClick={() => void addProject()}>
            Add a project
          </Button>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-vs-text-primary">
                    {project.name}
                  </p>
                  <p className="truncate text-xs text-vs-text-muted">{project.path}</p>
                  <p className="mt-1 text-xs text-vs-text-secondary">
                    {project.toolkit.present ? (
                      <>SDD-DE toolkit v{project.toolkit.version}</>
                    ) : (
                      <span className="text-vs-warning">Toolkit not installed</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!project.toolkit.present && (
                    <Button onClick={() => void installToolkit(project)}>
                      Install toolkit
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => void api.openFolder(project.path)}>
                    Open folder
                  </Button>
                  <Button variant="default" disabled title="Guided flow arrives in D1">
                    Open flow
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
