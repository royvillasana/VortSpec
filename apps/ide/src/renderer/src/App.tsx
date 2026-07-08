import { useEffect, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { AssistantDock } from "@vortspec/ui/AssistantDock";
import { SourceControl } from "@vortspec/ui/SourceControl";
import { Inspector } from "@vortspec/ui/Inspector";
import { Tasks } from "@vortspec/ui/Tasks";
import { DesignManifest } from "@vortspec/ui/DesignManifest";
import { Terminal } from "@vortspec/ui/Terminal";
import { ActivityBar, type ActivityKey } from "./components/ActivityBar";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { CodeWorkspace } from "./components/CodeWorkspace";

/**
 * VortSpec IDE shell.
 *
 * A VS Code–style four-region layout — Activity bar (far left), the working
 * area (Explorer + editor + preview for the "code" activity, or a reused
 * @vortspec/ui panel for the others), and the assistant chat on the right. It
 * holds no engine logic: every panel is driven by the same core IPC handlers as
 * the cockpit. The Monaco editor (I2), terminal (I3), and live preview (I4) fill
 * in the code activity's placeholders.
 */
export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ActivityKey>("explorer");
  const [chatOpen, setChatOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);

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
    return (
      <div className="h-screen w-screen overflow-hidden">
        <WorkspacePicker
          onOpen={(project) => {
            setWorkspace(project);
            setActivity("explorer");
          }}
        />
      </div>
    );
  }

  // Reused cockpit panels expect navigation callbacks; map them onto the IDE's
  // activity switcher so their internal rail stays consistent with ours.
  const goExplorer = (): void => setActivity("explorer");
  const goTokens = (): void => setActivity("tokens");
  const goManifest = (): void => setActivity("manifest");
  const goSource = (): void => setActivity("source");

  return (
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
          onSelect={setActivity}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((v) => !v)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex min-h-0 flex-1 overflow-hidden">
          {activity === "explorer" && <CodeWorkspace project={workspace} />}
          {activity === "source" && (
            <div className="min-w-0 flex-1 overflow-auto">
              <SourceControl
                project={workspace}
                onBack={goExplorer}
                onFlow={goExplorer}
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
                onFlow={goExplorer}
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
            <section className="flex h-60 shrink-0 flex-col border-t border-vs-border-default bg-vs-bg-code">
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
          )}
        </div>

        {chatOpen && (
          <div className="flex w-[380px] shrink-0 flex-col border-l border-vs-border-default">
            <AssistantDock
              project={workspace}
              allowModify
              userName={userName}
              seedContext="Working in the VortSpec IDE."
              onClose={() => setChatOpen(false)}
            />
          </div>
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
      </footer>
    </div>
  );
}
