import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project } from "@vortspec/core/ipc";
import type { IdeState } from "@vortspec/core/ide-mcp";
import { api } from "@vortspec/ui/api";
import { AssistantDock, type PendingSelectionRef } from "@vortspec/ui/AssistantDock";
import { ConversationTabs } from "@vortspec/ui/ConversationTabs";
import { SourceControl } from "@vortspec/ui/SourceControl";
import { Inspector } from "@vortspec/ui/Inspector";
import { PipelinePanel } from "@vortspec/ui/PipelinePanel";
import { Tasks } from "@vortspec/ui/Tasks";
import { DesignManifest } from "@vortspec/ui/DesignManifest";
import { RunApp } from "@vortspec/ui/RunApp";
import { Profile } from "@vortspec/ui/Profile";
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
  // The current git branch, shown in the status bar beside the project name.
  const [branch, setBranch] = useState<string | null>(null);
  // The live editor selection, surfaced to the assistant as grounding context.
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  // "Open in Chat" — the selection the user pushed to the assistant (nonce re-adds).
  const [pendingRef, setPendingRef] = useState<PendingSelectionRef | undefined>(undefined);
  const refNonce = useRef(0);
  // Which welcome view is showing when no workspace is open.
  const [welcomeView, setWelcomeView] = useState<"start" | "settings">("start");
  const [winW, setWinW] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const wf = useWorkspaceFiles(workspace?.path ?? null);

  // Clear the selection when the active file changes (a fresh file has no
  // carried-over highlight); the editor re-reports as the user selects.
  useEffect(() => {
    setSelection(null);
  }, [wf.activePath]);

  // Current git branch for the status bar. Re-read on activity change so a
  // checkout in the Source Control view is reflected on return.
  useEffect(() => {
    if (!workspace) {
      setBranch(null);
      return;
    }
    let alive = true;
    void api
      .gitStatus(workspace.path)
      .then((s) => alive && setBranch(s.isRepo && s.branch ? s.branch : null))
      .catch(() => alive && setBranch(null));
    return () => {
      alive = false;
    };
  }, [workspace?.path, layout.activity]);

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
  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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

  const go = (activity: Activity) => (): void => dispatch({ type: "setActivity", activity });

  if (!workspace) {
    // A synthetic "Home" project gives the welcome-screen assistant a cwd so the
    // user can chat with the AI before opening a project (ask it to set up, clone,
    // scaffold, etc. — it runs in your home directory).
    const homeProject: Project | null = homeDir
      ? {
          id: "home",
          name: "Home",
          path: homeDir,
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
          VortSpec IDE
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
              <WorkspacePicker onOpen={(p) => setWorkspace(p)} />
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
        <PipelinePanel project={p} onOpenManifest={go("manifest")} onOpenTokens={go("tokens")} />
      ) : a === "run" ? (
        <RunApp project={p} kind="app" hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "play" ? (
        <RunApp project={p} kind="storybook" hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "tokens" ? (
        <Inspector project={p} hideRail onBack={go("explorer")} onOpenPreview={go("explorer")} onOpenRun={go("run")} onOpenHistory={go("explorer")} onOpenManifest={go("manifest")} />
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
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          {workspace.name} — VortSpec IDE
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar active={layout.activity} onSelect={(a) => dispatch({ type: "setActivity", activity: a })} chatOpen={layout.secondaryOpen} onToggleChat={() => dispatch({ type: "toggleSecondary" })} />

          {showPrimary && (
            <>
              <aside style={{ width: eff.primary }} className="flex shrink-0 flex-col overflow-auto border-r border-vs-border-default bg-vs-bg-surface transition-[width] duration-150 ease-out">
                <Explorer project={workspace} activePath={wf.activePath} onOpen={openFromExplorer} onCollapse={() => dispatch({ type: "togglePrimary" })} />
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
            <span className="flex items-center gap-1 text-vs-text-muted" title={`Git branch: ${branch}`}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="4" cy="3.5" r="1.5" />
                <circle cx="4" cy="12.5" r="1.5" />
                <circle cx="12" cy="4.5" r="1.5" />
                <path d="M4 5v6M12 6a4 4 0 0 1-4 4H6.5" />
              </svg>
              <span className="font-mono">{branch}</span>
            </span>
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
    </IdeContext.Provider>
  );
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
