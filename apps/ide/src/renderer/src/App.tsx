import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project, Profile as ProfileT, UpdateInfo } from "@vortspec/core/ipc";
import type { IdeState } from "@vortspec/core/ide-mcp";
import { api } from "@vortspec/ui/api";
import { AppUpdateBanner } from "@vortspec/ui/AppUpdateBanner";
import { shouldPromptForUpdate } from "@vortspec/ui/app-update";
import { Logo } from "@vortspec/ui/Logo";
import type { PendingSelectionRef } from "@vortspec/ui/AssistantDock";
import { ConversationTabs, type IncomingTask } from "@vortspec/ui/ConversationTabs";
import { AssistantTaskProvider, type AssistantTask } from "@vortspec/ui/assistant-task";
import { CanvasSelectionProvider } from "@vortspec/ui/canvas-selection";
import { SourceControl } from "@vortspec/ui/SourceControl";
import { Inspector } from "@vortspec/ui/Inspector";
import { GuidedFlow } from "@vortspec/ui/GuidedFlow";
import { Tasks } from "@vortspec/ui/Tasks";
import { DesignManifest } from "@vortspec/ui/DesignManifest";
import { DesignSystem } from "@vortspec/ui/DesignSystem";
import { LibraryPanel } from "@vortspec/ui/LibraryPanel";
import { RunApp } from "@vortspec/ui/RunApp";
import { Profile } from "@vortspec/ui/Profile";
import { ProjectSetup } from "@vortspec/ui/ProjectSetup";
import { HeaderSlotContext } from "@vortspec/ui/ViewHeader";
import { ToolkitUpdateBanner } from "@vortspec/ui/ToolkitUpdateBanner";
import { LeftDock } from "./components/LeftDock";
import { createPortal } from "react-dom";
import { ActivityBar } from "./components/ActivityBar";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { Explorer } from "./components/Explorer";
import { EditorArea } from "./components/EditorArea";
import { PanelGroup } from "./components/PanelGroup";
import { Resizer } from "./components/Resizer";
import { useWorkspaceFiles } from "./lib/useWorkspaceFiles";
import { useLayout } from "./lib/useLayout";
import { effectiveWidths, FLOAT_PANEL, CHROME_BG, type Activity } from "./lib/layout";
import { IdeContext, buildSeedContext, buildLiveContext, type EditorSelection } from "./lib/ide-context";
import { useIdeMcp, IDE_MCP_TOOL_GROUP } from "./lib/useIdeMcp";
import { useAutoComponentBuild } from "@vortspec/ui/useAutoComponentBuild";
import { useAutoFoundation } from "@vortspec/ui/useAutoFoundation";
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
  // The global profile — name seeds the assistant, name + avatar drive the top-bar photo.
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const userName = profile?.name?.trim() || undefined;
  const [previewUrl] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  // A dedicated, scoped folder (~/VortSpec) the pre-project assistant runs in —
  // NOT the bare home dir, so Claude Code doesn't wander into ~/Music, ~/Documents,
  // etc. and make macOS prompt for those protected areas.
  // The current git branch, shown in the status bar beside the project name.
  const [branch, setBranch] = useState<string | null>(null);
  // The assistant chat is running — drives the Playground's "AI is working" page skeleton.
  const [dockBusy, setDockBusy] = useState(false);
  // The unified left dock's Section-tab slot — a STABLE div created once, so views can
  // portal their sidebar into it without a null gap or churn (the dock just mounts it and
  // toggles its container's visibility). The current view portals into this element.
  const [sectionSlot] = useState<HTMLDivElement>(() => {
    const el = document.createElement("div");
    el.className = "flex min-h-0 flex-1 flex-col overflow-auto";
    return el;
  });
  // The header region: the active section view's header portals here (via HeaderSlotContext),
  // so every section's header renders ABOVE the main container in one consistent band, instead
  // of inside each view's panel. A stable detached div mounted into the layout below.
  const [headerSlot] = useState<HTMLDivElement>(() => {
    const el = document.createElement("div");
    el.className = "flex-none";
    return el;
  });
  const [leftTab, setLeftTab] = useState<"section" | "chat">("section");
  // Tokens workspace sub-tab (light-design-system): the data inspector vs. the visual palette. Default to
  // the palette; the Tokens (data) tab only appears once the project actually has tokens.
  const [tokensTab, setTokensTab] = useState<"tokens" | "designsystem">("designsystem");
  const [hasTokens, setHasTokens] = useState(false);
  // Bumped by the design-system editor after each committed edit, so the palette in the main panel
  // re-reads and shows the new theme (change: design-system-style-panel).
  const [leverEdits, setLeverEdits] = useState(0);
  // The project's design source — drives consume-source affordances (e.g. hide Storybook for a
  // `library` source, whose components are consumed, not built into a VortSpec Storybook).
  const [designSource, setDesignSource] = useState<string | null>(null);
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
  // A newer release, if the launch check found one, plus the version the user
  // already waved away. Both null until the check settles.
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  // Bumped by File → New to ask the Explorer to start a new-file input at root.
  const [newFileSignal, setNewFileSignal] = useState(0);
  const [saveSignal, setSaveSignal] = useState(0);
  const [winW, setWinW] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const wf = useWorkspaceFiles(workspace?.path ?? null);

  // Automatic background component build (light-pages-on-canvas §9): while the user works on screens,
  // build the design-system components (5 at a time, build + verify, in the configured framework) in the
  // background, and notify on completion.
  const autoBuild = useAutoComponentBuild(workspace);
  // Extract the design-system foundation (tokens + component detection) in the background when a fresh
  // project is opened, so the Design System page (in the Design-tokens section) populates itself — the
  // user lands there straight from intake instead of having to visit the SDD-DE pipeline first.
  const autoFoundation = useAutoFoundation(workspace);
  const [buildNotice, setBuildNotice] = useState<string | null>(null);
  // The background-build indicator is dismissable — once the user hides it, keep it hidden for the rest
  // of this build session; a fresh completion notice re-shows it (reset below).
  const [buildIndicatorDismissed, setBuildIndicatorDismissed] = useState(false);
  // Check for a newer release once on launch. Fire-and-forget by design: nothing
  // awaits it and nothing renders behind it, so an update notice can never cost
  // startup time — the banner just appears late if there is one. `force: false`
  // honours the throttle; the Settings button is the one that goes live.
  //
  // Deliberately unconditional. There is no setting or flag to suppress this: a
  // notice is only worth building if it reaches everyone, and the alternative is
  // users silently stranded on old builds. See design D6.
  useEffect(() => {
    void api.checkUpdate({ force: false }).then(setUpdate);
    void api.getUpdateDismissal().then((d) => setDismissedUpdate(d.dismissedVersion));
  }, []);

  useEffect(() => {
    if (autoBuild.justFinished === 0) return;
    setBuildIndicatorDismissed(false); // the "✓ ready" notice shows even if the spinner was dismissed
    setBuildNotice("Design-system components are built and verified — ready for Generate code.");
    const t = window.setTimeout(() => setBuildNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [autoBuild.justFinished]);

  // Once the design system foundation is set up (ANY intake — Figma, library, enterprise, …), write the
  // design manifest (designer.md) so pages/screens can be composed in the Playground, and tell the user
  // it's ready. This is the file the light-first page authoring reads, so it must exist before they create.
  useEffect(() => {
    if (autoFoundation.justFinished === 0 || !workspace) return;
    let alive = true;
    let timer: number | undefined;
    void api
      .writeDesignerManifest(workspace.path)
      .catch(() => null)
      .then((path) => {
        if (!alive || !path) return;
        setBuildIndicatorDismissed(false);
        setBuildNotice(
          "Your design system is ready — designer.md created. You can now create pages & screens from the Chat in the Playground.",
        );
        timer = window.setTimeout(() => setBuildNotice(null), 9000);
      });
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFoundation.justFinished]);

  // Central routing for opening a folder. A set-up project (has
  // .sdd-de/project.yaml → toolkit.configured) opens directly in the workspace.
  // An empty or not-yet-configured folder goes through intake first — the same
  // ProjectSetup stepper as "New Project" — instead of landing on the Foundation
  // with no design system to extract. Mirrors the cockpit dashboard's routing.
  const openProject = useCallback((p: Project): void => {
    // Bump recency so the recent list leads with what you're actually working on.
    void api.touchProject(p.path).catch(() => {});
    if (p.toolkit.configured) {
      setNewProject(null);
      setWorkspace(p);
    } else {
      setWorkspace(null);
      setNewProject(p);
    }
  }, []);

  // Clear the selection when the active file changes (a fresh file has no
  // carried-over highlight); the editor re-reports as the user selects.
  useEffect(() => {
    setSelection(null);
  }, [wf.activePath]);

  // Warm up the figma-cli connection when a workspace opens, so token sync/push
  // is ready without a manual connect. Fire-and-forget, best-effort (a no-op
  // when figma-cli isn't installed; it self-heals on use).
  useEffect(() => {
    if (workspace) void api.figmaEnsureConnected().catch(() => undefined);
  }, [workspace]);

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

  // Onboarding landing: a brand-new / not-yet-set-up project (no extracted tokens, no detected
  // components) lands on the DESIGN SYSTEM page — the "Design system" tab in the Design-tokens section
  // (tokensTab defaults to "designsystem"). The foundation extracts under the hood (useAutoFoundation),
  // so the palette fills in there. A founded project keeps its default (Explorer). Once per opened project.
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
      if (alive && !ready) {
        setTokensTab("designsystem");
        dispatch({ type: "setActivity", activity: "tokens" });
      }
    })();
    return () => {
      alive = false;
    };
    // Only re-evaluate when a different project is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.path]);

  // Whether the project has design tokens — gates the Tokens (data) sub-tab in the Tokens workspace.
  useEffect(() => {
    if (!workspace?.path) {
      setHasTokens(false);
      setDesignSource(null);
      return;
    }
    let alive = true;
    void api
      .inspectorTokens(workspace.path)
      .then((r) => {
        if (alive) setHasTokens((r.tokens?.length ?? 0) > 0);
      })
      .catch(() => {
        if (alive) setHasTokens(false);
      });
    void api
      .projectConfig(workspace.path)
      .then((c) => {
        if (alive) setDesignSource(c?.designSource ?? null);
      })
      .catch(() => {
        if (alive) setDesignSource(null);
      });
    return () => {
      alive = false;
    };
  }, [workspace?.path]);

  // A consumed-library project has no VortSpec Storybook — if the view is somehow on it, redirect to the
  // Design tokens workspace and land on its Design System tab, which IS that project's component surface
  // and (change: design-system-token-editor) its curated token editor.
  useEffect(() => {
    if (designSource !== "library") return;
    // Storybook and the Design manifest are both hidden for a consumed library — if the view is somehow
    // on either, land on the Design tokens workspace, whose Design System tab IS that project's surface.
    if (layout.activity === "play" || layout.activity === "manifest") {
      setTokensTab("designsystem");
      dispatch({ type: "setActivity", activity: "tokens" });
    }
  }, [designSource, layout.activity]);

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
    onOpenWorkspace: openProject,
  });

  useEffect(() => {
    void api.getProfile().then(setProfile).catch(() => undefined);
    void api.homeDir().then(setHomeDir).catch(() => undefined);
  }, []);
  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Glass-reflection border: nudge the panel-border gradient angle by a few degrees as the
  // cursor moves, so every floating panel's highlight tilts together like a shared light
  // source. Deliberately discreet (~135° ± ~15°) and rAF-throttled; off under reduced-motion.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let lx = 0;
    let ly = 0;
    const apply = (): void => {
      raf = 0;
      const nx = lx / window.innerWidth - 0.5; // -0.5 … 0.5
      const ny = ly / window.innerHeight - 0.5;
      const angle = 135 + nx * 30 + ny * 10; // base 45° diagonal, subtle cursor tilt
      document.documentElement.style.setProperty("--vs-border-angle", `${angle.toFixed(1)}deg`);
    };
    const onMove = (e: MouseEvent): void => {
      lx = e.clientX;
      ly = e.clientY;
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
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
          if (fresh) openProject(fresh);
          return;
        }
        case "openFolder": {
          const p = await api.pickFolder(false);
          if (p) openProject(p);
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
        case "saveProject": {
          // Flush the Playground's pending visual edits to disk (editor files
          // autosave separately). RunApp watches this signal.
          setSaveSignal((n) => n + 1);
          return;
        }
        case "settings": {
          setWelcomeView("settings");
          dispatch({ type: "setActivity", activity: "settings" });
          return;
        }
      }
    });
  }, [dispatch, openProject]);

  const go = (activity: Activity) => (): void => dispatch({ type: "setActivity", activity });

  // Route an error/fix-it into the right-sidebar chat. Captures where the user
  // is now so the dock can point them back once the fix run finishes, and opens
  // the assistant if it's collapsed.
  const dispatchAssistantTask = useCallback(
    (task: AssistantTask): void => {
      const origin = layout.activity;
      setLeftTab("chat"); // the assistant lives in the left dock's Chat tab — reveal it
      setAssistantTask({
        title: task.title,
        prompt: task.prompt,
        allowModify: task.allowModify ?? true,
        origin: activityLabel(origin),
        returnTo: origin,
        nonce: ++taskNonce.current,
      });
    },
    [layout.activity],
  );

  if (!workspace) {
    // Create New Project — one unified setup + intake stepper (Setup · Product ·
    // Scope · Advanced). On finish it creates the project; the open-routing effect
    // then lands it on the Foundation.
    if (newProject) {
      return (
        <div className={`flex h-screen w-screen flex-col overflow-hidden text-vs-text-primary ${CHROME_BG}`}>
          <header
            className="flex h-9 shrink-0 items-center justify-center text-xs text-vs-text-muted"
            style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
          >
            <span className="font-bold text-vs-text-secondary">VortSpec</span>
          </header>
          <div className={`min-h-0 flex-1 overflow-auto m-2 vs-panel-primary ${FLOAT_PANEL}`}>
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
    return (
      <div className={`flex h-screen w-screen flex-col overflow-hidden text-vs-text-primary ${CHROME_BG}`}>
        <header
          className="flex h-9 shrink-0 items-center justify-center border-b border-vs-border-default bg-vs-bg-surface text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          <span className="font-bold text-vs-text-secondary">VortSpec</span>
        </header>
        {/* The initial screen is the one surface every user passes through before
            opening a workspace, so an available update is announced here. */}
        {update && shouldPromptForUpdate(update, dismissedUpdate) && (
          <AppUpdateBanner
            info={update}
            onDownload={() => void api.openInstall(update.downloadUrl ?? update.releaseUrl ?? "")}
            onNotes={() => update.releaseUrl && void api.openInstall(update.releaseUrl)}
            onDismiss={() => {
              // Persist immediately: dismissal has to survive a relaunch, or
              // "Later" would mean "until you quit".
              if (update.latest) void api.dismissUpdate(update.latest);
              setDismissedUpdate(update.latest);
            }}
          />
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar
            active={welcomeView === "settings" ? "settings" : "home"}
            seamless
            onSelect={(a) => setWelcomeView(a === "settings" ? "settings" : "start")}
          />
          <div className={`m-2 flex min-w-0 flex-1 flex-col overflow-hidden vs-panel-primary ${FLOAT_PANEL}`}>
            {welcomeView === "settings" ? (
              <div className="min-w-0 flex-1 overflow-auto">
                <Profile onBack={() => setWelcomeView("start")} onSaved={setProfile} />
              </div>
            ) : (
              <WorkspacePicker
                onOpen={openProject}
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
        </div>
        <footer className="flex h-6 shrink-0 items-center gap-3 px-3 text-[11px] text-vs-text-muted">
          <span>No folder open</span>
        </footer>
      </div>
    );
  }

  const eff = effectiveWidths(layout, winW);
  // The dock is the unified left sidebar shown in EVERY activity (see `effectiveWidths`), so its
  // visibility is `primaryOpen` alone. Gating on `isSidebarView` made the status-bar toggle read
  // "off" in the Playground while the dock was plainly open.
  const showPrimary = layout.primaryOpen;
  const isExplorer = layout.activity === "explorer";
  // Seamless shell (permanent): the chrome (titlebar, activity rail, breadcrumb, status bar) is a
  // single gradient surface; the sidebar dock (surface) and the main canvas (the darker primary
  // well) float as matching rounded panels. The canvas gets the recessed `primary` fill here.
  const canvasShell = `m-2 vs-panel-primary ${FLOAT_PANEL}`;
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

  // Breadcrumb terminal toggle — an in-app shell like any IDE, docked at the bottom
  // and available from every view. Open → dock bottom + select the terminal tab;
  // toggle closed when it's already the shown panel.
  const terminalOpen = layout.panelOpen && layout.panelSelected === "terminal";
  const toggleTerminal = (): void => {
    if (terminalOpen) {
      dispatch({ type: "togglePanel" });
    } else {
      dispatch({ type: "setPanelDock", dock: "bottom" });
      dispatch({ type: "openPanelTab", tab: "terminal" });
    }
  };

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
              // Reveal the Chat tab in the left dock (the assistant lives there now), then attach.
              setLeftTab("chat");
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
          sidebarSlot={sectionSlot}
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
        <RunApp project={p} kind="app" hideRail canvas saveSignal={saveSignal} assistantBusy={dockBusy} sidebarSlot={sectionSlot} onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")}
          onSendToChat={(text, file) => {
            setLeftTab("chat"); // reveal the chat tab in the left dock
            // A canvas selection has no honest line range — carry it as a canvas
            // selection with a label, not a fabricated file+line reference.
            setPendingRef({ source: "canvas", label: file ?? "Run canvas selection", text, nonce: ++refNonce.current });
          }}
        />
      ) : a === "play" ? (
        <RunApp project={p} kind="storybook" hideRail sidebarSlot={sectionSlot} onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("play")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "tokens" ? (
        hasTokens ? (
          <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex flex-none items-stretch gap-1 border-b border-vs-border-subtle bg-vs-bg-surface px-2 py-1 text-[12px]">
              <button
                type="button"
                onClick={() => setTokensTab("tokens")}
                aria-pressed={tokensTab === "tokens"}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${tokensTab === "tokens" ? "bg-vs-bg-hover text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"}`}
              >
                Tokens
              </button>
              <button
                type="button"
                onClick={() => setTokensTab("designsystem")}
                aria-pressed={tokensTab === "designsystem"}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${tokensTab === "designsystem" ? "bg-vs-bg-hover text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"}`}
              >
                Design system
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {tokensTab === "tokens" ? (
                <Inspector project={p} hideRail sidebarSlot={sectionSlot} onBack={go("explorer")} onOpenPreview={go("explorer")} onOpenRun={go("run")} onOpenHistory={go("explorer")} onOpenManifest={go("manifest")} onOpenFile={(path) => { void wf.openFile(path); dispatch({ type: "setActivity", activity: "explorer" }); }} />
              ) : (
                <DesignSystem project={p} hideRail onBack={() => setTokensTab("tokens")} extracting={autoFoundation.extracting} reloadSignal={autoFoundation.justFinished + autoBuild.justFinished + leverEdits} />
              )}
            </div>
          </div>
        ) : (
          <DesignSystem project={p} hideRail onBack={go("explorer")} extracting={autoFoundation.extracting} reloadSignal={autoFoundation.justFinished + autoBuild.justFinished + leverEdits} />
        )
      ) : a === "tasks" ? (
        <Tasks project={p} hideRail onBack={go("explorer")} onFlow={go("flow")} onRun={go("run")} onPlayground={go("explorer")} onTokens={go("tokens")} onManifest={go("manifest")} onHistory={go("explorer")} onSource={go("source")} />
      ) : a === "manifest" ? (
        <DesignManifest project={p} hideRail onBack={go("explorer")} onOpenRun={go("run")} onOpenPreview={go("explorer")} onOpenInspector={go("tokens")} onOpenHistory={go("explorer")} />
      ) : a === "settings" ? (
        <Profile onBack={go("explorer")} onSaved={setProfile} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-vs-text-muted">This view isn’t available in the IDE yet.</div>
      );
    return <div className="min-w-0 flex-1 overflow-auto">{inner}</div>;
  }

  return (
    <IdeContext.Provider value={{ activeFile: wf.activePath, previewUrl, setActiveFile: () => {}, setPreviewUrl: () => {} }}>
     <AssistantTaskProvider value={dispatchAssistantTask}>
      <CanvasSelectionProvider>
      <div className={`flex h-screen w-screen flex-col overflow-hidden text-vs-text-primary ${CHROME_BG}`}>
        {/* Automatic background component build (light-pages-on-canvas §9): a quiet running indicator +
            a completion toast, so the user knows the design-system components are building while they work. */}
        {(autoFoundation.extracting || autoBuild.building || buildNotice || autoBuild.setupRequired) && !buildIndicatorDismissed && (
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 px-3 py-2 text-[12px] text-vs-text-secondary shadow-lg backdrop-blur">
              {autoBuild.setupRequired ? (
                /* The framework is unset or unrecognized, so the background build refused to start.
                   Say so — a silently absent build reads as "nothing to do", which is how a project
                   sat generating React into a non-React app. */
                <>
                  <span className="text-vs-warning" aria-hidden>!</span>
                  <span className="text-vs-text-primary">{autoBuild.setupRequired}</span>
                </>
              ) : buildNotice ? (
                <>
                  <span className="text-vs-success">✓</span>
                  <span className="text-vs-text-primary">{buildNotice}</span>
                </>
              ) : autoFoundation.extracting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-vs-border-strong border-t-vs-accent" aria-hidden />
                  <span>Setting up your design system in the background — this can take a few minutes…</span>
                </>
              ) : (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-vs-border-strong border-t-vs-accent" aria-hidden />
                  <span>Building design-system components in the background…{autoBuild.remaining > 0 ? ` ${autoBuild.remaining} left` : ""}</span>
                </>
              )}
              <button
                type="button"
                onClick={() => setBuildIndicatorDismissed(true)}
                aria-label="Dismiss"
                title="Dismiss — the build keeps running in the background"
                className="ms-1 rounded p-0.5 text-vs-text-muted transition-colors hover:bg-vs-bg-hover hover:text-vs-text-primary"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          </div>
        )}
        <header
          className="relative flex h-9 shrink-0 items-center justify-end pe-2 text-xs text-vs-text-muted"
          style={{ WebkitAppRegion: "drag" } as unknown as CSSProperties}
        >
          {/* No brand here: the logo + name are the breadcrumb's Home crumb, one row down.
              This bar is the traffic-light strip and the avatar — everything else is drag. */}
          <div className="relative" style={{ WebkitAppRegion: "no-drag" } as unknown as CSSProperties}>
            <AvatarButton
              profile={profile}
              active={layout.activity === "settings"}
              onClick={() => dispatch({ type: "setActivity", activity: "settings" })}
            />
          </div>
        </header>

        <ToolkitUpdateBanner project={workspace} onUpdated={setWorkspace} />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ActivityBar active={layout.activity} seamless hideStorybook={designSource === "library"} hideManifest={designSource === "library"} onSelect={(a) => (a === "home" ? setWorkspace(null) : dispatch({ type: "setActivity", activity: a }))} />

          {/* The ONE left sidebar: the current view's Section sidebar + the persistent Chat.
              The right assistant sidebar is gone — the chat lives here now, mounted once so
              the conversation persists across every section. */}
          <LeftDock
            width={eff.primary}
            sectionLabel={
              isExplorer
                ? "Code"
                : layout.activity === "run"
                  ? "Design"
                  : layout.activity === "play"
                    ? "Stories"
                    : layout.activity === "flow"
                      ? "Components"
                      : layout.activity === "tokens"
                        ? // The sidebar's contents follow the Design-tokens sub-tab, so its label does too.
                          tokensTab === "designsystem"
                          ? "Design system"
                          : "Variables"
                        : "Panel"
            }
            hasSection={
              isExplorer ||
              layout.activity === "run" ||
              layout.activity === "play" ||
              layout.activity === "flow" ||
              layout.activity === "tokens"
            }
            sectionEl={sectionSlot}
            tab={leftTab}
            onTabChange={setLeftTab}
            chat={
              <ConversationTabs
                project={workspace}
                showSession
                allowModify
                userName={userName}
                seedContext={buildSeedContext(previewUrl)}
                liveContext={buildLiveContext(wf.activePath, selection)}
                // The context indicator lives right above the composer input, so wherever you are
                // in the app, the file you selected in the Explorer is visibly the chat's context.
                contextSlot={
                  <div
                    data-testid="assistant-context"
                    className="flex flex-wrap items-center gap-1.5 text-[11px] text-vs-text-muted"
                  >
                    <span className="uppercase tracking-wide">Context</span>
                    {wf.activePath ? (
                      <span
                        title={wf.activePath}
                        className="max-w-[220px] truncate rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-vs-text-secondary"
                      >
                        {wf.activePath}
                      </span>
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
                }
                mcpConfigPath={ideMcp.configPath}
                extraAllowedTools={ideMcp.configPath ? [IDE_MCP_TOOL_GROUP] : undefined}
                pendingRef={pendingRef}
                incomingTask={assistantTask}
                onReturnToOrigin={(returnTo) => dispatch({ type: "setActivity", activity: returnTo as Activity })}
                onBusyChange={setDockBusy}
              />
            }
          />
          {/* No drag handle for a dock that isn't there — it would resize something invisible. */}
          {layout.primaryOpen && (
            <Resizer orientation="vertical" ariaLabel="Resize sidebar" onDelta={(d) => dispatch({ type: "nudgePrimary", delta: d })} />
          )}
          {/* The Design-tokens workspace's sidebar follows its sub-tab: the Tokens tab portals its variable
              tree (from Inspector), the Design system tab portals the SAME Library panel the Playground
              shows — replicated, not moved, so the design system is editable next to the palette AND next
              to the screens. (change: design-system-style-panel) */}
          {workspace &&
            layout.activity === "tokens" &&
            tokensTab === "designsystem" &&
            sectionSlot &&
            createPortal(
              <LibraryPanel project={workspace} onEdited={() => setLeverEdits((n) => n + 1)} />,
              sectionSlot,
            )}

          {/* Explorer's file tree is portaled into the dock's Section tab. */}
          {isExplorer &&
            sectionSlot &&
            createPortal(
              <Explorer
                project={workspace}
                activePath={wf.activePath}
                onOpen={openFromExplorer}
                onCollapse={() => dispatch({ type: "togglePrimary" })}
                openCount={wf.files.length}
                newFileSignal={newFileSignal}
              />,
              sectionSlot,
            )}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Breadcrumb — close/change the project (back to Home), above the editor tabs. */}
            <nav
              aria-label="Breadcrumb"
              // Three regions: the sidebar toggle, the breadcrumb, the terminal. A grid rather than a flex
              // row so the breadcrumb is centred against the BAR, not pushed off-centre by whatever the
              // two sides happen to contain.
              className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-2 bg-transparent px-3 py-1 text-[11px] text-vs-text-muted"
            >
              {/* Show/hide the dock — from EVERY section, not just Explorer. */}
              <div className="flex min-w-0 items-center">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "togglePrimary" })}
                  aria-pressed={layout.primaryOpen}
                  aria-label={`${layout.primaryOpen ? "Hide" : "Show"} the sidebar`}
                  title={`${layout.primaryOpen ? "Hide" : "Show"} the sidebar`}
                  className="flex items-center rounded p-1 transition-colors hover:bg-vs-bg-hover hover:text-vs-text-secondary"
                >
                  <SidebarIcon open={layout.primaryOpen} />
                </button>
              </div>

              <div className="flex min-w-0 items-center justify-center gap-1.5">
              {/* The Home crumb IS the brand mark: Home is the app's root, so the logo stands in
                  for the word "Home". No wordmark — the crumb after it already names the project,
                  and the mark alone reads as the root. `alt=""` because the button is labelled. */}
              <button
                type="button"
                onClick={() => setWorkspace(null)}
                title="Close project — back to Home"
                aria-label="Home"
                className="flex items-center opacity-80 transition-opacity hover:opacity-100"
              >
                <Logo size={14} alt="" />
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
              <span className="text-vs-text-secondary">{breadcrumbLabel(layout.activity)}</span>
              {/* The active editor tab, appended when a file is open in the Explorer view. */}
              {isExplorer && wf.activePath && (
                <>
                  <span className="text-vs-text-muted/50">/</span>
                  <span className="truncate font-mono text-vs-text-secondary" title={wf.activePath}>
                    {wf.activePath.split("/").pop()}
                  </span>
                </>
              )}
              </div>

              <div className="flex min-w-0 items-center justify-end">
              {/* Open an in-app terminal at the bottom — available from every view. */}
              <button
                type="button"
                onClick={toggleTerminal}
                aria-pressed={terminalOpen}
                aria-label="Terminal"
                title="Toggle terminal (Ctrl+`)"
                className={`flex items-center rounded p-1 transition-colors ${
                  terminalOpen
                    ? "bg-vs-bg-elevated text-vs-text-primary"
                    : "text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-secondary"
                }`}
              >
                <TerminalIcon />
              </button>
              </div>
            </nav>
            {isExplorer ? (
              <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${canvasShell}`}>{centerForExplorer()}</div>
            ) : (
              // Work-panel views (Foundation, Run, Tokens, …): the view's header portals into the
              // header region ABOVE the main container (so the panel carries no header band), and
              // the main container floats below it. Same bottom terminal dock as the Explorer.
              <>
                <div
                  ref={(node) => {
                    if (node && headerSlot.parentElement !== node) node.appendChild(headerSlot);
                  }}
                  className="flex-none"
                />
                <HeaderSlotContext.Provider value={headerSlot}>
                  <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden mx-2 mb-2 vs-panel-primary ${FLOAT_PANEL}`}>
                    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{workPanel()}</div>
                    {layout.panelOpen && layout.panelDock === "bottom" && (
                      <>
                        <Resizer orientation="horizontal" ariaLabel="Resize terminal" onDelta={(d) => dispatch({ type: "nudgePanel", delta: -d })} />
                        <div style={{ height: layout.panelSize }} className="min-h-0 flex-none">
                          {panelGroup}
                        </div>
                      </>
                    )}
                  </div>
                </HeaderSlotContext.Provider>
              </>
            )}
          </div>
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-2 px-3 text-[11px] text-vs-text-muted">
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
          {/* Region toggles apply to the Explorer/editor view only. The Terminal now
              lives in the breadcrumb (available from every view), so it's not here. */}
          {isExplorer && (
            <div className="flex items-center gap-1">
              <FooterToggle label="Sidebar" active={showPrimary} title="Show or hide the sidebar" onClick={() => dispatch({ type: "togglePrimary" })} />
              <FooterToggle label="Editor" active={layout.editorOpen} title="Toggle the editor" onClick={() => dispatch({ type: "toggleEditor" })} />
            </div>
          )}
        </footer>
      </div>
      {ideMcp.pending && (
        <IdeActionDialog pending={ideMcp.pending} onConfirm={ideMcp.confirm} onCancel={ideMcp.cancel} />
      )}
      </CanvasSelectionProvider>
     </AssistantTaskProvider>
    </IdeContext.Provider>
  );
}

/** Breadcrumb label for the current activity — the user-facing name of each section
 *  (e.g. `run` → "Playground", `play` → "Storybook", `flow` → "Components"). */
function breadcrumbLabel(a: Activity): string {
  const LABELS: Partial<Record<Activity, string>> = {
    explorer: "Code Editor",
    run: "Playground",
    play: "Storybook",
    flow: "Components",
    tokens: "Design tokens",
    manifest: "Design manifest",
    source: "Source Control",
    tasks: "Tasks",
    settings: "Settings",
    history: "History",
  };
  return LABELS[a] ?? a.charAt(0).toUpperCase() + a.slice(1);
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

/** The top-bar user photo: the profile avatar, or the name's initial as a fallback. */
function AvatarButton({
  profile,
  active,
  onClick,
}: {
  profile: ProfileT | null;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const initial = (profile?.name.trim()?.[0] ?? "").toUpperCase() || "You";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Profile & settings"
      aria-label="Profile"
      className={`overflow-hidden rounded-full border transition-colors ${
        active ? "border-vs-accent" : "border-vs-border-strong hover:border-vs-accent"
      }`}
    >
      {profile?.avatarDataUrl ? (
        <img src={profile.avatarDataUrl} alt="" className="h-6 w-6 object-cover" />
      ) : (
        <span className="grid h-6 w-6 place-items-center bg-vs-bg-elevated text-[10px] font-medium text-vs-text-secondary">
          {initial}
        </span>
      )}
    </button>
  );
}

/** A small terminal glyph for the breadcrumb's terminal toggle. */
/** A panel-left glyph; the inner fill reads as "the sidebar is showing". */
function SidebarIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      {open && <rect x="2.5" y="3.5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.55" />}
    </svg>
  );
}

function TerminalIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 6l2.5 2L4 10M8 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
