import { useEffect, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { AssistantDock } from "@vortspec/ui/AssistantDock";
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
import { IdeContext, buildSeedContext } from "./lib/ide-context";

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
  const [winW, setWinW] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const wf = useWorkspaceFiles(workspace?.path ?? null);

  useEffect(() => {
    void api.getProfile().then((p) => setUserName(p.name || undefined)).catch(() => undefined);
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
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          VortSpec IDE
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar active="explorer" onSelect={() => {}} chatOpen={layout.secondaryOpen} onToggleChat={() => dispatch({ type: "toggleSecondary" })} />
          <aside className="flex w-60 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">Explorer</div>
            <p className="px-3 text-[12px] leading-relaxed text-vs-text-muted">No folder open. Open or clone a workspace to see its files here.</p>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <WorkspacePicker onOpen={(p) => setWorkspace(p)} />
          </div>
        </div>
        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <span>No folder open</span>
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
          <EditorArea project={workspace!} wf={wf} relayoutKey={relayoutKey} />
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
                </div>
                <div className="min-h-0 flex-1">
                  <AssistantDock project={workspace} fill allowModify userName={userName} seedContext={buildSeedContext(wf.activePath, previewUrl)} onClose={() => dispatch({ type: "toggleSecondary" })} />
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <button type="button" onClick={() => setWorkspace(null)} className="hover:text-vs-text-secondary" title="Switch workspace">
            {workspace.name}
          </button>
          <span className="text-vs-text-muted/60">·</span>
          <button type="button" aria-pressed={showPrimary} onClick={() => dispatch({ type: "togglePrimary" })} className={`rounded px-2 py-0.5 ${showPrimary ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`} title="Toggle sidebar">
            Sidebar
          </button>
          <button type="button" aria-pressed={layout.editorOpen} onClick={() => dispatch({ type: "toggleEditor" })} className={`rounded px-2 py-0.5 ${layout.editorOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`} title="Toggle editor">
            Editor
          </button>
          <span className="capitalize">{layout.activity}</span>
          <button type="button" aria-pressed={layout.panelOpen} onClick={() => dispatch({ type: "togglePanel" })} className={`ml-auto rounded px-2 py-0.5 ${layout.panelOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`} title="Toggle terminal panel (Ctrl+`)">
            Terminal
          </button>
          <button type="button" aria-pressed={layout.secondaryOpen} onClick={() => dispatch({ type: "toggleSecondary" })} className={`rounded px-2 py-0.5 ${layout.secondaryOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`} title="Toggle assistant">
            Assistant
          </button>
        </footer>
      </div>
    </IdeContext.Provider>
  );
}
