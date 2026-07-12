import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project } from "@vortspec/core/ipc";
import type { IdeState } from "@vortspec/core/ide-mcp";
import { api } from "@vortspec/ui/api";
import { AssistantDock, type PendingSelectionRef } from "@vortspec/ui/AssistantDock";
import { ConversationTabs, type IncomingTask } from "@vortspec/ui/ConversationTabs";
import { AssistantTaskProvider, type AssistantTask } from "@vortspec/ui/assistant-task";
import { SourceControl } from "@vortspec/ui/SourceControl";
import { Inspector } from "@vortspec/ui/Inspector";
import { GuidedFlow } from "@vortspec/ui/GuidedFlow";
import { Tasks } from "@vortspec/ui/Tasks";
import { DesignManifest } from "@vortspec/ui/DesignManifest";
import { RunApp } from "@vortspec/ui/RunApp";
import { Profile } from "@vortspec/ui/Profile";
import { ProjectSetup } from "@vortspec/ui/ProjectSetup";
import { ActivityBar } from "./components/ActivityBar";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { Explorer } from "./components/Explorer";
import { EditorArea } from "./components/EditorArea";
import { PanelGroup } from "./components/PanelGroup";
import { Resizer } from "./components/Resizer";
import { useWorkspaceFiles } from "./lib/useWorkspaceFiles";
import { useLayout } from "./lib/useLayout";
import { effectiveWidths, isSidebarView, type Activity } from "./lib/layout";
import { IdeContext, buildSeedContext, buildLiveContext, type EditorSelection } from "./lib/ide-context";
import { useIdeMcp, IDE_MCP_TOOL_GROUP } from "./lib/useIdeMcp";
import { IdeActionDialog } from "./components/IdeActionDialog";
import { StatusBranch } from "./components/StatusBranch";

/**
 * VortSpec IDE — a VS Code–style workbench driven by a layout store.
 * Regions: activity bar · primary sidebar (Explorer) · center (editor group +
 * preview bar + a dockable Terminal panel, or a full work panel) · secondary
 * sidebar (assistant). Everything else (Source Control, Settings, and the SDD-DE
 * panels) reuses the chromeless `@vortspec/ui` panels — one navigation, the
 * activity bar. No engine logic here.
 */
export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<Project | null>(null);
  const [layout, dispatch] = useLayout();
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [previewUrl] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  // A dedicated, scoped folder (~/VortSpec) the pre-project assistant runs in —
  // NOT the bare home dir, so Claude Code doesn't wander into ~/Music, ~/Documents,
  // etc. and make macOS prompt for those protected areas.
  const [assistantHome, setAssistantHome] = useState<string | null>(null);
  // The current git branch, shown in the status bar beside the project name.
  const [branch, setBranch] = useState<string | null>(null);
  const [gitCounts, setGitCounts] = useState<{ changes: number; ahead: number }>({ changes: 0, ahead: 0 });
  // The live editor selection, surfaced to the assistant as grounding context.
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  // "Open in Chat" — the selection the user pushed to the assistant (nonce re-adds).
  const [pendingRef, setPendingRef] = useState<PendingSelectionRef | undefined>(undefined);
  const refNonce = useRef(0);
  // A "Fix in Assistant" handoff: an error/fix-it surfaced anywhere in the IDE,
  // routed into the right-sidebar chat as its own auto-running conversation so
  // the user can leave the screen it came from while it works.
  const [assistantTask, setAssistantTask] = useState<IncomingTask | undefined>(undefined);
  const taskNonce = useRef(0);
  // Which welcome view is showing when no workspace is open.
  const [welcomeView, setWelcomeView] = useState<"start" | "settings">("start");
  // The destination folder for a new project being set up (Create New Project flow).
  const [newProject, setNewProject] = useState<Project | null>(null);
  // "Clone Repository" from the native File menu routes Home and auto-opens the
  // clone input in the WorkspacePicker (it owns the repo-URL quick-input).
  const [welcomeIntent, setWelcomeIntent] = useState<"clone" | null>(null);
  // Bumped by File → New to ask the Explorer to start a new-file input at root.
  const [newFileSignal, setNewFileSignal] = useState(0);
  const [winW, setWinW] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const wf = useWorkspaceFiles(workspace?.path ?? null);

  // Clear the selection when the active file changes (a fresh file has no
  // carried-over highlight); the editor re-reports as the user selects.
  useEffect(() => {
    setSelection(null);
  }, [wf.activePath]);

  // Current git branch + change/unpushed counts for the status bar. Re-read on
  // activity change (so a checkout/commit in Source Control is reflected on
  // return) and whenever files change on disk (autosave, agent runs).
  useEffect(() => {
    if (!workspace) {
      setBranch(null);
      setGitCounts({ changes: 0, ahead: 0 });
      return;
    }
    let alive = true;
    const refresh = (): void => {
      void api
        .gitStatus(workspace.path)
        .then((s) => {
          if (!alive) return;
          setBranch(s.isRepo && s.branch ? s.branch : null);
          setGitCounts(
            s.isRepo
              ? { changes: s.staged.length + s.unstaged.length + s.untracked.length, ahead: s.ahead }
              : { changes: 0, ahead: 0 },
          );
        })
        .catch(() => {
          if (alive) {
            setBranch(null);
            setGitCounts({ changes: 0, ahead: 0 });
          }
        });
    };
    refresh();
    const off = api.onWorkspaceChange((e) => {
      if (e.projectPath === workspace.path) refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [workspace?.path, layout.activity]);

  // Auto-start the SDD-DE pipeline: when a project is opened whose design-system
  // foundation isn't set up yet (no extracted tokens, no detected components),
  // land on the Flow/foundation instead of the Explorer. A founded project keeps
  // its default (Explorer). Runs once per opened project.
  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    void (async () => {
      let ready = false;
      try {
        const t = await api.inspectorTokens(workspace.path);
        ready = t.tokens.length > 0;
        if (!ready) {
          const c = await api.inspectorComponents(workspace.path);
          ready = c.components.length > 0;
        }
      } catch {
        ready = false;
      }
      if (alive && !ready) dispatch({ type: "setActivity", activity: "flow" });
    })();
    return () => {
      alive = false;
    };
    // Only re-evaluate when a different project is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.path]);

  // The editor state the assistant's IDE tools read (via the MCP bridge).
  const ideState = useMemo<IdeState>(
    () => ({
      workspaceRoot: workspace?.path ?? null,
      activeFile: wf.activePath,
      openEditors: wf.files.map((f) => f.path),
      selection,
    }),
    [workspace?.path, wf.activePath, wf.files, selection],
  );
  const ideMcp = useIdeMcp({
    state: ideState,
    onOpenFile: (path) => void wf.openFile(path),
    onOpenWorkspace: (p) => setWorkspace(p),
  });

  useEffect(() => {
    void api.getProfile().then((p) => setUserName(p.name || undefined)).catch(() => undefined);
    void api.homeDir().then(setHomeDir).catch(() => undefined);
  }, []);
  // Only when no project is open (welcome screen): ensure ~/VortSpec exists and
  // ground the pre-project assistant there instead of the bare home dir — best-
  // effort, created inside home so no traversal. Keeps Claude Code scoped and
  // avoids macOS prompting for ~/Music, ~/Documents, etc. Never runs with a
  // workspace open, so it doesn't touch the filesystem during normal editing.
  useEffect(() => {
    if (workspace || assistantHome || !homeDir) return;
    void api.createDir(homeDir, "VortSpec").finally(() => setAssistantHome(`${homeDir}/VortSpec`));
  }, [workspace, assistantHome, homeDir]);
  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Prevent Electron from navigating to a dropped OS file when it lands outside a
  // drop target (the composer/Explorer handle their own drops); only guard file drags.
  useEffect(() => {
    const guard = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);
  // Ctrl-` toggles the Terminal panel (opens the terminal tab).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        dispatch({ type: "togglePanel" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  // Native File/App menu commands (from the IDE preload). These drive the SAME
  // flows as the welcome screen and status bar, so the renderer stays the single
  // source of truth for what's open — the menu never mutates files itself.
  useEffect(() => {
    const bridge = window.vortspecMenu;
    if (!bridge) return;
    return bridge.onCommand(async ({ command, path }) => {
      switch (command) {
        case "openRecent": {
          if (!path) return;
          const fresh = await api.refreshProject(path).catch(() => null);
          if (fresh) setWorkspace(fresh);
          return;
        }
        case "openFolder": {
          const p = await api.pickFolder(false);
          if (p) setWorkspace(p);
          return;
        }
        case "createProject": {
          const dest = await api.createFolder();
          if (dest) {
            setWorkspace(null);
            setNewProject(dest);
          }
          return;
        }
        case "openWalkthrough": {
          const dest = await api.createFolder();
          if (!dest) return;
          const r = await api.openWalkthrough(dest.path);
          if (!r.ok) return;
          const fresh = await api.refreshProject(dest.path).catch(() => null);
          setWorkspace(fresh ?? dest);
          return;
        }
        case "cloneRepo": {
          setWorkspace(null);
          setWelcomeView("start");
          setWelcomeIntent("clone");
          return;
        }
        case "closeProject": {
          setWorkspace(null);
          return;
        }
        case "newFile": {
          dispatch({ type: "setActivity", activity: "explorer" });
          setNewFileSignal((n) => n + 1);
          return;
        }
        case "settings": {
          setWelcomeView("settings");
          dispatch({ type: "setActivity", activity: "settings" });
          return;
        }
      }
    });
  }, [dispatch]);

  const go = (activity: Activity) => (): void => dispatch({ type: "setActivity", activity });

  // Route an error/fix-it into the right-sidebar chat. Captures where the user
  // is now so the dock can point them back once the fix run finishes, and opens
  // the assistant if it's collapsed.
  const dispatchAssistantTask = useCallback(
    (task: AssistantTask): void => {
      const origin = layout.activity;
      if (!layout.secondaryOpen) dispatch({ type: "toggleSecondary" });
      setAssistantTask({
        title: task.title,
        prompt: task.prompt,
        allowModify: task.allowModify ?? true,
        origin: activityLabel(origin),
        returnTo: origin,
        nonce: ++taskNonce.current,
      });
    },
    [layout.activity, layout.secondaryOpen, dispatch],
  );

  if (!workspace) {
    // Create New Project — one unified setup + intake stepper (Setup · Product ·
    // Scope · Advanced). On finish it creates the project; the open-routing effect
    // then lands it on the Foundation.
    if (newProject) {
      return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
          <header
            className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
            style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
          >
            <span className="font-bold text-vs-text-secondary">VortSpec</span>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <ProjectSetup
              project={newProject}
              onCreated={(p) => {
                setNewProject(null);
                setWorkspace(p);
              }}
              onCancel={() => setNewProject(null)}
            />
          </div>
        </div>
      );
    }
    // A synthetic "Home" project gives the welcome-screen assistant a cwd so the
    // user can chat with the AI before opening a project (ask it to set up, clone,
    // scaffold, etc.). It runs in a dedicated ~/VortSpec folder — NOT the bare home
    // dir — so the assistant stays out of protected areas (Music/Documents/Desktop).
    const homeProject: Project | null = assistantHome
      ? {
          id: "home",
          name: "Home",
          path: assistantHome,
          toolkit: { present: false, version: null, updateAvailable: false },
          lastRunStatus: "none",
          addedAt: "",
        }
      : null;
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          <span className="font-bold text-vs-text-secondary">VortSpec</span>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar
            active={welcomeView === "settings" ? "settings" : "explorer"}
            onSelect={(a) => setWelcomeView(a === "settings" ? "settings" : "start")}
            chatOpen={layout.secondaryOpen}
            onToggleChat={() => dispatch({ type: "toggleSecondary" })}
          />
          {welcomeView === "start" && (
            <aside className="flex w-60 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">Explorer</div>
              <p className="px-3 text-[12px] leading-relaxed text-vs-text-muted">No folder open. Open or clone a workspace to see its files here.</p>
            </aside>
          )}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {welcomeView === "settings" ? (
              <div className="min-w-0 flex-1 overflow-auto">
                <Profile onBack={() => setWelcomeView("start")} onSaved={(p) => setUserName(p.name || undefined)} />
              </div>
            ) : (
              <WorkspacePicker
                onOpen={(p) => setWorkspace(p)}
                autoClone={welcomeIntent === "clone"}
                onCloneShown={() => setWelcomeIntent(null)}
                onCreateProject={() => {
                  void api.createFolder().then((dest) => {
                    if (dest) setNewProject(dest);
                  });
                }}
              />
            )}
          </div>
          {layout.secondaryOpen && (
            <div className="flex w-[380px] shrink-0 flex-col border-l border-vs-border-default">
              {homeProject ? (
                <AssistantDock
                  project={homeProject}
                  fill
                  showSession
                  allowModify
                  userName={userName}
                  onClose={() => dispatch({ type: "toggleSecondary" })}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-vs-text-muted">
                  Loading the assistant…
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <span>No folder open</span>
          <button
            type="button"
            aria-pressed={layout.secondaryOpen}
            onClick={() => dispatch({ type: "toggleSecondary" })}
            className={`ml-auto rounded px-2 py-0.5 ${layout.secondaryOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            title="Toggle assistant"
          >
            Assistant
          </button>
        </footer>
      </div>
    );
  }

  const eff = effectiveWidths(layout, winW);
  const showPrimary = isSidebarView(layout.activity) && layout.primaryOpen;
  const isExplorer = layout.activity === "explorer";
  // Forces an editor relayout whenever a region size/visibility changes.
  const relayoutKey =
    Math.round(eff.primary + eff.secondary + eff.panelSide) +
    (layout.editorOpen ? 1 : 0) * 7 +
    (layout.panelOpen ? layout.panelSize : 0);

  const openFromExplorer = (path: string): void => {
    void wf.openFile(path);
    // Opening a file must not touch the sidebar (activity is already Explorer);
    // just make sure the editor is on screen.
    if (!layout.editorOpen) dispatch({ type: "setEditorOpen", open: true });
  };

  const panelGroup = (
    <PanelGroup
      project={workspace}
      tabs={layout.panelTabs}
      selected={layout.panelSelected}
      dock={layout.panelDock}
      onSelect={(t) => dispatch({ type: "selectPanelTab", tab: t })}
      onClose={(t) => dispatch({ type: "closePanelTab", tab: t })}
      onToggleDock={() => dispatch({ type: "setPanelDock", dock: layout.panelDock === "bottom" ? "right" : "bottom" })}
      onClosePanel={() => dispatch({ type: "togglePanel" })}
    />
  );

  function centerForExplorer(): JSX.Element {
    if (!layout.editorOpen && !layout.panelOpen) {
      return (
        <div className="flex flex-1 items-center justify-center text-sm text-vs-text-muted">
          Editor and panel are closed. Reopen from the status bar.
        </div>
      );
    }
    if (!layout.editorOpen && layout.panelOpen) {
      return <div className="min-h-0 min-w-0 flex-1">{panelGroup}</div>;
    }
    // Editor open (+ optional panel docked bottom or right).
    const bottomPanel = layout.panelOpen && layout.panelDock === "bottom";
    const rightPanel = layout.panelOpen && layout.panelDock === "right";
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <EditorArea
            project={workspace!}
            wf={wf}
            relayoutKey={relayoutKey}
            onSelection={(s) =>
              setSelection(
                s && wf.activePath ? { path: wf.activePath, startLine: s.startLine, endLine: s.endLine, text: s.text } : null,
              )
            }
            onOpenInChat={(s) => {
              if (!wf.activePath) return;
              // Ensure the assistant is visible, then attach the selection.
              if (!layout.secondaryOpen) dispatch({ type: "toggleSecondary" });
              setPendingRef({
                path: wf.activePath,
                startLine: s.startLine,
                endLine: s.endLine,
                text: s.text,
                nonce: ++refNonce.current,
              });
            }}
          />
          {bottomPanel && (
            <>
              <Resizer orientation="horizontal" ariaLabel="Resize panel" onDelta={(d) => dispatch({ type: "nudgePanel", delta: -d })} />
              <div style={{ height: layout.panelSize }} className="min-h-0 flex-none">
                {panelGroup}
              </div>
            </>
          )}
        </div>
        {rightPanel && (
          <>
            <Resizer orientation="vertical" ariaLabel="Resize panel" onDelta={(d) => dispatch({ type: "nudgePanel", delta: -d })} />
            <div style={{ width: eff.panelSide }} className="min-w-0 flex-none">
              {panelGroup}
            </div>
          </>
        )}
      </div>
    );
  }

  function workPanel(): JSX.Element {
    const p = workspace!;
    const a = layout.activity;
    const inner =
      a === "source" ? (
        <SourceControl project={p} hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("explorer")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} />
      ) : a === "flow" ? (
        <GuidedFlow
          project={p}
          hideRail
          onBack={go("explorer")}
          onOpenInspector={go("tokens")}
          onOpenPreview={go("play")}
          onOpenRun={go("run")}
          onOpenVerify={go("run")}
          onOpenHistory={go("explorer")}
          onOpenManifest={go("manifest")}
          onOpenSource={go("source")}
          onOpenRunApp={go("run")}
          onOpenTasks={go("tasks")}
        />
      ) : a === "run" ? (
        <RunApp project={p} kind="app" hideRail canvas onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")}
          onSendToChat={(text, file) => {
            if (!layout.secondaryOpen) dispatch({ type: "toggleSecondary" });
            setPendingRef({ path: file ?? "Run canvas selection", startLine: 1, endLine: 1, text, nonce: ++refNonce.current });
          }}
        />
      ) : a === "play" ? (
        <RunApp project={p} kind="storybook" hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "tokens" ? (
        <Inspector project={p} hideRail onBack={go("explorer")} onOpenPreview={go("explorer")} onOpenRun={go("run")} onOpenHistory={go("explorer")} onOpenManifest={go("manifest")} onOpenFile={(path) => { void wf.openFile(path); dispatch({ type: "setActivity", activity: "explorer" }); }} />
      ) : a === "tasks" ? (
        <Tasks project={p} hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("explorer")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "manifest" ? (
        <DesignManifest project={p} hideRail onBack={go("explorer")} onOpenRun={go("run")} onOpenPreview={go("explorer")} onOpenInspector={go("tokens")} onOpenHistory={go("explorer")} />
      ) : a === "settings" ? (
        <Profile onBack={go("explorer")} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-vs-text-muted">This view isn’t available in the IDE yet.</div>
      );
    return <div className="min-w-0 flex-1 overflow-auto">{inner}</div>;
  }

  return (
    <IdeContext.Provider value={{ activeFile: wf.activePath, previewUrl, setActiveFile: () => {}, setPreviewUrl: () => {} }}>
     <AssistantTaskProvider value={dispatchAssistantTask}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          {workspace.name} — <span className="ml-1 font-bold text-vs-text-secondary">VortSpec</span>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar active={layout.activity} onSelect={(a) => (a === "home" ? setWorkspace(null) : dispatch({ type: "setActivity", activity: a }))} chatOpen={layout.secondaryOpen} onToggleChat={() => dispatch({ type: "toggleSecondary" })} />

          {showPrimary && (
            <>
              <aside style={{ width: eff.primary }} className="flex shrink-0 flex-col overflow-auto border-r border-vs-border-default bg-vs-bg-surface transition-[width] duration-150 ease-out">
                <Explorer project={workspace} activePath={wf.activePath} onOpen={openFromExplorer} onCollapse={() => dispatch({ type: "togglePrimary" })} openCount={wf.files.length} newFileSignal={newFileSignal} />
              </aside>
              <Resizer orientation="vertical" ariaLabel="Resize sidebar" onDelta={(d) => dispatch({ type: "nudgePrimary", delta: d })} />
            </>
          )}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Breadcrumb — close/change the project (back to Home), above the editor tabs. */}
            <nav
              aria-label="Breadcrumb"
              className="flex flex-none items-center gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-3 py-1 text-[11px] text-vs-text-muted"
            >
              <button
                type="button"
                onClick={() => setWorkspace(null)}
                title="Close project — back to Home"
                className="hover:text-vs-text-primary"
              >
                Home
              </button>
              <span className="text-vs-text-muted/50">/</span>
              <button
                type="button"
                onClick={() => setWorkspace(null)}
                title="Change project"
                className="max-w-[220px] truncate text-vs-text-secondary hover:text-vs-text-primary"
              >
                {workspace.name}
              </button>
              <span className="text-vs-text-muted/50">/</span>
              <span className="capitalize text-vs-text-secondary">{layout.activity}</span>
              {/* The active editor tab, appended when a file is open in the Explorer view. */}
              {isExplorer && wf.activePath && (
                <>
                  <span className="text-vs-text-muted/50">/</span>
                  <span className="truncate font-mono text-vs-text-secondary" title={wf.activePath}>
                    {wf.activePath.split("/").pop()}
                  </span>
                </>
              )}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              {isExplorer ? centerForExplorer() : workPanel()}
            </div>
          </div>

          {layout.secondaryOpen && (
            <>
              <Resizer orientation="vertical" ariaLabel="Resize assistant" onDelta={(d) => dispatch({ type: "nudgeSecondary", delta: -d })} />
              <div style={{ width: eff.secondary }} className="flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-vs-border-default transition-[width] duration-150 ease-out">
                <div data-testid="assistant-context" className="flex flex-none flex-wrap items-center gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-3 py-1.5 text-[11px] text-vs-text-muted">
                  <span className="uppercase tracking-wide">Context</span>
                  {wf.activePath ? (
                    <span className="truncate rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-vs-text-secondary">{wf.activePath}</span>
                  ) : (
                    <span>no file open</span>
                  )}
                  {selection && (
                    <span
                      title="Selected lines are sent to the assistant as context"
                      className="rounded bg-vs-accent-subtle px-1.5 py-0.5 font-mono text-vs-accent"
                    >
                      ⧉ {selection.startLine === selection.endLine
                        ? `line ${selection.startLine}`
                        : `${selection.endLine - selection.startLine + 1} lines`}
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <ConversationTabs
                    project={workspace}
                    showSession
                    allowModify
                    userName={userName}
                    seedContext={buildSeedContext(previewUrl)}
                    liveContext={buildLiveContext(wf.activePath, selection)}
                    mcpConfigPath={ideMcp.configPath}
                    extraAllowedTools={ideMcp.configPath ? [IDE_MCP_TOOL_GROUP] : undefined}
                    pendingRef={pendingRef}
                    incomingTask={assistantTask}
                    onReturnToOrigin={(returnTo) =>
                      dispatch({ type: "setActivity", activity: returnTo as Activity })
                    }
                    onClose={() => dispatch({ type: "toggleSecondary" })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <button type="button" onClick={() => setWorkspace(null)} className="hover:text-vs-text-secondary" title="Switch workspace">
            {workspace.name}
          </button>
          {branch && (
            <StatusBranch
              project={workspace}
              branch={branch}
              onCheckout={(name) => setBranch(name)}
              onCreate={() => dispatch({ type: "setActivity", activity: "source" })}
            />
          )}
          {(gitCounts.changes > 0 || gitCounts.ahead > 0) && (
            <button
              type="button"
              onClick={() => dispatch({ type: "setActivity", activity: "source" })}
              className="flex items-center gap-1.5 rounded px-1.5 text-vs-text-secondary hover:text-vs-text-primary"
              title="You have local changes that aren't on GitHub/GitLab yet — open Source Control to commit and push."
            >
              {gitCounts.changes > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-warning" />
                  {gitCounts.changes} change{gitCounts.changes === 1 ? "" : "s"}
                </span>
              )}
              {gitCounts.ahead > 0 && <span title="commits not yet pushed">↑{gitCounts.ahead} unpushed</span>}
              <span className="text-vs-text-muted">— Commit &amp; push</span>
            </button>
          )}
          <div className="flex-1" />
          {/* Region toggles apply to the Explorer/editor view only. */}
          {isExplorer && (
            <div className="flex items-center gap-1">
              <FooterToggle label="Explorer" active={showPrimary} title="Toggle the Explorer sidebar" onClick={() => dispatch({ type: "togglePrimary" })} />
              <FooterToggle label="Editor" active={layout.editorOpen} title="Toggle the editor" onClick={() => dispatch({ type: "toggleEditor" })} />
              <FooterToggle label="Terminal" active={layout.panelOpen} title="Toggle the terminal panel (Ctrl+`)" onClick={() => dispatch({ type: "togglePanel" })} />
              <FooterToggle label="Assistant" active={layout.secondaryOpen} title="Toggle the assistant" onClick={() => dispatch({ type: "toggleSecondary" })} />
            </div>
          )}
        </footer>
      </div>
      {ideMcp.pending && (
        <IdeActionDialog pending={ideMcp.pending} onConfirm={ideMcp.confirm} onCancel={ideMcp.cancel} />
      )}
     </AssistantTaskProvider>
    </IdeContext.Provider>
  );
}

/** Friendly name for the screen a fix-it was dispatched from (the resume banner). */
function activityLabel(a: Activity): string {
  const LABELS: Partial<Record<Activity, string>> = {
    explorer: "the Explorer",
    source: "Source Control",
    settings: "Settings",
    flow: "the Foundation",
    run: "the Run view",
    play: "the Playground",
    tokens: "the Tokens inspector",
    tasks: "Tasks",
    manifest: "the Manifest",
    history: "History",
  };
  return LABELS[a] ?? a;
}

/** A status-bar region toggle: highlighted when its region is visible. */
function FooterToggle({
  label,
  active,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  title: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-0.5 transition-colors ${
        active
          ? "bg-vs-bg-elevated text-vs-text-primary"
          : "text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}
