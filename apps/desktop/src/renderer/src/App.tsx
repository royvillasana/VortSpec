import { useEffect, useState } from "react";
import type { EnvReport, Project } from "../../shared/ipc";
import { api } from "./lib/api";
import { EnvironmentCheck } from "./views/EnvironmentCheck";
import { Dashboard } from "./views/Dashboard";
import { GuidedFlow } from "./views/GuidedFlow";
import { Inspector } from "./views/Inspector";
import { DevPreview } from "./views/DevPreview";
import { NewProjectWizard } from "./views/NewProjectWizard";
import { Spinner } from "./components/ui";

type View = "env" | "dashboard";

const CORE_IDS = ["node", "git", "claude-install"] as const;

function isCoreReady(report: EnvReport | null): boolean {
  if (!report) return false;
  return CORE_IDS.every(
    (id) => report.checks.find((c) => c.id === id)?.status === "pass",
  );
}

export default function App(): React.JSX.Element {
  const [report, setReport] = useState<EnvReport | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>("env");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [setupProject, setSetupProject] = useState<Project | null>(null);
  const [projectView, setProjectView] = useState<"flow" | "inspector" | "preview">("flow");
  const [loading, setLoading] = useState(true);

  function mergeProject(project: Project): void {
    setProjects((prev) => [project, ...prev.filter((p) => p.path !== project.path)]);
  }

  useEffect(() => {
    void (async () => {
      const [envReport, projectList] = await Promise.all([
        api.checkEnvironment(),
        api.listProjects(),
      ]);
      setReport(envReport);
      setProjects(projectList);
      // Skip the gate when the environment is already fully ready.
      setView(envReport.ready ? "dashboard" : "env");
      setLoading(false);
    })();
  }, []);

  const coreReady = isCoreReady(report);

  return (
    <div className="flex min-h-screen flex-col bg-vs-bg-primary text-vs-text-primary">
      <TopBar
        view={view}
        coreReady={coreReady}
        breadcrumb={setupProject?.name ?? activeProject?.name ?? null}
        onNavigate={(v) => {
          setView(v);
          if (v === "dashboard") {
            setActiveProject(null);
            setSetupProject(null);
            setProjectView("flow");
          }
        }}
      />
      <main className="flex-1">
        {loading || !report ? (
          <div className="flex h-full items-center justify-center gap-2 py-24 text-vs-text-secondary">
            <Spinner /> Checking your environment…
          </div>
        ) : view === "env" ? (
          <EnvironmentCheck
            report={report}
            onReport={setReport}
            coreReady={coreReady}
            onContinue={() => setView("dashboard")}
          />
        ) : setupProject ? (
          <NewProjectWizard
            project={setupProject}
            onCancel={() => setSetupProject(null)}
            onCreated={(project) => {
              mergeProject(project);
              setSetupProject(null);
              setActiveProject(project);
            }}
          />
        ) : activeProject && projectView === "inspector" ? (
          <Inspector
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenPreview={() => setProjectView("preview")}
          />
        ) : activeProject && projectView === "preview" ? (
          <DevPreview project={activeProject} onBack={() => setProjectView("flow")} />
        ) : activeProject ? (
          <GuidedFlow
            project={activeProject}
            onBack={() => setActiveProject(null)}
            onOpenInspector={() => setProjectView("inspector")}
          />
        ) : (
          <Dashboard
            projects={projects}
            onProjects={setProjects}
            onOpenProject={setActiveProject}
            onSetup={setSetupProject}
          />
        )}
      </main>
    </div>
  );
}

function TopBar({
  view,
  coreReady,
  onNavigate,
  breadcrumb,
}: {
  view: View;
  coreReady: boolean;
  onNavigate: (v: View) => void;
  breadcrumb?: string | null;
}): React.JSX.Element {
  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b border-vs-border-default px-6"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2 pl-16 text-[13px]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-vs-accent font-mono text-[10px] font-medium text-vs-bg-primary">
          V
        </span>
        <button
          onClick={() => onNavigate("dashboard")}
          className="font-semibold tracking-[-0.01em] text-vs-text-primary hover:underline"
        >
          VortSpec
        </button>
        {breadcrumb && (
          <>
            <span className="text-vs-text-muted">/</span>
            <span className="max-w-[280px] truncate text-vs-text-secondary">{breadcrumb}</span>
          </>
        )}
      </div>
      <div
        className="flex items-center gap-3 text-xs"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={() => onNavigate("env")}
          title="Environment"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-vs-text-secondary transition-colors hover:text-vs-text-primary"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${coreReady ? "bg-vs-success" : "bg-vs-warning"}`}
          />
          {view === "env" ? "Environment" : "Ready"}
        </button>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-vs-border-strong bg-vs-bg-elevated text-[11px] font-medium text-vs-text-secondary">
          You
        </span>
      </div>
    </header>
  );
}
