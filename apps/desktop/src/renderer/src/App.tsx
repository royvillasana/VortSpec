import { useEffect, useState } from "react";
import type { EnvReport, Project, SetupAnswers } from "../../shared/ipc";
import { api } from "./lib/api";
import { EnvironmentCheck } from "./views/EnvironmentCheck";
import { Dashboard } from "./views/Dashboard";
import { GuidedFlow } from "./views/GuidedFlow";
import { Inspector } from "./views/Inspector";
import { DevPreview } from "./views/DevPreview";
import { RunView } from "./views/RunView";
import { ArtifactReview } from "./views/ArtifactReview";
import { Verification } from "./views/Verification";
import { History } from "./views/History";
import { DesignManifest } from "./views/DesignManifest";
import { DesignInput } from "./views/DesignInput";
import { Intake } from "./views/Intake";
import { NewProjectWizard } from "./views/NewProjectWizard";
import { Logo } from "./components/Logo";
import { AssistantDock } from "./components/AssistantDock";

type View = "env" | "dashboard";

const CORE_IDS = ["node", "git", "claude-install"] as const;

/** Reject if `promise` doesn't settle within `ms` — used to bound startup probes. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup probe timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Shown when the startup probe times out/fails, so the env screen can explain it.
 * Uses an install-link fix (usage-free); the screen's top-level "Re-check" button
 * re-runs the full environment check once the user resolves the issue.
 */
const STARTUP_FAILED_REPORT: EnvReport = {
  ready: false,
  checks: [
    {
      id: "claude-install",
      label: "Claude Code",
      status: "unknown",
      detail:
        "Couldn't verify your environment on launch — the check timed out. Make sure Claude Code is installed and on your PATH, then press Re-check.",
      fix: { kind: "install-link", label: "Install Claude Code", url: "https://code.claude.com/docs/en/overview" },
    },
  ],
};

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
  const [sourceProject, setSourceProject] = useState<Project | null>(null);
  const [intakeProject, setIntakeProject] = useState<Project | null>(null);
  const [pendingSource, setPendingSource] = useState<Partial<SetupAnswers> | undefined>(undefined);
  const [projectView, setProjectView] = useState<
    "flow" | "inspector" | "preview" | "run" | "review" | "verify" | "history" | "manifest"
  >("flow");
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  // Auto-open the assistant when entering the Playground (modifying components is
  // the point there); it stays dismissible via the same top-bar toggle.
  useEffect(() => {
    if (projectView === "preview") setChatOpen(true);
  }, [projectView]);

  function mergeProject(project: Project): void {
    setProjects((prev) => [project, ...prev.filter((p) => p.path !== project.path)]);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Bound the startup probe so a hung `claude` (or any stuck IPC) can never
        // trap the splash — degrade to the environment screen instead. The
        // main-process checks are individually timed out too; this is the net.
        const [envReport, projectList] = await Promise.all([
          withTimeout(api.checkEnvironment(), 15000),
          withTimeout(api.listProjects(), 15000).catch(() => [] as Project[]),
        ]);
        if (cancelled) return;
        setReport(envReport);
        setProjects(projectList);
        // Go straight to the projects screen when the installable deps (Node,
        // git, Claude Code) are present. Login is NOT probed here (that would
        // spend the user's Claude usage on every launch) — it's verified on the
        // first real run, where an auth error surfaces as a fix-it card.
        setView(isCoreReady(envReport) ? "dashboard" : "env");
      } catch {
        if (cancelled) return;
        // Startup verification timed out or failed — show the environment screen
        // with a clear, actionable state rather than an endless splash.
        setReport(STARTUP_FAILED_REPORT);
        setView("env");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Startup splash while the background environment scan runs.
  if (loading || !report) return <Splash />;

  const coreReady = isCoreReady(report);

  return (
    <div className="flex min-h-screen flex-col bg-vs-bg-primary text-vs-text-primary">
      <TopBar
        view={view}
        coreReady={coreReady}
        chatAvailable={Boolean(activeProject)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        breadcrumb={
          sourceProject?.name ??
          setupProject?.name ??
          intakeProject?.name ??
          activeProject?.name ??
          null
        }
        onNavigate={(v) => {
          setView(v);
          if (v === "dashboard") {
            setActiveProject(null);
            setSetupProject(null);
            setSourceProject(null);
            setIntakeProject(null);
            setPendingSource(undefined);
            setProjectView("flow");
          }
        }}
      />
      <div className="flex min-h-0 flex-1">
      <main className="min-w-0 flex-1">
        {view === "env" ? (
          <EnvironmentCheck
            report={report}
            onReport={setReport}
            coreReady={coreReady}
            onContinue={() => setView("dashboard")}
          />
        ) : sourceProject ? (
          <DesignInput
            project={sourceProject}
            onBack={() => setSourceProject(null)}
            onContinue={(source) => {
              setPendingSource(source);
              setSetupProject(sourceProject);
              setSourceProject(null);
            }}
          />
        ) : setupProject ? (
          <NewProjectWizard
            project={setupProject}
            initialSource={pendingSource}
            onCancel={() => {
              setSetupProject(null);
              setPendingSource(undefined);
            }}
            onCreated={(project) => {
              mergeProject(project);
              setSetupProject(null);
              setPendingSource(undefined);
              setIntakeProject(project);
            }}
          />
        ) : intakeProject ? (
          <Intake
            project={intakeProject}
            onSkip={() => {
              setActiveProject(intakeProject);
              setIntakeProject(null);
            }}
            onDone={() => {
              setActiveProject(intakeProject);
              setIntakeProject(null);
            }}
          />
        ) : activeProject && projectView === "inspector" ? (
          <Inspector
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenRun={() => setProjectView("run")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "preview" ? (
          <DevPreview
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenRun={() => setProjectView("run")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "run" ? (
          <RunView
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "review" ? (
          <ArtifactReview
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenRun={() => setProjectView("run")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "verify" ? (
          <Verification
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenRun={() => setProjectView("run")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "history" ? (
          <History
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenRun={() => setProjectView("run")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : activeProject && projectView === "manifest" ? (
          <DesignManifest
            project={activeProject}
            onBack={() => setProjectView("flow")}
            onOpenRun={() => setProjectView("run")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenHistory={() => setProjectView("history")}
          />
        ) : activeProject ? (
          <GuidedFlow
            project={activeProject}
            onBack={() => setActiveProject(null)}
            onOpenInspector={() => setProjectView("inspector")}
            onOpenPreview={() => setProjectView("preview")}
            onOpenRun={() => setProjectView("run")}
            onOpenReview={() => setProjectView("review")}
            onOpenVerify={() => setProjectView("verify")}
            onOpenHistory={() => setProjectView("history")}
            onOpenManifest={() => setProjectView("manifest")}
          />
        ) : (
          <Dashboard
            projects={projects}
            onProjects={setProjects}
            onOpenProject={setActiveProject}
            onSetup={setSourceProject}
          />
        )}
      </main>
      {activeProject && (
        // Width-animated wrapper: the dock stays mounted (session persists across
        // open/close) while the wrapper animates 0↔360px, so flexbox smoothly
        // reflows <main> — pushing content left on open and back on close.
        <div
          className={`flex h-[calc(100vh-3rem)] shrink-0 justify-end overflow-hidden transition-[width] duration-200 ease-out ${
            chatOpen ? "w-[360px]" : "w-0"
          }`}
        >
          <AssistantDock
            key={activeProject.path}
            project={activeProject}
            allowModify={projectView === "preview"}
            seedContext={
              projectView === "preview"
                ? "Context: the user is viewing this project's components in Storybook (Playground). When they ask for a change, edit only the relevant component's source under the component directory, keep values token-referenced (no hardcoded hex/px), and match the surrounding code style. Storybook hot-reloads, so the change appears live. Do not touch unrelated components or the token file."
                : projectView === "manifest"
                  ? "Context: the user is on the Design Manifest screen (DESIGN.md). Help them refine or reason about the manifest."
                  : undefined
            }
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}
      </div>
    </div>
  );
}

/** Startup splash: logo + app name + an indeterminate progress bar while the
 *  environment scan runs in the background. The window stays draggable. */
function Splash(): React.JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-vs-bg-primary"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-3">
        <Logo size={72} />
        <span className="text-lg font-semibold tracking-[-0.01em] text-vs-text-primary">
          VortSpec
        </span>
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-vs-border-default">
        <div className="h-full w-1/3 rounded-full bg-vs-accent animate-[vsSlide_1.2s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

function TopBar({
  view,
  coreReady,
  onNavigate,
  breadcrumb,
  chatAvailable,
  chatOpen,
  onToggleChat,
}: {
  view: View;
  coreReady: boolean;
  onNavigate: (v: View) => void;
  breadcrumb?: string | null;
  chatAvailable: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
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
        <Logo size={20} />
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
        {chatAvailable && (
          <button
            onClick={onToggleChat}
            title="Assistant"
            aria-pressed={chatOpen}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
              chatOpen
                ? "border-vs-accent bg-vs-bg-elevated text-vs-text-primary"
                : "border-transparent text-vs-text-secondary hover:text-vs-text-primary"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M2 3.5 A1.5 1.5 0 0 1 3.5 2 H10.5 A1.5 1.5 0 0 1 12 3.5 V8.5 A1.5 1.5 0 0 1 10.5 10 H5.5 L3 12 V10 H3.5 A1.5 1.5 0 0 1 2 8.5 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            Chat
          </button>
        )}
        <span className="grid h-7 w-7 place-items-center rounded-full border border-vs-border-strong bg-vs-bg-elevated text-[11px] font-medium text-vs-text-secondary">
          You
        </span>
      </div>
    </header>
  );
}
