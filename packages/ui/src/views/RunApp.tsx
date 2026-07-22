import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DevServerStatus, Project, InspectorToken, InspectorComponent, FileSnapshot, StorybookEntry } from "@vortspec/core/ipc";
import { buildSelection, alignToCss, flowToCss } from "@vortspec/core/selection-builder";
import { sizeModeCss, SIZE_MODE_LABEL } from "@vortspec/core/sizing";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";
import { DesignPanel, ChangesBar } from "../components/run-canvas/DesignPanel";
import { Sitemap } from "../components/run-canvas/Sitemap";
import type { RouteDiscovery } from "@vortspec/core/ipc";
import { RunCanvas } from "../components/run-canvas/RunCanvas";
import {
  resolveComponent,
  resembleComponent,
  cssForField,
  matchTokenName,
  tokenNameFromVar,
  buildSelectionContext,
} from "../components/run-canvas/compose";
import {
  classifyFieldEdit,
  classifyVariantEdit,
  buildEditPrompt,
  groupEditsByElement,
  isTokenBinding,
  type PendingEdit,
} from "../components/run-canvas/pending";
import { useInspectorBridge, type CanvasMode } from "../lib/useInspectorBridge";
import { useComments } from "../lib/useComments";
import { CommentsLayer } from "../components/run-canvas/CommentsLayer";
import { CommentsPanel } from "../components/run-canvas/CommentsPanel";
import type { Anchor } from "@vortspec/core/comment";
import { useAgentRun } from "../lib/useAgentRun";
import { useAssistantTask } from "../lib/assistant-task";
import { usePublishCanvasSelection } from "../lib/canvas-selection";
import { useComposeRun } from "../lib/useComposeRun";
import { useDragMove } from "../lib/useDragMove";
import { ComposePanel } from "../components/run-canvas/ComposePanel";
import { AssignDialog } from "../components/run-canvas/AssignDialog";
import { routedModel } from "../lib/model-routing";
import { RunDoctor, type DoctorState } from "../components/run-canvas/RunDoctor";
import { buildDoctorPrompt, buildEnvSetupPrompt, relFileFromSource } from "../components/run-canvas/doctor";

/**
 * Run App (M5) — the live localhost runtime for the project's OWN app (its `dev`
 * script), distinct from the Storybook component Playground. VortSpec launches the
 * managed app server (confined to the project folder) and embeds it, so the user
 * can run and iterate on screens they vibe-engineer via the assistant (which is
 * modify-capable on this screen, seeded with a Screen-Creation context in App).
 */
export function RunApp({
  project,
  kind = "app",
  hideRail = false,
  canvas = false,
  onBack,
  onFlow,
  onRun,
  onPlayground,
  onTokens,
  onManifest,
  onHistory,
  onSource,
  onSendToChat,
  saveSignal,
}: {
  project: Project;
  /** Which server to run: the project's own `app` (default) or its `storybook`. */
  kind?: "app" | "storybook";
  /** Hide the internal ProjectRail (the IDE supplies its own activity-bar navigation). */
  hideRail?: boolean;
  /** Enable the Run Canvas (Figma-style visual editing) — IDE only (needs `webviewTag`). */
  canvas?: boolean;
  onBack: () => void;
  onFlow: () => void;
  onRun: () => void;
  onPlayground: () => void;
  onTokens: () => void;
  onManifest: () => void;
  onHistory: () => void;
  onSource: () => void;
  /** Send the current canvas selection to the assistant chat as context (IDE). */
  onSendToChat?: (text: string, file?: string | null) => void;
  /** Bumped by File > Save / Ctrl+S — flush pending canvas edits to disk. */
  saveSignal?: number;
}): React.JSX.Element {
  const [dev, setDev] = useState<DevServerStatus>({ state: "stopped", url: null, script: null, message: null });
  const [frameLoading, setFrameLoading] = useState(true);
  // Bumped by the header Refresh button to reload the preview (remounts the
  // iframe via its key; the canvas webview reloads through the bridge).
  const [reloadNonce, setReloadNonce] = useState(0);
  const autoRef = useRef(false);

  // Missing-.env helper: a cloned repo often ships a `.env.example` but not the
  // real `.env`, so the app boots then crashes at runtime. Detect that and offer
  // a one-click "Create .env from example".
  const [envStatus, setEnvStatus] = useState<{ hasEnv: boolean; examples: string[]; placeholders: string[] } | null>(
    null,
  );
  const [envDismissed, setEnvDismissed] = useState(false);
  const [envCreated, setEnvCreated] = useState(false);
  const [envBusy, setEnvBusy] = useState(false);

  const refetchEnv = useCallback(async (): Promise<void> => {
    if (kind !== "app") return;
    try {
      setEnvStatus(await api.envStatus(project.path));
    } catch {
      setEnvStatus(null);
    }
  }, [kind, project.path]);

  useEffect(() => {
    setEnvDismissed(false);
    setEnvCreated(false);
    void refetchEnv();
  }, [refetchEnv]);

  async function createEnvFile(): Promise<void> {
    const example = envStatus?.examples[0];
    if (!example) return;
    setEnvBusy(true);
    const r = await api.createEnv(project.path, example);
    setEnvBusy(false);
    await refetchEnv();
    if (r.ok) setEnvCreated(true);
  }
  const envMissing = !!envStatus && !envStatus.hasEnv && envStatus.examples.length > 0;

  // ── Run Doctor: gated "Fix with Claude" for startup / runtime failures ──────
  const doctorMod = useAgentRun();
  const [doctorState, setDoctorState] = useState<DoctorState>("idle");
  const [doctorSnap, setDoctorSnap] = useState<FileSnapshot[] | null>(null);
  const [doctorDismissed, setDoctorDismissed] = useState(false);
  // When an assistant host is mounted (the IDE), a fix is handed to the sidebar
  // chat instead of running inline — so the user can leave this screen while it
  // works. Null in the cockpit, where the inline "Fix with Claude" run stays.
  const dispatchTask = useAssistantTask();
  const [doctorHandedOff, setDoctorHandedOff] = useState(false);
  const [envHandedOff, setEnvHandedOff] = useState(false);

  useEffect(() => {
    setDoctorDismissed(false);
    setDoctorState("idle");
    setDoctorHandedOff(false);
    setEnvHandedOff(false);
  }, [project.path]);

  /** Hand the startup/runtime fix to the sidebar assistant. */
  function fixInAssistant(mode: "startup" | "runtime"): void {
    const file = mode === "runtime" ? relFileFromSource(bridge.runtimeError?.source) : null;
    const error =
      mode === "startup"
        ? (dev.message ?? "The dev server exited.")
        : `${bridge.runtimeError?.message ?? "Runtime error"}\n${bridge.runtimeError?.stack ?? ""}`;
    dispatchTask?.({
      title: mode === "startup" ? "Fix: app won't start" : "Fix: runtime error",
      allowModify: true,
      prompt: buildDoctorPrompt({ kind: mode, error, file, script: dev.script }),
    });
    setDoctorHandedOff(true);
  }

  /** Hand environment setup (missing/placeholder .env) to the sidebar assistant. */
  function fixEnvInAssistant(): void {
    dispatchTask?.({
      title: "Fix: environment setup",
      allowModify: true,
      prompt: buildEnvSetupPrompt({
        hasEnv: !!envStatus?.hasEnv,
        example: envStatus?.examples[0],
        placeholders: envStatus?.placeholders,
      }),
    });
    setEnvHandedOff(true);
  }

  async function fixWithClaude(mode: "startup" | "runtime"): Promise<void> {
    const file = mode === "runtime" ? relFileFromSource(bridge.runtimeError?.source) : null;
    const error =
      mode === "startup"
        ? (dev.message ?? "The dev server exited.")
        : `${bridge.runtimeError?.message ?? "Runtime error"}\n${bridge.runtimeError?.stack ?? ""}`;
    // Best-effort snapshot of the failing file so the fix is revertable.
    let snap: FileSnapshot[] = [];
    if (file) {
      try {
        snap = await api.snapshotComponent(project.path, file);
      } catch {
        /* file may not be snapshottable; the run is still gated by the click */
      }
    }
    setDoctorSnap(snap);
    setDoctorState("running");
    await doctorMod.start({
      prompt: buildDoctorPrompt({ kind: mode, error, file, script: dev.script }),
      cwd: project.path,
      allowedTools: ["Read", "Edit", "Write"],
      bypassPermissions: true,
    });
  }

  useEffect(() => {
    if (doctorMod.model.status === "done") setDoctorState("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorMod.model.status]);

  function doctorKeep(): void {
    setDoctorState("idle");
    setDoctorSnap(null);
    setDoctorDismissed(true);
    doctorMod.reset();
    bridge.clearRuntimeError();
  }
  async function doctorRevert(): Promise<void> {
    if (doctorSnap && doctorSnap.length) await api.restoreFiles(project.path, doctorSnap);
    setDoctorState("idle");
    setDoctorSnap(null);
    setDoctorDismissed(true);
    doctorMod.reset();
  }
  async function doctorRestart(): Promise<void> {
    setDoctorState("idle");
    setDoctorDismissed(true);
    doctorMod.reset();
    bridge.clearRuntimeError();
    await stopFor();
    setDev(await startFor());
  }

  const isApp = kind === "app";
  const noun = isApp ? "app" : "Storybook";
  const statusFor = (): Promise<DevServerStatus> =>
    isApp ? api.appServerStatus(project.path) : api.devServerStatus(project.path);
  const startFor = (): Promise<DevServerStatus> =>
    isApp ? api.startAppServer(project.path) : api.startDevServer(project.path);
  const stopFor = (): Promise<void> =>
    isApp ? api.stopAppServer(project.path) : api.stopDevServer(project.path);

  const embedUrl = dev.url ? dev.url.replace(/\/+$/, "") + "/" : "";
  const canvasReady = canvas && isApp && !!embedUrl;

  // ── Sitemap: the app's page/route tree, read from source (change: sitemap-tree) ──
  const [routes, setRoutes] = useState<RouteDiscovery | null>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const rediscoverRoutes = useCallback(() => {
    void api.discoverRoutes(project.path).then(setRoutes);
  }, [project.path]);
  useEffect(() => {
    if (!canvas) return;
    let alive = true;
    void api.discoverRoutes(project.path).then((r) => alive && setRoutes(r));
    return () => {
      alive = false;
    };
  }, [canvas, project.path]);

  // ── Storybook provisioning (the deterministic backstop) ─────────────────────
  // The Playground guarantees a REAL Storybook to serve once components exist,
  // instead of silently falling back to the improvised Vite gallery. On open we
  // check the project: if components exist but Storybook isn't installed, install
  // it (once, non-interactively) and then start it; if it's installed but some
  // components have no story yet, offer to fill the gap via the assistant.
  const [sb, setSb] = useState<
    { phase: "idle" | "checking" | "installing" | "failed" | "gap"; missing?: number; error?: string }
  >({ phase: "idle" });

  useEffect(() => {
    if (isApp) return;
    let alive = true;
    setSb({ phase: "checking" });
    void (async () => {
      const s = await api.storybookStatus(project.path).catch(() => null);
      if (!alive) return;
      if (!s) return setSb({ phase: "idle" });
      if (!s.installed && s.components > 0) {
        setSb({ phase: "installing" });
        // Wire the styling pipeline (Tailwind config + token→theme bridge) and reconcile any
        // default/named export mismatches before Storybook renders, so components aren't shown
        // as unstyled skeletons and the build doesn't fail on MISSING_EXPORT (styling-foundation-gate).
        await api.ensureStylingPipeline(project.path).catch(() => null);
        await api.reconcileExports(project.path).catch(() => null);
        const r = await api.ensureStorybook(project.path).catch(() => null);
        if (!alive) return;
        if (r && r.installed) {
          setSb({ phase: "idle" });
          void start();
        } else {
          setSb({ phase: "failed", error: r?.error });
        }
      } else if (s.installed && s.missingStories > 0) {
        setSb({ phase: "gap", missing: s.missingStories });
      } else {
        setSb({ phase: "idle" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, isApp]);

  /** Hand story generation for missing components to the sidebar assistant. */
  function generateStoriesInAssistant(): void {
    dispatchTask?.({
      title: "Storybook: generate stories",
      allowModify: true,
      prompt:
        "Run the /storybook skill for this project. Storybook is already installed. Generate a Storybook " +
        "story (`*.stories.tsx` next to each component) for EVERY built component under the component dir that " +
        "doesn't already have one, following the project's story conventions (variants + states). Do NOT start a " +
        "blocking dev server and do NOT create any custom gallery/preview page. End by listing how many stories you added.",
    });
    setSb({ phase: "idle" });
  }

  // ── Run Canvas (visual editing) state — only used when `canvas` is on ──────
  const bridge = useInspectorBridge();

  // Navigate the preview to a route (SPA fallback or a real Next.js URL both work).
  const navigateTo = useCallback(
    (path: string) => {
      if (!dev.url) return;
      const url = new URL(path.startsWith("/") ? path.slice(1) : path, dev.url.replace(/\/+$/, "") + "/").href;
      bridge.loadUrl(url);
      setCurrentPath(path);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dev.url, bridge.loadUrl],
  );

  // A state-navigated screen has no URL — reveal its source file so the user can edit it.
  const openScreenFile = useCallback(
    (relPath: string) => {
      void api.revealPath(project.path, relPath);
    },
    [project.path],
  );

  // Reload the live preview: reload the canvas webview via the bridge, and
  // remount the plain iframe by bumping its key nonce.
  const refresh = (): void => {
    setFrameLoading(true);
    setReloadNonce((n) => n + 1);
    bridge.reload();
  };
  const [guestPreload, setGuestPreload] = useState<string | null>(null);
  const [tokens, setTokens] = useState<InspectorToken[]>([]);
  const [components, setComponents] = useState<InspectorComponent[]>([]);
  // Canvas controls now live in the sidebar (Layers header + footer), so their
  // state is lifted here where both the Design panel and the canvas can read it.
  // Default to Interact so the app just works; switch to Inspect to edit.
  const [mode, setMode] = useState<CanvasMode>("interact");
  const [zoom, setZoom] = useState(1);
  const zoomBy = useCallback((f: number) => setZoom((z) => Math.min(4, Math.max(0.25, z * f))), []);
  const resetZoom = useCallback(() => setZoom(1), []);
  // Project color tokens for the Figma-style color picker (Libraries tab).
  const colorTokens = useMemo(
    () => tokens.filter((t) => t.type === "color").map((t) => ({ name: t.name, value: t.resolvedValue })),
    [tokens],
  );

  useEffect(() => {
    if (!canvas) return;
    void api.guestPreloadUrl().then(setGuestPreload).catch(() => setGuestPreload(null));
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    void api.inspectorTokens(project.path).then((r) => setTokens(r.tokens)).catch(() => setTokens([]));
    void api
      .inspectorComponents(project.path)
      .then((r) => setComponents(r.components))
      .catch(() => setComponents([]));
  }, [canvas, project.path]);

  // Compose the Design-panel selection from the guest readout + project tokens/components.
  const selection = useMemo(() => {
    if (!bridge.readout) return null;
    try {
      const node = bridge.tree?.nodes[bridge.readout.nodeId];
      // Recognize via data-component OR the React-fiber component names the guest read
      // (so a design-system component with no data-component attribute isn't mislabeled
      // as hand-written markup).
      const component = resolveComponent(node, components, bridge.readout.componentCandidates);
      // If it's not a component instance, see whether it *resembles* one (should reuse it).
      const resembles = component ? null : resembleComponent(bridge.readout.className, components);
      // Label a non-roster React component by its real fiber name (not the bare tag).
      const componentHint = component ? null : (bridge.readout.componentCandidates[0] ?? null);
      return buildSelection(bridge.readout, { tokens, component, resembles, tag: node?.tag, componentHint });
    } catch (err) {
      // Never let a selection-building error blank the whole Run view.
      console.error("[run-canvas] failed to build selection:", err);
      return buildSelection(bridge.readout, { tokens, tag: bridge.tree?.nodes[bridge.readout.nodeId]?.tag });
    }
  }, [bridge.readout, bridge.tree, tokens, components]);

  // Design-panel (left sidebar) width — resizable like the IDE's Explorer rail.
  const [panelW, setPanelW] = useState(288);
  function startPanelResize(e: React.PointerEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const base = panelW;
    const move = (ev: PointerEvent): void =>
      setPanelW(Math.min(460, Math.max(220, base + (ev.clientX - startX))));
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Pending edits + gated commit ──────────────────────────────────────────
  // Un-saved canvas edits persist locally (keyed by project) so leaving the Playground
  // for another app section — or restarting — doesn't lose them; they're replayed into
  // the preview by fingerprint on return (change: persist + replay).
  const pendingKey = `vortspec:pending:${project.path}`;
  const [pending, setPending] = useState<Record<string, PendingEdit>>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(pendingKey) : null;
      return raw ? (JSON.parse(raw) as Record<string, PendingEdit>) : {};
    } catch {
      return {};
    }
  });
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState(false);
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const structuralMod = useAgentRun();

  // ── Screen preview: install a dev-only harness so state-navigated screens (no URL)
  // can be rendered standalone via `?screen=<Name>`. A gated Claude Code run adds the
  // harness + a manifest; on completion we re-discover so those screens become navigable.
  const screenPreviewMod = useAgentRun();
  const enableScreenPreview = useCallback(() => {
    const screens = (routes?.routes[0]?.children ?? [])
      .filter((c) => c.path.startsWith("#screen/") && c.file)
      .map((c) => c.file as string);
    const param = routes?.screenPreview?.param ?? "screen";
    const list = screens.length ? screens.map((f) => `  - ${f}`).join("\n") : "  - (scan src/screens, src/pages, src/views)";
    void screenPreviewMod.start({
      cwd: project.path,
      allowedTools: ["Read", "Edit", "Write"],
      bypassPermissions: true,
      strictMcp: true,
      prompt: [
        "This app navigates between screens with React state, not a router, so its screens have no URL and can't be opened directly in a preview. Add a DEV-ONLY screen-preview harness so each screen can be rendered standalone.",
        "",
        "Requirements:",
        `1. In the app's entry module (the script that index.html loads — likely src/main.tsx, src/preview/main.tsx, or src/index.tsx), add a branch guarded by \`import.meta.env.DEV\`: read the URL query param "${param}" (e.g. ?${param}=DestinationDetail). If it names a screen component, render THAT screen ALONE — wrapped in exactly the same top-level providers, theme, and global styles the app normally mounts. Otherwise render the app exactly as before. Production builds MUST be unaffected.`,
        "2. Each screen needs representative props to render. Build realistic sample props by REUSING the app's own sample data and helper functions (e.g. the landing screen's listings array and any `to<Screen>Data` mapper). If they aren't exported, export them (or construct equivalent representative data). Supply no-op functions for callbacks like onBack.",
        `3. Create the manifest file \`.vortspec/screen-preview.json\` with EXACTLY this shape: { "param": "${param}", "screens": [ { "name": "<ComponentName>", "file": "<src/screens/File.tsx>" } ] } listing every screen the harness can render.`,
        "4. Keep it minimal, typed (no `any`), and reversible. Do NOT add a router or change production rendering.",
        "",
        "Screens to support:",
        list,
      ].join("\n"),
    });
  }, [routes, project.path, screenPreviewMod]);

  // When the harness-install run finishes, re-discover routes (screens become navigable)
  // and reload the preview so the new entry code is live.
  useEffect(() => {
    if (screenPreviewMod.model.status !== "done") return;
    rediscoverRoutes();
    bridge.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenPreviewMod.model.status]);

  // Auto-provision the screen-preview harness (like Storybook): the FIRST time we detect
  // state-navigated screens without a harness, install it silently — no user action. Once
  // per project per session; a failure surfaces a manual retry in the sitemap instead of looping.
  const autoPreviewFor = useRef<string | null>(null);
  useEffect(() => {
    if (!canvas) return;
    const sp = routes?.screenPreview;
    if (!sp || sp.enabled) return; // nothing to do, or already installed
    if (screenPreviewMod.running || autoPreviewFor.current === project.path) return;
    autoPreviewFor.current = project.path;
    enableScreenPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, canvas, project.path]);
  const screenPreviewState: "setting-up" | "failed" =
    screenPreviewMod.model.status === "error" ? "failed" : "setting-up";

  // Persist the ledger on every change (removed when empty — nothing owed).
  useEffect(() => {
    try {
      if (Object.keys(pending).length > 0) localStorage.setItem(pendingKey, JSON.stringify(pending));
      else localStorage.removeItem(pendingKey);
    } catch {
      /* storage unavailable — in-memory only */
    }
  }, [pending, pendingKey]);

  // Replay un-saved edits into the preview once the bridge (re)attaches — i.e. when
  // the page reloads after returning to the Playground. Idempotent; the guest resolves
  // each edit by fingerprint and re-applies its style/class/text.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const replayedRef = useRef(false);
  useEffect(() => {
    if (!bridge.ready) {
      replayedRef.current = false;
      return;
    }
    if (replayedRef.current) return;
    replayedRef.current = true;
    const edits = Object.values(pendingRef.current)
      .filter((e) => e.fingerprint)
      .map((e) => ({
        fingerprint: e.fingerprint as string,
        css: e.css,
        text: e.key === "content" ? e.value : undefined,
        removeClasses: e.removeClasses,
        addClasses: e.addClasses,
      }));
    if (edits.length) bridge.replayOverrides(edits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.ready]);

  // Unsaved canvas edits — the dirty state behind Save / Ctrl+S and the header dot.
  const dirty = Object.keys(pending).length > 0;
  // File > Save / Ctrl+S flushes pending edits to disk (same as the Apply bar).
  const lastSaveRef = useRef(saveSignal);
  useEffect(() => {
    if (saveSignal === undefined || saveSignal === lastSaveRef.current) return;
    lastSaveRef.current = saveSignal;
    if (Object.keys(pending).length > 0) void applyEdits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);

  // Publish the current selection as ambient context for the assistant (tasks §4):
  // it appears as a persistent, detachable chip on the composer, grounds every
  // turn while the selection holds, and never triggers a run. Withdrawn when the
  // selection clears, the element is lost after a reload, or the canvas unmounts.
  const publishSelection = usePublishCanvasSelection();
  useEffect(() => {
    publishSelection(
      selection
        ? {
            key: selection.nodeId,
            label: selection.component ?? selection.label,
            payload: buildSelectionContext(selection, Object.values(pending)),
          }
        : null,
    );
  }, [selection, pending, publishSelection]);
  useEffect(() => () => publishSelection(null), [publishSelection]);

  // Storybook-backed component previews: the picker shows each component's story in
  // its initial state (from the project's running Storybook), the same way the
  // Playground shows the app. Storybook is started alongside the app on entry so the
  // preview works without first visiting the Storybook activity. Null until it's up.
  const [storyUrl, setStoryUrl] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState<StorybookEntry[]>([]);
  useEffect(() => {
    if (!canvas || !isApp) return;
    let alive = true;
    const applyStorybook = async (status: DevServerStatus | null): Promise<void> => {
      if (!alive || !status?.url) return;
      setStoryUrl(status.url);
      const idx = await api.storybookIndex(status.url).catch(() => [] as StorybookEntry[]);
      if (alive) setStoryIndex(idx);
    };
    void (async () => {
      const running = await api.devServerStatus(project.path).catch(() => null);
      if (!alive) return;
      if (running?.url) return void applyStorybook(running);
      // Start Storybook in the background only if it's installed (don't provision here).
      const sb = await api.storybookStatus(project.path).catch(() => null);
      if (!alive || !sb?.installed) return;
      void applyStorybook(await api.startDevServer(project.path).catch(() => null));
    })();
    // Storybook takes a moment to boot — pick up its URL when the status flips to running.
    const off = api.onDevServerUpdate(({ projectPath, kind: k, status }) => {
      if (projectPath === project.path && k === "storybook") void applyStorybook(status);
    });
    return () => {
      alive = false;
      off();
    };
  }, [canvas, isApp, project.path]);
  const storyUrlFor = useCallback(
    (name: string): string | null => {
      if (!storyUrl) return null;
      const entry = storyIndex.find(
        (e) =>
          e.type === "story" &&
          (e.title === name || e.title.endsWith(`/${name}`) || (e.importPath ?? "").includes(`/${name}.`)),
      );
      if (!entry) return null;
      return `${storyUrl.replace(/\/+$/, "")}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story&shortcuts=false&singleStory=true`;
    },
    [storyUrl, storyIndex],
  );

  // Crash recovery (§6.14, §7.4): when the canvas opens, sweep any composition
  // scaffold a prior session left orphaned in source (accept/discard clean up the
  // happy path; a crash between write and accept does not). Idempotent + file-
  // derived, so it needs no in-memory record of the interrupted run.
  useEffect(() => {
    if (canvas) void api.composeSweepProject(project.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, project.path]);

  // Insert-mode composition run (§6): placeholder → prompt → options → accept/discard.
  const compose = useComposeRun({
    project,
    bridge,
    roster: components,
    tokenNames: tokens.map((t) => t.name),
    designMd: null,
  });
  // No roster component fits → route into the existing extract-component flow.
  const onComposeExtract = useCallback(
    (suggestedName: string | null) => {
      onSendToChat?.(
        `Extract a new reusable ${suggestedName ? `"${suggestedName}" ` : ""}component into the design system (with variants + tokens) for the slot I was composing, then use it there.`,
        null,
      );
    },
    [onSendToChat],
  );
  // An accepted insert owes an SDD-DE Screen Creation *update* (design R3) — offer it.
  const onComposeScreenUpdate = useCallback(
    (file: string) => {
      dispatchTask?.({
        title: "Update screen spec",
        prompt: `A new composition was inserted into ${file}. Run the SDD-DE Screen Creation update to reflect it: UPDATE the existing screen's spec to match what was inserted. Do NOT create a new screen.`,
        allowModify: true,
      });
    },
    [dispatchTask],
  );
  // "Later" defers the owed update to a Save-changes bar at the bottom of the Design
  // sidebar (so the spec debt stays visible through the insert session, not lost).
  const [owedScreenUpdates, setOwedScreenUpdates] = useState<string[]>([]);
  const onComposeScreenLater = useCallback((file: string) => {
    setOwedScreenUpdates((cur) => (cur.includes(file) ? cur : [...cur, file]));
  }, []);
  const dismissScreenUpdate = useCallback((file: string) => {
    setOwedScreenUpdates((cur) => cur.filter((f) => f !== file));
  }, []);
  const saveScreenUpdates = useCallback(() => {
    owedScreenUpdates.forEach((f) => onComposeScreenUpdate(f));
    setOwedScreenUpdates([]);
  }, [owedScreenUpdates, onComposeScreenUpdate]);
  // Cancel the insert entirely: drop the placeholder, clear any preview, reset the
  // flow. Closes the dialog and un-picks the segment the user was targeting.
  const onComposeClose = useCallback(() => {
    bridge.dismissPlaceholder();
    bridge.previewOption(null);
    compose.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.dismissPlaceholder, bridge.previewOption, compose.reset]);
  // The panel is present through the whole flow: an active placeholder, an in-flight
  // or resolved run, or an owed screen-update notice.
  const composeActive =
    mode === "insert" && (!!bridge.placeholder || compose.phase !== "idle" || !!compose.screenUpdateOwed);

  // ── Live drag-and-drop move (§5.8) ────────────────────────────────────────
  // Behind a feature flag (Decision 3): when off, a drag is simply never opened as
  // a move and inspect works as before.
  const dragMoveEnabled = true;
  const move = useDragMove({ project, bridge });
  // A completed drop over a valid slot opens the gated move. The dragged element was
  // the selected node, so its label grounds the origin anchor; the drop clears once
  // consumed so a re-render can't re-open it.
  const selectionRefForMove = useRef(selection);
  selectionRefForMove.current = selection;
  useEffect(() => {
    if (!dragMoveEnabled || !bridge.dragDrop || move.phase !== "idle") return;
    const drop = bridge.dragDrop;
    bridge.clearDragDrop();
    // The guest already moved the element live — register it for Keep/Revert (no run).
    // Use the guest-reported label + leading text so the reconcile run can locate the
    // element's JSX (a bare tag alone is ambiguous across a screen).
    move.onDrop(
      {
        fingerprint: drop.sourceFingerprint,
        label: drop.sourceLabel || selectionRefForMove.current?.label || "the selected element",
        text: drop.sourceText,
      },
      drop.target,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.dragDrop]);
  // An invalid drop / forced cancel surfaces a transient sentence, auto-cleared.
  useEffect(() => {
    if (!bridge.dragMessage) return;
    const id = setTimeout(() => bridge.clearDragMessage(), 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.dragMessage]);
  // If a replay-on-return couldn't restore some edits (their element changed), keep a
  // PERSISTENT count — the edits are still in the ledger, just not live, so we surface
  // them in the unsaved-edits bar (below) with a recovery path instead of a fleeting hint.
  const [orphanCount, setOrphanCount] = useState(0);
  useEffect(() => {
    const missing = bridge.replayResult?.missing ?? 0;
    if (missing > 0) setOrphanCount(missing);
    bridge.clearReplayResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.replayResult]);
  // Once the ledger is empty (applied or discarded), there are no orphans to warn about.
  useEffect(() => {
    if (Object.keys(pending).length === 0) setOrphanCount(0);
  }, [pending]);
  // Hand the still-saved edits to the assistant to re-apply by description — the recovery
  // path when they couldn't reattach to a changed element.
  const reapplyInChat = useCallback(() => {
    const list = Object.values(pending)
      .map((e) => `${e.label ?? e.key} → ${e.value}`)
      .join("; ");
    if (onSendToChat && list) {
      onSendToChat(`Re-apply these canvas edits I made (they couldn't reattach after the page changed): ${list}.`, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, onSendToChat]);
  // The move's Keep/Revert gate, docked in the Design sidebar (no floating dialog).
  // Keep is the ONE action — it reconciles the JSX and is done; no second "Save
  // changes" prompt for a move.
  const moveBar =
    dragMoveEnabled && mode === "inspect" && move.phase !== "idle"
      ? {
          phase: move.phase as "moved" | "reconciling" | "error",
          error: move.error,
          progress: move.progress,
          onKeep: () => void move.keep(),
          onRevert: () => void move.revert(),
          onStop: () => void move.cancel(),
        }
      : null;
  // The one set of props behind the persistent sidebar changes-footer, shared by the
  // DesignPanel bar and the comment-mode footer so un-saved work shows in every mode.
  const changesBarProps = {
    pending: Object.values(pending),
    applying,
    applyStatus: applying ? (structuralMod.model.activity.at(-1)?.label ?? null) : null,
    review,
    onApply: () => void applyEdits(),
    onDiscard: discardEdits,
    onRemovePending: removePending,
    onKeep: keepEdits,
    onRevert: () => void revertEdits(),
    owedScreenUpdates,
    onSaveScreenUpdates: saveScreenUpdates,
    onDismissScreenUpdate: dismissScreenUpdate,
    move: moveBar,
  };

  // Inspect-click assign dialog (§ dialog slice): the roster to assign/reuse a
  // component for the selected element. It auto-opens ONLY for elements not already
  // recognized as a component (genuine hand-written markup), so a real component
  // isn't nagged — but any element can open it on demand (assignForced).
  const [assignDismissed, setAssignDismissed] = useState<string | null>(null);
  const [assignForced, setAssignForced] = useState<string | null>(null);
  // On-demand only: the assign/replace-component picker opens when the user clicks
  // "Assign" in the Design panel — it no longer auto-opens for anything it fails to
  // recognize as a component (that nagged real components whose recognition signal
  // the heuristics miss). Never while dragging.
  const assignActive = mode === "inspect" && !!selection && !bridge.drag && selection.nodeId === assignForced;
  const assignSelection = selection; // narrowed for the handlers below
  const onAssignComponent = useCallback(
    (component: { name: string; file: string | null }, opts: { allSimilar: boolean }) => {
      if (!onSendToChat || !assignSelection) return;
      onSendToChat(
        `Refactor the selected element to use the existing "${component.name}" design-system component instead of hand-written markup, choosing the variant/props that match its current appearance. Preserve look and behavior and remove the duplicated styles.` +
          (opts.allSimilar
            ? ` Then find every OTHER occurrence of this same hand-written pattern across the app and refactor each one to use "${component.name}" as well, so all matching instances reference the component (not just this selection).`
            : "") +
          `\n\n${buildSelectionContext(assignSelection)}`,
        component.file,
      );
      setAssignDismissed(assignSelection.nodeId);
    },
    [onSendToChat, assignSelection],
  );
  const onAssignExtract = useCallback(() => {
    if (!onSendToChat || !assignSelection) return;
    onSendToChat(
      `The selected element is hand-written markup that resembles a reusable pattern. Extract it into a new reusable component in the design system (with variants + tokens), then replace this usage with the new component.\n\n${buildSelectionContext(assignSelection)}`,
      assignSelection.file,
    );
    setAssignDismissed(assignSelection.nodeId);
  }, [onSendToChat, assignSelection]);

  // Stable methods (the hook memoizes these) + refs to current state, so the
  // Design-panel callbacks keep a stable identity across the 60fps geometry
  // echoes during a drag — that's what lets the memoized sections skip work.
  const { applyOverride, select, hover, setMode: setGuestMode, setText, setClass, refreshReadout } = bridge;

  // Push the current mode to the guest whenever it (or readiness) changes.
  useEffect(() => {
    if (bridge.ready) setGuestMode(mode);
  }, [mode, bridge.ready, setGuestMode]);

  // Run-canvas comments (repo-backed threads pinned to sections).
  const comments = useComments(project.path, bridge.watchAnchors, bridge.ready);
  const { create: createComment, reply: replyComment, setResolved: resolveComment } = comments;
  const { commentTarget, clearCommentTarget, captureThumbnail } = bridge;
  // Post a new thread from the pending comment-mode target (adds its thumbnail).
  const onCreateComment = useCallback(
    async (body: string) => {
      const t = commentTarget;
      if (!t) return;
      const thumbnail = await captureThumbnail(t.rect);
      const anchor: Anchor = {
        fingerprint: t.fingerprint,
        component: t.component,
        file: null,
        label: t.label,
        rectHint: { x: t.rect.x, y: t.rect.y, w: t.rect.width, h: t.rect.height },
        thumbnail,
        route: null,
      };
      await createComment(anchor, body);
      clearCommentTarget();
    },
    [commentTarget, captureThumbnail, createComment, clearCommentTarget],
  );
  const selectedIdRef = useRef(bridge.selectedId);
  selectedIdRef.current = bridge.selectedId;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const readoutRef = useRef(bridge.readout);
  readoutRef.current = bridge.readout;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  // Last-applied variant value per key, so chained switches remove the right classes.
  const variantDraftRef = useRef<Record<string, string>>({});
  useEffect(() => {
    variantDraftRef.current = {};
  }, [bridge.selectedId]);

  // Apply a CSS override live to the selected node (no file written) — used by
  // both field edits and, per animation frame, handle dragging.
  const applyLive = useCallback(
    (css: Record<string, string>) => {
      const id = selectedIdRef.current;
      if (id) applyOverride(id, css);
    },
    [applyOverride],
  );

  // Record pending edits once (e.g. on drag end), never per frame.
  const commitEdits = useCallback(
    (
      edits: {
        key: string;
        value: string;
        cssProps: string[];
        css?: Record<string, string>;
        token?: string | null;
        resizeMode?: "fixed" | "hug" | "fill";
      }[],
      forceStyle = false,
    ) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const fp = readoutRef.current?.fingerprint || undefined;
      const nodeId = selectedIdRef.current ?? undefined;
      const text = readoutRef.current?.text ?? null;
      const elementKey = fp || nodeId || "•";
      const uses = (n: string): number => tokensRef.current.find((t) => t.name === n)?.uses ?? 0;
      setPending((p) => {
        const next = { ...p };
        for (const e of edits) {
          const edit = classifyFieldEdit(sel, e.key, e.value, e.cssProps, uses, forceStyle, e.css, e.token);
          // Key by element + field so the SAME property on two elements doesn't collide.
          const id = `${elementKey}::${edit.key}`;
          next[id] = {
            ...edit,
            id,
            fingerprint: fp,
            nodeId,
            file: sel.file,
            elementLabel: sel.label,
            elementText: text,
            resizeMode: e.resizeMode,
          };
        }
        return next;
      });
    },
    [],
  );

  // Canvas drags (resize / padding / gap / margin) commit as per-element style
  // edits — Figma detaches to a literal rather than editing a shared token.
  const commitStyleEdits = useCallback(
    (edits: { key: string; value: string; cssProps: string[] }[]) => commitEdits(edits, true),
    [commitEdits],
  );

  // A Design-panel field edit → live override + a recorded pending edit.
  const onFieldChange = useCallback(
    (key: string, value: string) => {
      if (key === "content") {
        const id = selectedIdRef.current;
        if (id) setText(id, value); // live text preview
        commitEdits([{ key, value, cssProps: [] }], true); // source edit (gated)
      } else if (key === "align") {
        const dir = readoutRef.current?.computed["flex-direction"] ?? "row";
        const css = alignToCss(value, dir);
        applyLive(css);
        commitEdits([
          { key, value: `${css["justify-content"]}, ${css["align-items"]}`, cssProps: ["justify-content", "align-items"], css },
        ]);
      } else if (key === "flow") {
        // block / row / column → display (+ flex-direction). Multiple props, so
        // compute the override explicitly rather than via the 1-value field map.
        const css = flowToCss(value);
        applyLive(css);
        commitEdits([{ key, value, cssProps: Object.keys(css), css }]);
      } else if (key === "width" || key === "height") {
        // Figma-style Fixed/Hug/Fill resize (axis-aware via the parent's flow). A mode
        // change arrives as `@fixed`/`@hug`/`@fill`; a raw value is a Fixed px edit.
        const dim = key as "width" | "height";
        const parentFlow = readoutRef.current?.parentFlow ?? "block";
        const mode = value.startsWith("@") ? (value.slice(1) as "fixed" | "hug" | "fill") : "fixed";
        const fixedPx = value.startsWith("@")
          ? `${Math.round(readoutRef.current?.rect[dim] ?? 0)}px`
          : value;
        const css = sizeModeCss(dim, mode, parentFlow, fixedPx);
        applyLive(css);
        const displayValue = mode === "fixed" ? fixedPx : SIZE_MODE_LABEL[mode];
        commitEdits([{ key, value: displayValue, cssProps: Object.keys(css), css, resizeMode: mode }]);
      } else {
        const css = cssForField(key, value);
        applyLive(css);
        // Choosing a color for an element is a per-element decision (Figma applies
        // the style / token reference to the element, not a rewrite of the token).
        const field = selectionRef.current?.sections.flatMap((s) => s.fields).find((f) => f.key === key);
        // For a token-typed length field, re-derive which token (of that type) the
        // NEW value binds — an explicit `var(--name)` binding or a literal that matches
        // a token re-binds; anything else detaches to a literal (Figma behaviour: the
        // token tag updates or disappears as the px changes).
        const token = field?.tokenType
          ? (tokenNameFromVar(value) ?? matchTokenName(value, tokensRef.current, field.tokenType))
          : undefined;
        commitEdits([{ key, value, cssProps: Object.keys(css), css, token }], field?.kind === "color");
      }
      // Re-read the node so the panel reflects its actual computed state (a token
      // re-bind, a value that snaps to/from a token) instead of a stale prop — and
      // so a later undo of this edit is detectable as a real change.
      refreshReadout();
    },
    [applyLive, commitEdits, setText, refreshReadout],
  );

  // An inline text edit on the canvas (double-click) — the guest already applied
  // it live; record it as a pending source edit for the gated commit.
  useEffect(() => {
    const te = bridge.textEdited;
    if (!te) return;
    commitEdits([{ key: "content", value: te.text, cssProps: [] }], true);
    bridge.clearTextEdited();
  }, [bridge.textEdited, bridge, commitEdits]);

  // A variant switch — preview live by swapping the CVA classes on the element,
  // then record it for the gated source edit.
  const onVariantChange = useCallback(
    (key: string, value: string) => {
      const sel = selectionRef.current;
      const id = selectedIdRef.current;
      const variant = sel?.variants.find((v) => v.key === key);
      const words = (s?: string): string[] => (s ? s.split(/\s+/).filter(Boolean) : []);
      let remove: string[] = [];
      let add: string[] = [];
      if (id && variant) {
        const prev = variantDraftRef.current[key] ?? variant.current ?? variant.defaultValue;
        remove = prev ? words(variant.classes?.[prev]) : [];
        add = words(variant.classes?.[value]);
        if (remove.length || add.length) setClass(id, remove, add);
        variantDraftRef.current[key] = value;
      }
      const fp = readoutRef.current?.fingerprint || undefined;
      const editId = `${fp || id || "•"}::variant:${key}`;
      setPending((p) => ({
        ...p,
        [editId]: {
          ...classifyVariantEdit(key, value, remove, add),
          id: editId,
          fingerprint: fp,
          nodeId: id ?? undefined,
          file: sel?.file ?? null,
          elementLabel: sel?.label,
          elementText: readoutRef.current?.text ?? null,
        },
      }));
    },
    [setClass],
  );

  const onSelectNode = useCallback((id: string) => select(id), [select]);
  const onHoverNode = useCallback((id: string | null) => hover(id), [hover]);

  // Apply — the ONLY path to disk (spec-first gate). Token values commit
  // deterministically; style/variant edits go through a gated Claude Code run.
  async function applyEdits(): Promise<void> {
    const edits = Object.values(pending);
    if (edits.length === 0) return;
    // A `var(--name)` value is a per-element token *binding* (Phase 5) — the element
    // should reference the token in its source, exactly like a color-token binding.
    // That's a gated source edit, NOT a rewrite of the token's own value (which would
    // write `--name: var(--name)`). Only concrete-valued token edits commit to the file.
    const isTokenValueEdit = (e: PendingEdit): boolean => e.kind === "token" && !!e.token && !isTokenBinding(e);
    const tokenEdits = edits.filter(isTokenValueEdit);
    const structural = edits.filter((e) => !isTokenValueEdit(e));
    setApplying(true);
    try {
      for (const e of tokenEdits) {
        const r = await api.setTokenValue(project.path, e.token!, e.value);
        setTokens(r.tokens);
      }
      if (structural.length > 0) {
        // Group by element (edits can span multiple elements + files now). Snapshot
        // every distinct affected file so discard restores all of them; if any element
        // has no known file, fall back to the broad token scope.
        const targets = groupEditsByElement(structural);
        const files = [...new Set(targets.map((t) => t.file).filter((f): f is string => !!f))];
        const snap =
          files.length > 0 && files.length === targets.length
            ? (await Promise.all(files.map((f) => api.snapshotComponent(project.path, f)))).flat()
            : await api.snapshotTokenScope(project.path);
        // Dedupe snapshot entries by path.
        const seen = new Set<string>();
        setSnapshot(snap.filter((s) => (seen.has(s.path) ? false : (seen.add(s.path), true))));
        await structuralMod.start({
          prompt: buildEditPrompt(targets),
          cwd: project.path,
          allowedTools: ["Read", "Edit", "Write"],
          bypassPermissions: true,
          // A visual-edit apply reads/edits one source file — it needs no MCP, so
          // skip the user's global MCP servers (Figma, etc.) to cut session startup,
          // and route the mechanical patch to the cheapest tier (a token/style patch,
          // grounded by the index below, is not generative work).
          strictMcp: true,
          // Ground the patch with the design-system index (Plan B3): the token map lets
          // the agent bind to the right token instead of re-deriving names by grepping.
          groundWithIndex: true,
          model: routedModel("haiku"),
        });
        // Completion (reload + review) is handled by the effect below.
      } else {
        // Token-only apply: reflect the committed files, drop the ephemeral overrides.
        bridge.clearOverride();
        bridge.reload();
        setPending({});
        setApplying(false);
      }
    } catch {
      setApplying(false);
    }
  }

  // When the structural (gated) run finishes, reload the preview and enter review.
  useEffect(() => {
    if (structuralMod.model.status !== "done") return;
    bridge.reload();
    setApplying(false);
    setReview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralMod.model.status]);

  function discardEdits(): void {
    bridge.clearOverride();
    setPending({});
    refreshReadout(); // the canvas reverted — re-read so the panel fields follow
  }
  // Drop a single pending edit before applying: restore ITS element to the original,
  // then re-apply that element's remaining edits so the live preview stays exact. Edits
  // now span multiple elements, so target the removed edit's own node, not the selection.
  function removePending(editId: string): void {
    const removed = pending[editId];
    const next = { ...pending };
    delete next[editId];
    const targetNode = removed?.nodeId ?? selectedIdRef.current ?? undefined;
    if (targetNode) {
      bridge.clearOverride(targetNode);
      for (const e of Object.values(next)) {
        if (e.nodeId !== targetNode) continue; // only re-apply this element's edits
        if (e.css && Object.keys(e.css).length > 0) bridge.applyOverride(targetNode, e.css);
        else if (e.key === "content") setText(targetNode, e.value);
        else if (e.kind === "variant") setClass(targetNode, e.removeClasses ?? [], e.addClasses ?? []);
      }
      // If the removed edit was on the current selection, re-read so its Design-panel
      // field snaps back to the node's actual value (not the removed override).
      if (selectedIdRef.current === targetNode) refreshReadout(targetNode);
    }
    setPending(next);
  }
  function keepEdits(): void {
    setReview(false);
    setSnapshot(null);
    setPending({});
    bridge.clearOverride();
    structuralMod.reset();
  }
  async function revertEdits(): Promise<void> {
    if (snapshot) await api.restoreFiles(project.path, snapshot);
    setReview(false);
    setSnapshot(null);
    setPending({});
    bridge.clearOverride();
    bridge.reload();
    structuralMod.reset();
  }

  useEffect(() => {
    void statusFor().then(setDev);
    return api.onDevServerUpdate(({ projectPath, kind: k, status }) => {
      if (projectPath === project.path && k === (isApp ? "app" : "storybook")) setDev(status);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, kind]);

  // Auto-start the runtime on entry.
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    void (async () => {
      const s = await statusFor();
      if (s.url) setDev(s);
      else setDev(await startFor());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, kind]);

  useEffect(() => setFrameLoading(true), [embedUrl]);

  async function start(): Promise<void> {
    setDev(await startFor());
  }

  return (
    <div className={`flex w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary ${hideRail ? "h-full min-h-0" : "h-[calc(100vh-3rem)]"}`}>
      {!hideRail && (
        <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("runapp", {
          onFlow,
          onRun,
          onPlayground,
          onTokens,
          onManifest,
          onHistory,
          onSource,
          onRunApp: () => undefined,
        })}
      />
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-5 py-3">
          <span className="text-[15px] font-semibold">{isApp ? "Playground" : "Storybook"}</span>
          {dirty && (
            <span
              data-testid="canvas-dirty"
              title="Unsaved canvas edits — Save (⌘S) to write them to disk"
              className="flex items-center gap-1 text-[11px] text-vs-text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              Unsaved
            </span>
          )}
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            localhost
          </span>
          <span className="text-xs text-vs-text-muted">
            {isApp
              ? "Describe a screen in Chat — it's built from your components and appears here live."
              : "Your component library, running live from Storybook."}
          </span>
          <div className="flex-1" />
          {dev.state === "running" && dev.url ? (
            <>
              <span className="font-mono text-[11px] text-vs-text-secondary">{dev.url.replace(/^https?:\/\//, "")}</span>
              <Button variant="ghost" onClick={() => void api.openInstall(dev.url!)}>Open in browser</Button>
              <Button variant="ghost" onClick={refresh} title="Reload the live preview">
                <RefreshIcon /> Refresh
              </Button>
              <Button variant="ghost" onClick={() => void stopFor()}>Stop</Button>
            </>
          ) : (
            <Button variant="default" disabled={dev.state === "starting"} onClick={() => void start()}>
              {dev.state === "starting" ? "Starting…" : isApp ? "Start app" : "Start Storybook"}
            </Button>
          )}
        </header>

        {/* Persistent unsaved-edits bar: canvas edits are LIVE preview overrides until Apply
            writes them to source, so they can be lost on a reload. Always show the count +
            Apply so the user never loses work silently, and surface any edit that couldn't
            reattach to a changed element (still saved — offer a re-apply-in-Chat recovery). */}
        {isApp && dirty && (
          <div className="flex flex-none items-center gap-3 border-b border-vs-accent/40 bg-vs-accent-subtle px-5 py-2 text-[12px]">
            <span className="flex-none text-vs-accent" aria-hidden>
              ●
            </span>
            <span className="min-w-0 flex-1 leading-relaxed text-vs-text-primary">
              <b>
                {Object.keys(pending).length} unsaved edit{Object.keys(pending).length === 1 ? "" : "s"}
              </b>{" "}
              — live preview only. <b>Apply</b> to write them into your code so they persist across
              reloads.
              {orphanCount > 0 && (
                <span className="text-vs-warning">
                  {" "}
                  · {orphanCount} couldn’t reattach after the page changed — still saved, but not showing.
                </span>
              )}
            </span>
            {orphanCount > 0 && onSendToChat && (
              <Button variant="ghost" onClick={reapplyInChat}>
                Re-apply in Chat
              </Button>
            )}
            <Button variant="ghost" onClick={discardEdits}>
              Discard
            </Button>
            <Button variant="primary" disabled={applying} onClick={() => void applyEdits()}>
              {applying ? "Applying…" : `Apply ${Object.keys(pending).length}`}
            </Button>
          </div>
        )}

        {kind === "app" && !envDismissed && (envCreated || envMissing) && (
          <div
            className={`flex flex-none items-start gap-3 border-b px-5 py-2.5 text-[12px] ${
              envCreated ? "border-vs-success/40 bg-vs-success/10" : "border-vs-warning/40 bg-vs-warning/10"
            }`}
          >
            <span className={envCreated ? "text-vs-success" : "text-vs-warning"}>{envCreated ? "✓" : "⚠"}</span>
            <div className="min-w-0 flex-1 leading-relaxed">
              {envCreated ? (
                <p className="text-vs-text-primary">
                  Created <code className="font-mono">.env</code> from{" "}
                  <code className="font-mono">{envStatus?.examples[0]}</code>. Open it, fill in the values, then{" "}
                  <b>Stop</b> and <b>Start app</b> so the dev server reloads them.
                </p>
              ) : (
                <p className="text-vs-text-primary">
                  This project has <code className="font-mono">{envStatus?.examples[0]}</code> but no{" "}
                  <code className="font-mono">.env</code> — the app may fail at runtime without its environment
                  variables.
                </p>
              )}
            </div>
            {envHandedOff ? (
              <span className="flex-none self-center text-[11px] text-vs-text-muted">
                Working in the assistant — you can keep using the app.
              </span>
            ) : (
              <>
                {!envCreated && (
                  <Button variant="default" disabled={envBusy} onClick={() => void createEnvFile()}>
                    {envBusy ? "Creating…" : `Create .env from ${envStatus?.examples[0]}`}
                  </Button>
                )}
                {dispatchTask && (
                  <Button variant="primary" onClick={fixEnvInAssistant}>
                    Fix in the assistant →
                  </Button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setEnvDismissed(true)}
              aria-label="Dismiss"
              className="flex-none text-vs-text-muted hover:text-vs-text-secondary"
            >
              ✕
            </button>
          </div>
        )}

        {!isApp && sb.phase === "gap" && (
          <div className="flex flex-none items-center gap-3 border-b border-vs-warning/40 bg-vs-warning/10 px-5 py-2.5 text-[12px]">
            <span className="text-vs-warning">⚠</span>
            <span className="min-w-0 flex-1 text-vs-text-primary">
              Storybook is set up, but {sb.missing} component{sb.missing === 1 ? "" : "s"} don’t have a story yet — they
              won’t appear in the sidebar until they do.
            </span>
            {dispatchTask && (
              <Button variant="primary" onClick={generateStoriesInAssistant}>
                Generate missing stories →
              </Button>
            )}
            <button
              type="button"
              onClick={() => setSb({ phase: "idle" })}
              aria-label="Dismiss"
              className="flex-none text-vs-text-muted hover:text-vs-text-secondary"
            >
              ✕
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden bg-vs-bg-primary">
          {!isApp && sb.phase === "installing" ? (
            <Centered>
              <div className="flex max-w-md flex-col items-center gap-2 text-center">
                <Spinner />
                <p className="text-sm font-medium text-vs-text-primary">Setting up Storybook…</p>
                <p className="text-xs leading-relaxed text-vs-text-muted">
                  Installing Storybook so your components show up here with the full sidebar. This runs once and can
                  take a minute — no need to wait, it’ll open when it’s ready.
                </p>
              </div>
            </Centered>
          ) : !isApp && sb.phase === "failed" ? (
            <Centered>
              <div className="flex max-w-lg flex-col gap-3 rounded-lg border border-vs-warning/40 bg-vs-warning/10 p-4 text-left">
                <p className="text-sm font-semibold text-vs-text-primary">Couldn’t set up Storybook automatically</p>
                <p className="text-[12px] leading-relaxed text-vs-text-secondary">
                  Your components are built, but Storybook didn’t install on its own. Let the assistant finish it, or
                  run <code className="font-mono">npx storybook@latest init</code> in a terminal in the project.
                </p>
                {sb.error && (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-vs-border-default bg-vs-bg-surface p-2 font-mono text-[10px] text-vs-text-muted">
                    {sb.error}
                  </pre>
                )}
                {dispatchTask && (
                  <Button
                    variant="primary"
                    className="self-start"
                    onClick={() =>
                      dispatchTask({
                        title: "Storybook: set up",
                        allowModify: true,
                        prompt:
                          "Install real Storybook into this project non-interactively (`CI=1 npx storybook@latest init --yes`), " +
                          "wire the design token file into `.storybook/preview`, and generate a `*.stories.tsx` for every built " +
                          "component. Do NOT create a custom Vite gallery/preview and do NOT start a blocking dev server. Verify " +
                          "`.storybook` and the `storybook` script exist when done.",
                      })
                    }
                  >
                    Fix in the assistant →
                  </Button>
                )}
              </div>
            </Centered>
          ) : dev.state === "starting" ? (
            <Centered>
              <Spinner /> {dev.message ?? `Starting ${isApp ? "your app's dev server" : "Storybook"}…`}
            </Centered>
          ) : canvasReady ? (
            // Run Canvas: Figma-style Design panel (left) + instrumented preview (right).
            <div className="relative flex h-full min-h-0">
              <aside
                style={{ width: panelW }}
                className="flex flex-none flex-col overflow-hidden border-r border-vs-border-default bg-vs-bg-surface"
              >
                {/* Sitemap: navigate the preview to the app's pages, in any mode. */}
                <Sitemap
                  discovery={routes}
                  currentPath={currentPath}
                  onNavigate={navigateTo}
                  onOpenFile={openScreenFile}
                  onRetryScreenPreview={enableScreenPreview}
                  screenPreviewState={screenPreviewState}
                />
                {mode === "comment" ? (
                  <>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <CommentsPanel
                    threads={comments.threads}
                    anchorRects={bridge.anchorRects}
                    activeId={comments.activeId}
                    me={{ login: comments.author.githubLogin, name: comments.author.name }}
                    onSelect={(t) => {
                      comments.setActiveId(t.id);
                      bridge.scrollToAnchor(t.anchor.fingerprint);
                    }}
                    onResolve={(id, resolved) => void resolveComment(id, resolved)}
                    onShare={() => void comments.share()}
                  />
                  </div>
                  {/* Un-saved canvas work stays visible + saveable even in comment mode. */}
                  <ChangesBar {...changesBarProps} />
                  </>
                ) : (
                <DesignPanel
                  selection={selection}
                  tree={bridge.tree}
                  hoveredId={bridge.hoveredId}
                  onSelectNode={onSelectNode}
                  onHoverNode={onHoverNode}
                  onFieldChange={onFieldChange}
                  onVariantChange={onVariantChange}
                  pending={Object.values(pending)}
                  applying={applying}
                  applyStatus={applying ? (structuralMod.model.activity.at(-1)?.label ?? null) : null}
                  review={review}
                  onApply={() => void applyEdits()}
                  onDiscard={discardEdits}
                  onRemovePending={removePending}
                  onKeep={keepEdits}
                  onRevert={() => void revertEdits()}
                  colorTokens={colorTokens}
                  tokens={tokens}
                  onAssign={
                    onSendToChat && selection
                      ? () => {
                          setAssignForced(selection.nodeId);
                          setAssignDismissed((d) => (d === selection.nodeId ? null : d));
                        }
                      : undefined
                  }
                  owedScreenUpdates={owedScreenUpdates}
                  onSaveScreenUpdates={saveScreenUpdates}
                  onDismissScreenUpdate={dismissScreenUpdate}
                  move={moveBar}
                />
                )}
              </aside>
              {/* Resize the Design panel (like the IDE Explorer rail). */}
              <div
                role="separator"
                aria-label="Resize Design panel"
                onPointerDown={startPanelResize}
                className="w-1 flex-none cursor-col-resize bg-vs-border-default/40 hover:bg-vs-accent"
              />
              <div className="relative min-w-0 flex-1">
                {composeActive && (
                  <ComposePanel
                    compose={compose}
                    components={components}
                    onExtract={onComposeExtract}
                    onScreenUpdate={onComposeScreenUpdate}
                    onScreenLater={onComposeScreenLater}
                    onClose={onComposeClose}
                    getStoryUrl={storyUrlFor}
                    defaultAxis={bridge.placeholder?.target.axis ?? "row"}
                    onInsertSpecChange={(s) => bridge.setPlaceholderSpec(s.axis, s.slotCount)}
                  />
                )}
                {assignActive && onSendToChat && assignSelection && (
                  <AssignDialog
                    recognized={assignSelection.component}
                    recommended={assignSelection.resembles?.name ?? null}
                    components={components}
                    onAssign={onAssignComponent}
                    onExtract={onAssignExtract}
                    onClose={() => {
                      setAssignDismissed(assignSelection.nodeId);
                      setAssignForced((f) => (f === assignSelection.nodeId ? null : f));
                    }}
                    getStoryUrl={storyUrlFor}
                  />
                )}
                {bridge.dragMessage && (
                  <div
                    data-testid="drag-message"
                    className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-md border border-vs-border-default bg-vs-bg-elevated/95 px-3 py-1.5 text-[12px] text-vs-text-secondary shadow-lg backdrop-blur"
                  >
                    {bridge.dragMessage}
                  </div>
                )}
                <RunCanvas
                  src={embedUrl}
                  guestPreloadUrl={guestPreload}
                  bridge={bridge}
                  mode={mode}
                  onModeChange={setMode}
                  zoom={zoom}
                  onZoomBy={zoomBy}
                  onZoomReset={resetZoom}
                  onLiveEdit={applyLive}
                  onCommitEdit={commitStyleEdits}
                  onSendToChat={
                    onSendToChat && selection
                      ? () => onSendToChat(buildSelectionContext(selection, Object.values(pending)), selection.file)
                      : undefined
                  }
                  comments={{
                    threads: comments.threads,
                    anchorRects: bridge.anchorRects,
                    target: commentTarget,
                    activeId: comments.activeId,
                    collaborators: comments.collaborators,
                    notice: comments.notice,
                    onClearNotice: comments.clearNotice,
                    onSelectThread: comments.setActiveId,
                    onCreate: (body) => void onCreateComment(body),
                    onReply: (id, body) => void replyComment(id, body),
                    onResolve: (id, resolved) => void resolveComment(id, resolved),
                    onCancelTarget: clearCommentTarget,
                    onShare: () => void comments.share(),
                  }}
                />
              </div>
              {bridge.runtimeError && !doctorDismissed && (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4">
                  <div className="pointer-events-auto w-full max-w-xl">
                    <RunDoctor
                      kind="runtime"
                      error={`${bridge.runtimeError.message}${bridge.runtimeError.stack ? `\n${bridge.runtimeError.stack}` : ""}`}
                      file={relFileFromSource(bridge.runtimeError.source)}
                      env={envStatus}
                      envBusy={envBusy}
                      onCreateEnv={() => void createEnvFile()}
                      state={doctorState}
                      onFix={() => void fixWithClaude("runtime")}
                      onFixInAssistant={dispatchTask ? () => fixInAssistant("runtime") : undefined}
                      handedOff={doctorHandedOff}
                      onKeep={doctorKeep}
                      onRevert={() => void doctorRevert()}
                      onOpenSource={onSource}
                      onRestart={() => void doctorRestart()}
                      onDismiss={() => bridge.clearRuntimeError()}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : embedUrl ? (
            <div className="relative h-full min-h-[340px]">
              <iframe
                key={`${embedUrl}:${reloadNonce}`}
                title={noun}
                src={embedUrl}
                onLoad={() => setFrameLoading(false)}
                className="h-full min-h-[340px] w-full border-0 bg-white"
              />
              {frameLoading && (
                <div className="absolute inset-0 grid place-items-center bg-vs-bg-primary/60 text-xs text-vs-text-secondary">
                  Loading {noun}…
                </div>
              )}
            </div>
          ) : dev.state === "no-script" ? (
            <Centered>
              <div className="max-w-md text-center">
                <p className="text-sm font-semibold text-vs-text-primary">
                  {isApp ? "No app dev script found" : "No Storybook script found"}
                </p>
                <p className="mt-1 text-xs text-vs-text-muted">
                  {dev.message ??
                    (isApp
                      ? "Add a `dev` (or `start`/`preview`) script to package.json to run the app here."
                      : "Add a `storybook` script to package.json to run your component library here.")}
                </p>
              </div>
            </Centered>
          ) : dev.state === "error" ? (
            <Centered>
              <RunDoctor
                kind="startup"
                error={dev.message ?? "The dev server exited."}
                env={envStatus}
                envBusy={envBusy}
                onCreateEnv={() => void createEnvFile()}
                state={doctorState}
                onFix={() => void fixWithClaude("startup")}
                onFixInAssistant={dispatchTask ? () => fixInAssistant("startup") : undefined}
                handedOff={doctorHandedOff}
                onKeep={doctorKeep}
                onRevert={() => void doctorRevert()}
                onOpenSource={onSource}
                onRestart={() => void doctorRestart()}
                onDismiss={() => void start()}
              />
            </Centered>
          ) : isApp ? (
            <Centered>
              <div className="flex max-w-md flex-col items-center gap-2 text-center">
                <span className="text-2xl" aria-hidden>
                  📄
                </span>
                <p className="text-sm font-semibold text-vs-text-primary">
                  This is your Playground — where your pages preview.
                </p>
                <p className="text-xs leading-relaxed text-vs-text-muted">
                  You don’t have any pages yet. Once your components are built, just describe the page you want in the{" "}
                  <b>Chat sidebar</b> — it’s composed from your design-system components and appears here live. No
                  forms or buttons to hunt for; you create pages by asking.
                </p>
                <Button variant="primary" className="mt-2" onClick={() => void start()}>
                  Start app
                </Button>
              </div>
            </Centered>
          ) : (
            <Centered>
              <div className="text-center">
                <p className="text-sm text-vs-text-secondary">Run Storybook to browse your components live.</p>
                <Button variant="primary" className="mt-3" onClick={() => void start()}>
                  Start Storybook
                </Button>
              </div>
            </Centered>
          )}
        </div>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[340px] items-center justify-center gap-2 p-12 text-sm text-vs-text-secondary">
      {children}
    </div>
  );
}

function RefreshIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 5.5A7 7 0 1 0 17 10" />
      <path d="M17 3v3.5h-3.5" />
    </svg>
  );
}
