import { useEffect, useState } from "react";
import type { EnvReport, Project } from "../../shared/ipc";
import { api } from "./lib/api";
import { EnvironmentCheck } from "./views/EnvironmentCheck";
import { Dashboard } from "./views/Dashboard";
import { RunView } from "./views/RunView";
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
  const [loading, setLoading] = useState(true);

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
        onNavigate={(v) => {
          setView(v);
          if (v === "dashboard") setActiveProject(null);
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
        ) : activeProject ? (
          <RunView project={activeProject} onBack={() => setActiveProject(null)} />
        ) : (
          <Dashboard
            projects={projects}
            onProjects={setProjects}
            onOpenProject={setActiveProject}
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
}: {
  view: View;
  coreReady: boolean;
  onNavigate: (v: View) => void;
}): React.JSX.Element {
  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b border-vs-border-default bg-vs-bg-surface px-4"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 pl-16">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-vs-accent-muted text-xs font-semibold text-vs-accent">
          V
        </span>
        <span className="text-sm font-semibold">VortSpec</span>
      </div>
      <nav
        className="flex items-center gap-1 text-xs"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <NavButton active={view === "env"} onClick={() => onNavigate("env")}>
          <span
            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${coreReady ? "bg-vs-success" : "bg-vs-warning"}`}
          />
          Environment
        </NavButton>
        <NavButton active={view === "dashboard"} onClick={() => onNavigate("dashboard")}>
          Projects
        </NavButton>
      </nav>
    </header>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center rounded-md px-2.5 py-1 transition-colors ${
        active
          ? "bg-vs-bg-elevated text-vs-text-primary"
          : "text-vs-text-secondary hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
