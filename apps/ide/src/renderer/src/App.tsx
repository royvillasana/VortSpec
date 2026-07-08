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
import { Terminal } from "@vortspec/ui/Terminal";
import { ActivityBar, type ActivityKey } from "./components/ActivityBar";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { Explorer } from "./components/Explorer";
import { EditorArea } from "./components/EditorArea";
import { Resizer, usePersistentNumber, clamp } from "./components/Resizer";
import { useWorkspaceFiles } from "./lib/useWorkspaceFiles";
import { IdeContext, buildSeedContext } from "./lib/ide-context";

/**
 * VortSpec IDE shell — a VS Code–style workbench.
 *
 * Regions: the Activity bar (far left), a persistent primary sidebar (Explorer),
 * the center editor/panel area with a bottom terminal panel, and a secondary
 * sidebar (the assistant). Each sidebar and the terminal panel is collapsible
 * and drag-resizable (sizes persist). The activity bar switches the center
 * between the code editor and the reused @vortspec/ui panels; open editor tabs
 * survive the switch because their state lives in `useWorkspaceFiles` above both.
 * No engine logic here — every panel is driven by the same core IPC as the cockpit.
 */
export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ActivityKey>("explorer");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Persisted, drag-resizable region sizes (VS Code muscle memory).
  const [sidebarWidth, setSidebarWidth] = usePersistentNumber("vs.ide.sidebarWidth", 248);
  const [chatWidth, setChatWidth] = usePersistentNumber("vs.ide.chatWidth", 380);
  const [termHeight, setTermHeight] = usePersistentNumber("vs.ide.termHeight", 240);

  // Open-file/tab state, lifted so the Explorer (sidebar) and editor (center)
  // are independent regions sharing it. No-ops until a workspace is open.
  const wf = useWorkspaceFiles(workspace?.path ?? null);

  useEffect(() => {
    void api
      .getProfile()
      .then((p) => setUserName(p.name || undefined))
      .catch(() => undefined);
  }, []);

  // Ctrl-` toggles the integrated terminal (VS Code muscle memory).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTerminalOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!workspace) {
    // The full VS Code chrome from the start — activity bar, a left (primary)
    // sidebar, and a right (secondary) sidebar — empty until a folder is open.
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          VortSpec IDE
        </header>
        <div className="flex min-h-0 flex-1">
          <ActivityBar active={activity} onSelect={setActivity} chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)} />
          <aside className="flex w-60 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">Explorer</div>
            <p className="px-3 text-[12px] leading-relaxed text-vs-text-muted">
              No folder open. Open or clone a workspace to see its files here.
            </p>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <WorkspacePicker
              onOpen={(project) => {
                setWorkspace(project);
                setActivity("explorer");
              }}
            />
          </div>
          {chatOpen && (
            <aside className="flex w-[380px] shrink-0 flex-col border-l border-vs-border-default bg-vs-bg-surface">
              <div className="border-b border-vs-border-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">Assistant</div>
              <p className="px-3 py-2 text-[12px] leading-relaxed text-vs-text-muted">
                Open a workspace to vibe-engineer against your code and a live preview.
              </p>
            </aside>
          )}
        </div>
        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <span>No folder open</span>
        </footer>
      </div>
    );
  }

  // Reused cockpit panels expect navigation callbacks; map them onto the IDE's
  // activity switcher so their internal rail stays consistent with ours.
  const goExplorer = (): void => setActivity("explorer");
  const goPipeline = (): void => setActivity("pipeline");
  const goTokens = (): void => setActivity("tokens");
  const goManifest = (): void => setActivity("manifest");
  const goSource = (): void => setActivity("source");

  // Opening a file from the Explorer brings the editor to the front.
  const openFromExplorer = (path: string): void => {
    void wf.openFile(path);
    setActivity("explorer");
  };

  return (
    <IdeContext.Provider
      value={{ activeFile: wf.activePath, previewUrl, setActiveFile: () => {}, setPreviewUrl }}
    >
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-vs-bg-primary text-vs-text-primary">
        {/* Draggable title bar (hiddenInset) */}
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          {workspace.name} — VortSpec IDE
        </header>

        <div className="flex min-h-0 flex-1">
          <ActivityBar
            active={activity}
            onSelect={(k) => {
              setActivity(k);
              if (k === "explorer") setExplorerOpen(true);
            }}
            chatOpen={chatOpen}
            onToggleChat={() => setChatOpen((v) => !v)}
          />

          {/* LEFT primary sidebar — the persistent Explorer (collapsible + resizable) */}
          {explorerOpen && (
            <>
              <aside
                style={{ width: sidebarWidth }}
                className="flex shrink-0 flex-col overflow-auto border-r border-vs-border-default bg-vs-bg-surface"
              >
                <Explorer project={workspace} activePath={wf.activePath} onOpen={openFromExplorer} />
              </aside>
              <Resizer
                orientation="vertical"
                ariaLabel="Resize sidebar"
                onDelta={(d) => setSidebarWidth((w) => clamp(w + d, 180, 640))}
              />
            </>
          )}

          {/* CENTER — the activity's main view + a bottom terminal panel */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <main className="flex min-h-0 flex-1 overflow-hidden">
              {activity === "explorer" && <EditorArea project={workspace} wf={wf} />}
              {activity === "pipeline" && (
                <div className="min-w-0 flex-1 overflow-auto">
                  <PipelinePanel project={workspace} onOpenManifest={goManifest} onOpenTokens={goTokens} />
                </div>
              )}
              {activity === "source" && (
                <div className="min-w-0 flex-1 overflow-auto">
                  <SourceControl
                    project={workspace}
                    onBack={goExplorer}
                    onFlow={goPipeline}
                    onRun={goExplorer}
                    onPlayground={goExplorer}
                    onTokens={goTokens}
                    onManifest={goManifest}
                    onHistory={goExplorer}
                  />
                </div>
              )}
              {activity === "tokens" && (
                <div className="min-w-0 flex-1 overflow-auto">
                  <Inspector
                    project={workspace}
                    onBack={goExplorer}
                    onOpenPreview={goExplorer}
                    onOpenRun={goExplorer}
                    onOpenHistory={goExplorer}
                    onOpenManifest={goManifest}
                  />
                </div>
              )}
              {activity === "tasks" && (
                <div className="min-w-0 flex-1 overflow-auto">
                  <Tasks
                    project={workspace}
                    onBack={goExplorer}
                    onFlow={goPipeline}
                    onRun={goExplorer}
                    onPlayground={goExplorer}
                    onTokens={goTokens}
                    onManifest={goManifest}
                    onHistory={goExplorer}
                    onSource={goSource}
                  />
                </div>
              )}
              {activity === "manifest" && (
                <div className="min-w-0 flex-1 overflow-auto">
                  <DesignManifest
                    project={workspace}
                    onBack={goExplorer}
                    onOpenRun={goExplorer}
                    onOpenPreview={goExplorer}
                    onOpenInspector={goTokens}
                    onOpenHistory={goExplorer}
                  />
                </div>
              )}
            </main>

            {terminalOpen && (
              <>
                <Resizer
                  orientation="horizontal"
                  ariaLabel="Resize terminal"
                  onDelta={(d) => setTermHeight((h) => clamp(h - d, 120, 600))}
                />
                <section
                  style={{ height: termHeight }}
                  className="flex shrink-0 flex-col border-t border-vs-border-default bg-vs-bg-code"
                >
                  <div className="flex items-center justify-between px-3 py-1 text-[11px] text-vs-text-muted">
                    <span className="font-semibold uppercase tracking-wide">Terminal</span>
                    <button
                      type="button"
                      aria-label="Close terminal"
                      onClick={() => setTerminalOpen(false)}
                      className="hover:text-vs-text-secondary"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <Terminal project={workspace} />
                  </div>
                </section>
              </>
            )}
          </div>

          {/* RIGHT secondary sidebar — the assistant (collapsible + resizable) */}
          {chatOpen && (
            <>
              <Resizer
                orientation="vertical"
                ariaLabel="Resize assistant"
                onDelta={(d) => setChatWidth((w) => clamp(w - d, 300, 720))}
              />
              <div
                style={{ width: chatWidth }}
                className="flex shrink-0 flex-col border-l border-vs-border-default"
              >
                {/* Context chip: what the assistant is grounded in (transparency). */}
                <div
                  data-testid="assistant-context"
                  className="flex flex-none flex-wrap items-center gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-3 py-1.5 text-[11px] text-vs-text-muted"
                >
                  <span className="uppercase tracking-wide">Context</span>
                  {wf.activePath ? (
                    <span className="rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-vs-text-secondary">
                      {wf.activePath}
                    </span>
                  ) : (
                    <span>no file open</span>
                  )}
                  {previewUrl && (
                    <span className="rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-vs-text-secondary">
                      {previewUrl.replace(/^https?:\/\//, "")}
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <AssistantDock
                    project={workspace}
                    allowModify
                    userName={userName}
                    seedContext={buildSeedContext(wf.activePath, previewUrl)}
                    onClose={() => setChatOpen(false)}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Status bar */}
        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-vs-border-default bg-vs-bg-surface px-3 text-[11px] text-vs-text-muted">
          <button
            type="button"
            onClick={() => setWorkspace(null)}
            className="hover:text-vs-text-secondary"
            title="Switch workspace"
          >
            {workspace.name}
          </button>
          <span className="text-vs-text-muted/60">·</span>
          <button
            type="button"
            aria-pressed={explorerOpen}
            onClick={() => setExplorerOpen((v) => !v)}
            className={`rounded px-2 py-0.5 ${explorerOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            title="Toggle sidebar"
          >
            Sidebar
          </button>
          <span className="capitalize">{activity}</span>
          <button
            type="button"
            aria-pressed={terminalOpen}
            onClick={() => setTerminalOpen((v) => !v)}
            className={`ml-auto rounded px-2 py-0.5 ${terminalOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            title="Toggle terminal (Ctrl+`)"
          >
            Terminal
          </button>
          <button
            type="button"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((v) => !v)}
            className={`rounded px-2 py-0.5 ${chatOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            title="Toggle assistant"
          >
            Assistant
          </button>
        </footer>
      </div>
    </IdeContext.Provider>
  );
}
