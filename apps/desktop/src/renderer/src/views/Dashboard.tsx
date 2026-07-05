import { useState } from "react";
import type { Project } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

/**
 * Project dashboard (US-03). Lists known projects with toolkit status and
 * quick actions. "New project" picks a folder, then runs the setup wizard
 * (the CLI's init questions) before the flow can open.
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

  async function addProject(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const project = await api.pickFolder(false);
      if (!project) return;
      onProjects([project, ...projects.filter((p) => p.path !== project.path)]);
      // "New project" always runs setup (design source + framework questions)
      // before the flow — even for a folder that already has .sdd-de.
      onSetup(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add project");
    } finally {
      setBusy(false);
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
            Add a project folder, answer a few setup questions, and start the guided flow.
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
                      <>
                        SDD-DE toolkit{" "}
                        {project.toolkit.version ? `v${project.toolkit.version}` : "installed"}
                      </>
                    ) : (
                      <span className="text-vs-warning">Not set up yet</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" onClick={() => void api.openFolder(project.path)}>
                    Open folder
                  </Button>
                  {project.toolkit.present ? (
                    <Button variant="primary" onClick={() => onOpenProject(project)}>
                      Open flow
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => onSetup(project)}>
                      Set up
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
