import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DevServerStatus, Project, InspectorToken, InspectorComponent, FileSnapshot, StorybookEntry } from "@vortspec/core/ipc";
import { buildSelection, alignToCss, flowToCss, gapModeCss } from "@vortspec/core/selection-builder";
import { sizeModeCss, SIZE_MODE_LABEL } from "@vortspec/core/sizing";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";
import { DesignPanel, ChangesBar } from "../components/run-canvas/DesignPanel";
import { FigmaMcpBanner } from "../components/FigmaMcpBanner";
import { StorybookSidebar } from "../components/run-canvas/StorybookSidebar";
import { Sitemap } from "../components/run-canvas/Sitemap";
import type { RouteDiscovery, RouteNode, Rect } from "@vortspec/core/ipc";
import { RunCanvas } from "../components/run-canvas/RunCanvas";
import { Logo } from "../components/Logo";
import { buildConvertToFrameworkPrompt } from "@vortspec/core/light-page";
import { viewportsFromTokens, appliesInViewport, type ViewportId, type DeviceFrameKind } from "../components/run-canvas/viewports";
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
import { routeEdits, coalesceDeterministic, type DeterministicEdit } from "../components/run-canvas/edit-plan";
import { buildProjection, validateProjection, treeParityIssues, projectionToBridgeTree } from "../components/run-canvas/node-tree";
import { createAutoPersist } from "../components/run-canvas/auto-persist";
import { parseAnchor, type CanvasEdit } from "@vortspec/core/canvas-edit";
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
import { FigmaBridgePanel } from "../components/run-canvas/FigmaBridgePanel";
import { buildSendScreenPrompt, buildPullScreenPrompt, parseSendResult } from "@vortspec/core/figma-screen-prompts";

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
  assistantBusy = false,
  sidebarSlot,
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
  /** The right-sidebar assistant is running (IDE) — drives the page "AI is working" skeleton. */
  assistantBusy?: boolean;
  /** When the host provides a left-dock slot (IDE unified sidebar), the Design/Layers panel
   *  is PORTALED there instead of rendered inline, so the canvas fills the center. Omit
   *  (desktop) to keep the inline sidebar. */
  sidebarSlot?: HTMLElement | null;
}): React.JSX.Element {
  const [dev, setDev] = useState<DevServerStatus>({ state: "stopped", url: null, script: null, message: null });
  const [frameLoading, setFrameLoading] = useState(true);
  // Storybook (kind=storybook): the story index drives a VortSpec nav in the left dock's
  // Section tab, so the embedded Storybook shows just the story (no in-iframe sidebar).
  const [storyId, setStoryId] = useState<string | null>(null);
  // Story vs docs view for the canvas iframe — mirrors what the native sidebar selected.
  const [storyViewMode, setStoryViewMode] = useState<"story" | "docs">("story");
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

  // ── Sitemap: the app's page/route tree, read from source (change: sitemap-tree) ──
  const [routes, setRoutes] = useState<RouteDiscovery | null>(null);
  const [currentPath, setCurrentPath] = useState("/");
  // Selected LIGHT page (from a `light://` sitemap node) — rendered in the editable light canvas
  // instead of navigating the app webview (light-design-system).
  const [lightPage, setLightPage] = useState<string | null>(null);
  const [lightPageHtml, setLightPageHtml] = useState("");
  // The served URL for the current light page — loaded into the RunCanvas webview (light-pages-on-canvas).
  const [lightPageSrc, setLightPageSrc] = useState("");
  const [liteStandIns, setLiteStandIns] = useState<{ component: string; variant: string; html: string }[]>([]);
  const [liteReadiness, setLiteReadiness] = useState<Record<string, "light-only" | "framework-ready">>({});

  // A light page is edited in the SAME canvas: it's served from a local origin and loaded into the
  // RunCanvas webview with the guest bridge, exactly like a framework page — so every left-sidebar
  // control works on it. The canvas src is the served light-page URL for a light page, else the dev URL.
  const isLightPage = !!lightPage;
  const canvasSrc = isLightPage ? lightPageSrc : embedUrl;
  const canvasReady = canvas && isApp && !!canvasSrc;
  // The source file of the page currently on screen — grounds canvas Apply so the agent
  // edits the previewed page (not index.html's mount shell) when an element has no known
  // component file of its own. Walks the route tree for the node at `currentPath`.
  const currentPageFile = useMemo(() => {
    const roots = routes?.routes ?? [];
    const find = (nodes: RouteNode[]): string | null => {
      for (const n of nodes) {
        if (n.path === currentPath && n.file) return n.file;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(roots) ?? roots[0]?.file ?? null;
  }, [routes, currentPath]);
  const rediscoverRoutes = useCallback(() => {
    void api.discoverRoutes(project.path).then(setRoutes);
  }, [project.path]);
  // How many navigable/light pages the project has — 0 ⇒ a brand-new project with nothing to preview yet,
  // which the Playground answers with a big "create from the chat" message instead of a dev-server error.
  const pageCount = useMemo(() => {
    if (!routes) return 0;
    let n = 0;
    const walk = (ns: RouteNode[]): void => ns.forEach((r) => ((r.navigable || r.light) && n++, walk(r.children)));
    walk(routes.routes);
    return n;
  }, [routes]);
  useEffect(() => {
    if (!canvas) return;
    let alive = true;
    void api.discoverRoutes(project.path).then((r) => alive && setRoutes(r));
    return () => {
      alive = false;
    };
  }, [canvas, project.path]);

  // Keep the site tree fresh: route discovery is a read-only source scan, but it only ran
  // on mount — so a page the assistant just created never appeared in the sitemap until the
  // project was reopened. Re-discover whenever the sidebar assistant finishes a turn
  // (busy → idle), so a new page/route shows up (and becomes navigable) right away.
  const wasAssistantBusy = useRef(false);
  useEffect(() => {
    if (!canvas) return;
    if (wasAssistantBusy.current && !assistantBusy) rediscoverRoutes();
    wasAssistantBusy.current = assistantBusy;
  }, [assistantBusy, canvas, rediscoverRoutes]);

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
      // A light page has no URL — render it in the light canvas instead of navigating the webview.
      if (path.startsWith("light://")) {
        setLightPage(path.slice("light://".length));
        setCurrentPath(path);
        return;
      }
      setLightPage(null);
      if (!dev.url) return;
      const url = new URL(path.startsWith("/") ? path.slice(1) : path, dev.url.replace(/\/+$/, "") + "/").href;
      bridge.loadUrl(url);
      setCurrentPath(path);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dev.url, bridge.loadUrl],
  );

  // Load the selected light page: its served URL (loaded into the canvas webview) + its standins/readiness.
  useEffect(() => {
    if (!lightPage) {
      setLightPageHtml("");
      setLightPageSrc("");
      return;
    }
    let alive = true;
    // Serve the page and point the canvas webview at it — the guest bridge instruments it like any page.
    void api.litePageUrl(project.path, lightPage).then((u) => alive && setLightPageSrc(u)).catch(() => alive && setLightPageSrc(""));
    void api.liteReadPage(project.path, lightPage).then((h) => alive && setLightPageHtml(h));
    void api.liteStandIns(project.path).then((s) => alive && setLiteStandIns(s)).catch(() => alive && setLiteStandIns([]));
    void api
      .liteReadiness(project.path)
      .then((r) => alive && setLiteReadiness(Object.fromEntries(r.map((c) => [c.name, c.readiness]))))
      .catch(() => alive && setLiteReadiness({}));
    return () => {
      alive = false;
    };
  }, [lightPage, project.path]);

  // Tell the guest bridge whether this is a light page (drop targets skip the data-source dev-stamp
  // requirement — a light page's DOM IS its source). Re-sent when the page kind changes OR the bridge
  // re-attaches (a webview load resets the guest's flag).
  useEffect(() => {
    if (bridge.ready) bridge.setLightMode(isLightPage);
  }, [isLightPage, bridge.ready, bridge.setLightMode]);

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
  // Playground viewport (Desktop/Tablet/Mobile) + device frame. Breakpoint widths come
  // from the project's Figma breakpoint variables (synced as tokens) when present, else
  // standard defaults. Auto-fit inside RunCanvas replaced the old manual zoom.
  const [viewportId, setViewportId] = useState<ViewportId>("desktop");
  const [frame, setFrame] = useState<DeviceFrameKind>("iphone");
  // Project color tokens for the Figma-style color picker (Libraries tab).
  const colorTokens = useMemo(
    () => tokens.filter((t) => t.type === "color").map((t) => ({ name: t.name, value: t.resolvedValue })),
    [tokens],
  );
  // Breakpoint widths sourced from the project's Figma breakpoint variables (tokens), with
  // standard defaults; `viewport` is the resolved current one handed to the canvas.
  const viewports = useMemo(
    () => viewportsFromTokens(tokens.map((t) => ({ name: t.name, resolvedValue: t.resolvedValue }))),
    [tokens],
  );
  const viewport = viewports[viewportId];

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

  // Instant deterministic edits (change: instant-playground-edits): when the dev source-stamp
  // is present, a variant/text/delete edit is written to source in the BACKGROUND — no Apply,
  // no AI. Un-stamped or freeform-style edits fall through to the gated `pending`/Apply flow.
  const persistQueue = useRef<DeterministicEdit[]>([]);
  // Token-VALUE edits (change a token's value — deterministic, already committed via setTokenValue)
  // ride the same instant lane: no Apply. A token binding (`var(--x)`) is a source edit and stays
  // on the gated path.
  const tokenQueue = useRef<{ token: string; value: string }[]>([]);
  // A background write failed or was withheld — the change is still shown; surfaced as a notice.
  const [writeError, setWriteError] = useState<string | null>(null);
  // Undo/redo for the instant edits (change: instant-playground-edits, task 4.3). Every background
  // write returns a pre-edit snapshot; one persist FLUSH pushes one combined entry, so Cmd/Ctrl+Z
  // rolls back the whole debounced burst (Instatic-style autosave undo). No Apply gate — this IS
  // the safety net that replaces it. Redo re-captures the post-edit state at undo time.
  const undoStack = useRef<FileSnapshot[][]>([]);
  const redoStack = useRef<FileSnapshot[][]>([]);
  const MAX_HISTORY = 50; // cap undo/redo depth so a long session can't grow snapshots unbounded
  const autoPersist = useMemo(
    () =>
      createAutoPersist({
        debounceMs: 400,
        persist: async () => {
          const q = persistQueue.current;
          persistQueue.current = [];
          const tq = tokenQueue.current;
          tokenQueue.current = [];
          const undoEntry: FileSnapshot[] = [];
          const remember = (snap: FileSnapshot[]): void => {
            for (const s of snap) if (!undoEntry.some((e) => e.path === s.path)) undoEntry.push(s);
          };
          // Token-value edits first: snapshot the token scope ONCE (its pre-burst state, for undo),
          // then commit each deterministically to the token file. HMR reflects the new value.
          if (tq.length > 0) {
            remember(await api.snapshotTokenScope(project.path).catch(() => [] as FileSnapshot[]));
            for (const t of tq) {
              try {
                const r = await api.setTokenValue(project.path, t.token, t.value);
                setTokens(r.tokens);
                setWriteError(null);
              } catch {
                setWriteError("Couldn't save the token change to source — it's still shown.");
              }
            }
          }
          // RT-3: apply the burst BOTTOM-UP (highest anchor line first). A structural edit (delete /
          // insert / list op) shifts the line numbers BELOW it; the anchors were all captured before
          // the flush, so applying a lower-line edit first would leave the higher-line ones stale and
          // hit the wrong node. Editing from the bottom up means each edit lands before anything above
          // it can shift it. Cross-file edits don't interact, so a single descending-line sort is safe.
          const ordered = coalesceDeterministic(q).sort((a, b) => b.edit.anchor.line - a.edit.anchor.line);
          for (const it of ordered) {
            const r = await api
              .writeCanvasEdit(project.path, it.file, it.edit, it.expect)
              .catch(() => ({ ok: false as const, reason: "Couldn't write the change to source." }));
            // ok:false = the anchor wasn't statically resolvable (e.g. inside a list) — the
            // deterministic write is withheld; the optimistic change stays on screen.
            if (r && r.ok === false) setWriteError(r.reason ?? "This element can't be edited in place — try the assistant.");
            else {
              setWriteError(null);
              // First capture of each file across the flush = its true pre-burst content.
              if (r && r.ok && r.snapshot) remember(r.snapshot);
            }
          }
          if (undoEntry.length > 0) {
            undoStack.current.push(undoEntry);
            if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift(); // bound memory
            redoStack.current = []; // a fresh edit invalidates the redo trail
          }
        },
        onError: () => setWriteError("Couldn't save a change to source — it's still shown. Try again, or use the assistant."),
      }),
    [project.path],
  );
  useEffect(() => () => autoPersist.dispose(), [autoPersist]);
  // DR-1 (instatic-node-tree): the projected node tree, kept in sync with the bridge's structure
  // snapshot. Nothing routes through it yet — a dev-only parity assertion proves it stays a
  // well-formed tree (task 1.4) before later stages route reads/writes through it.
  const projection = useMemo(() => buildProjection(bridge.structure), [bridge.structure]);
  useEffect(() => {
    // Dev-only (the ui package's tsconfig doesn't pull Vite's import.meta.env types — cast safely).
    const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
    if (!dev) return;
    const issues = validateProjection(projection);
    if (issues.length) console.warn("[node-tree] projection parity issues:", issues.slice(0, 8));
    const layers = treeParityIssues(bridge.tree, projection);
    if (layers.length) console.warn("[node-tree] Layers parity vs bridge.tree:", layers.slice(0, 8));
  }, [projection, bridge.tree]);
  // Stage 2.1: the Layers panel reads from the PROJECTION when it's proven equivalent to bridge.tree
  // (the two guest walks could filter differently); otherwise fall back — a self-healing swap that
  // can't regress. This makes the projection the single tree the Layers render from in the common case.
  const layersTree = useMemo(
    () =>
      projection.byId.size > 0 && treeParityIssues(bridge.tree, projection).length === 0
        ? projectionToBridgeTree(projection)
        : bridge.tree,
    [bridge.tree, projection],
  );
  // Create a design token from a field's current literal value, then let the field bind to it
  // (change: instant-playground-edits). Bootstraps the token file + import on first use. The bind
  // itself (var(--name)) writes inline to source via the instant style lane — no Apply. Throws a
  // human message (bad name / duplicate) that the picker surfaces.
  const createTokenForField = useCallback(
    async (name: string, value: string): Promise<void> => {
      const r = await api.createToken(project.path, name, value);
      setTokens(r.tokens);
    },
    [project.path],
  );
  const [review, setReview] = useState(false);
  // Set when an Apply run finished but edited NO source file — the change is still
  // preview-only, so we keep the pending edits and tell the user instead of falsely
  // entering review (which would "revert" on Keep once the live override is dropped).
  const [applyMiss, setApplyMiss] = useState(false);
  // The agent's own explanation for why it changed no file (its final message) — surfaced
  // in the warning so "why didn't it apply?" is answered concretely, not generically.
  const [applyMissReason, setApplyMissReason] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const structuralMod = useAgentRun();
  // The reload Apply triggers to show the source change must NOT be treated as a
  // "returned to the Playground" event — otherwise the replay re-attaches the very edits
  // being applied, fails, and reports a bogus "couldn't reattach". Refs (not deps) so the
  // reload effect reads the latest value without re-subscribing.
  const applyingRef = useRef(false);
  const reviewRef = useRef(false);
  useEffect(() => {
    applyingRef.current = applying;
  }, [applying]);
  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  // ── Screen preview: install a dev-only harness so state-navigated screens (no URL)
  // can be rendered standalone via `?screen=<Name>`. A gated Claude Code run adds the
  // harness + a manifest; on completion we re-discover so those screens become navigable.
  const screenPreviewMod = useAgentRun();
  const enableScreenPreview = useCallback(() => {
    // Every state-navigated screen in the tree — both already-registered (`?param=`) and
    // not-yet-registered (`#screen/`) — so a re-run to pick up NEW screens rewrites the
    // manifest with the FULL set instead of dropping the ones already there.
    const param = routes?.screenPreview?.param ?? "screen";
    const screens = (routes?.routes[0]?.children ?? [])
      .filter((c) => !!c.file && (c.path.startsWith("#screen/") || c.path.startsWith("?")))
      .map((c) => c.file as string);
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
        `3. Create the manifest file \`.vortspec/screen-preview.json\` with EXACTLY this shape: { "param": "${param}", "screens": [ { "name": "<ComponentName>", "file": "<src/screens/File.tsx>" } ] }. Register ONE entry per screen COMPONENT (name = the component/screen name). Do NOT fan a single component out into multiple entries for its DATA variants — a product-detail screen shown for many products, or a screen with device/theme variants, is ONE entry, not one per product/variant. (Per-variant screens are a choice the user makes during screen creation, not something to auto-generate here.) If the harness/manifest ALREADY exists, EXTEND both — keep every screen already handled/listed and add the ones below that are missing; NEVER drop an existing screen.`,
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

  // State-navigated screens that exist but aren't yet reachable from the site tree — they
  // render as "open source" rows (`#screen/…`), not a `?screen=` deep-link. New screens the
  // assistant adds land here until the harness + manifest are (re)generated to include them.
  const unregisteredScreens = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: RouteNode[]): void => {
      for (const n of nodes) {
        if (n.path.startsWith("#screen/") && n.file) out.push(n.file);
        walk(n.children);
      }
    };
    walk(routes?.routes ?? []);
    return out;
  }, [routes]);

  // Auto-provision + KEEP IN SYNC (like Storybook): the first time state-navigated screens
  // have no reachable deep-link, install the harness silently; and whenever the assistant adds
  // NEW screens (the unregistered set grows), re-run it so the manifest + entry include them and
  // every created page becomes reachable from the site tree. Keyed on the EXACT unregistered set
  // (not once per project) so it re-runs on genuinely new screens but never loops on the same
  // set — a screen the harness can't render stays put without retrying (the sitemap keeps a
  // manual retry). Router apps have no `screenPreview` and are skipped (they use real routes).
  const provisionedKey = useRef<string>("");
  useEffect(() => {
    if (!canvas) return;
    if (!routes?.screenPreview) return;
    if (unregisteredScreens.length === 0 || screenPreviewMod.running) return;
    const key = `${project.path}::${[...unregisteredScreens].sort().join("|")}`;
    if (provisionedKey.current === key) return;
    provisionedKey.current = key;
    enableScreenPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, unregisteredScreens, canvas, project.path]);
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
    // Skip when an Apply is in flight / under review: that reload is us writing these
    // edits to source, not a fresh return — replaying them here would falsely orphan them.
    if (edits.length && !applyingRef.current && !reviewRef.current) bridge.replayOverrides(edits);
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

  // ── Send to Figma round-trip (change: add-screen-to-figma) ──────────────────
  // The bottom-toolbar Figma button sends the previewed screen to Figma as DS-linked
  // component instances (via the user's own Figma MCP — no strictMcp, bypassPermissions), and
  // "Pull changes back" reads the mapped node and edits the screen source under an Apply-style
  // Keep/Revert review. VortSpec never calls Figma directly — the run does the work and reports
  // back the ids we persist in `.vortspec/maps/screens.json`.
  const figmaMod = useAgentRun();
  const [figmaConnected, setFigmaConnected] = useState(false);
  const [figmaPhase, setFigmaPhase] = useState<"idle" | "sending" | "sent" | "pulling" | "review" | "error">("idle");
  const [figmaResult, setFigmaResult] = useState<{ url?: string; nodeId: string } | null>(null);
  // The current screen's existing Figma frame (from the map) — enables Open + Pull.
  const [figmaScreen, setFigmaScreen] = useState<{ nodeId: string; fileKey: string } | null>(null);
  const [figmaSnap, setFigmaSnap] = useState<FileSnapshot[] | null>(null);
  // Resolve WHICH screen to send — the one on screen, and NEVER the app entry. For a
  // state-navigated app the entry (routes.routes[0].file, e.g. src/main.tsx) is not a screen:
  // if the user hasn't navigated to a specific screen (currentPath "/"), fall back to the app's
  // default — the first navigable screen. `key` is the stable map key; `label` grounds the prompt.
  const sendTarget = useMemo((): { file: string; key: string; label: string } | null => {
    const roots = routes?.routes ?? [];
    const stateApp = !!routes?.screenPreview;
    const entryFile = stateApp ? (roots[0]?.file ?? null) : null;
    const findAt = (nodes: RouteNode[]): RouteNode | null => {
      for (const n of nodes) {
        if (n.path === currentPath && n.file) return n;
        const hit = findAt(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const cur = findAt(roots);
    if (cur?.file && cur.file !== entryFile) return { file: cur.file, key: cur.path, label: cur.label || cur.path };
    if (stateApp) {
      const first = (roots[0]?.children ?? []).find((c) => !!c.file);
      if (first?.file) return { file: first.file, key: first.path, label: first.label || first.path };
    }
    if (currentPageFile && currentPageFile !== entryFile)
      return { file: currentPageFile, key: currentPath, label: currentPath };
    return null;
  }, [routes, currentPath, currentPageFile]);
  const screenKey = sendTarget?.key ?? currentPath;
  const figmaPhaseRef = useRef(figmaPhase);
  figmaPhaseRef.current = figmaPhase;

  // Figma connectivity (figma-cli OR the user's Figma MCP), like the Inspector token push.
  useEffect(() => {
    if (!canvas) return;
    let alive = true;
    void Promise.all([
      api.figmaEnsureConnected().catch(() => null),
      api.verifyFigmaMcp().catch(() => null),
    ]).then(([cli, mcp]) => {
      if (alive) setFigmaConnected(!!cli?.connected || mcp?.status === "pass");
    });
    return () => {
      alive = false;
    };
  }, [canvas, project.path]);

  // Load the current screen's Figma mapping (drives Open + Pull). Re-reads after a round-trip.
  useEffect(() => {
    if (!canvas) return;
    let alive = true;
    void api
      .screenMapGet(project.path)
      .then(({ map }) => {
        if (!alive) return;
        const e = map.screens[screenKey];
        setFigmaScreen(e && map.figmaFileKey ? { nodeId: e.figmaNodeId, fileKey: map.figmaFileKey } : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canvas, project.path, screenKey, figmaPhase]);

  const figmaOpenUrl = useMemo((): string | null => {
    if (figmaResult?.url) return figmaResult.url;
    if (figmaScreen)
      return `https://www.figma.com/design/${figmaScreen.fileKey}/?node-id=${figmaScreen.nodeId.replace(":", "-")}`;
    return null;
  }, [figmaResult, figmaScreen]);

  async function sendToFigma(): Promise<void> {
    const t = sendTarget;
    if (!t) return;
    setFigmaResult(null);
    setFigmaPhase("sending");
    const { map, targetFileKey } = await api.screenMapGet(project.path);
    const existing = map.screens[t.key];
    await figmaMod.start({
      prompt: buildSendScreenPrompt({
        file: t.file,
        previewUrl: embedUrl || null,
        fileKey: targetFileKey,
        nodeId: existing?.figmaNodeId ?? null,
        screenLabel: t.label,
      }),
      cwd: project.path,
      // MCP tools (Figma) are auto-denied headless without this; NO strictMcp → the user's Figma MCP is reachable.
      bypassPermissions: true,
      // The main process records the mapping on completion — survives leaving the Playground mid-send.
      meta: { kind: "figma-send", label: `Send ${t.label} to Figma`, figmaSend: { screenKey: t.key, file: t.file } },
    });
  }

  async function pullFromFigma(): Promise<void> {
    const t = sendTarget;
    if (!t) return;
    const { map } = await api.screenMapGet(project.path);
    const entry = map.screens[t.key];
    if (!entry || !map.figmaFileKey) return;
    const snap = await api.snapshotComponent(project.path, t.file).catch(() => [] as FileSnapshot[]);
    setFigmaSnap(snap);
    setFigmaPhase("pulling");
    await figmaMod.start({
      prompt: buildPullScreenPrompt({ file: t.file, fileKey: map.figmaFileKey, nodeId: entry.figmaNodeId, screenLabel: t.label }),
      cwd: project.path,
      bypassPermissions: true,
    });
  }

  // Resolve the run outcome by the phase it was started in.
  useEffect(() => {
    if (figmaMod.model.status === "error") {
      if (figmaPhaseRef.current === "sending" || figmaPhaseRef.current === "pulling") setFigmaPhase("error");
      return;
    }
    if (figmaMod.model.status !== "done") return;
    if (figmaPhaseRef.current === "sending") {
      const m = figmaMod.model;
      const text = m.result?.text ?? [...m.messages].reverse().find((x) => x.role === "assistant")?.text ?? "";
      const r = parseSendResult(text);
      if (r) {
        setFigmaResult({ url: r.url, nodeId: r.nodeId });
        void api.screenMapUpsert(
          project.path,
          screenKey,
          { file: sendTarget?.file ?? screenKey, figmaNodeId: r.nodeId, updatedAt: new Date().toISOString() },
          r.fileKey,
        );
        setFigmaPhase("sent");
      } else {
        setFigmaPhase("error");
      }
    } else if (figmaPhaseRef.current === "pulling") {
      setFigmaPhase("review");
      bridge.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaMod.model.status]);

  function figmaKeep(): void {
    setFigmaPhase("idle");
    setFigmaSnap(null);
    figmaMod.reset();
    bridge.reload();
  }
  async function figmaRevert(): Promise<void> {
    if (figmaSnap && figmaSnap.length) await api.restoreFiles(project.path, figmaSnap);
    setFigmaPhase("idle");
    setFigmaSnap(null);
    figmaMod.reset();
    bridge.reload();
  }
  function figmaDismiss(): void {
    setFigmaPhase("idle");
    figmaMod.reset();
  }
  const figmaToolbarStatus: "idle" | "sending" | "sent" | "error" =
    figmaPhase === "sending" || figmaPhase === "pulling"
      ? "sending"
      : figmaPhase === "sent"
        ? "sent"
        : figmaPhase === "error"
          ? "error"
          : "idle";

  // "AI is working" skeleton over the preview (change: canvas-ai-skeleton). A component
  // being built into a KNOWN slot shimmers in place (block); anything page-wide — an Apply
  // writing source, the screen-preview harness, a slot-less build, or the chat assistant
  // working this project — gets the animated gradient overlay.
  const skeleton = useMemo((): { mode: "page"; label?: string } | { mode: "block"; rect: Rect; label?: string } | null => {
    if (compose.phase === "generating" && bridge.placeholder?.rect) {
      return { mode: "block", rect: bridge.placeholder.rect, label: "Building component…" };
    }
    if (applying) return { mode: "page", label: "Applying your changes…" };
    if (compose.phase === "generating" || screenPreviewMod.model.status === "running") {
      return { mode: "page", label: "Building…" };
    }
    if (figmaMod.model.status === "running") {
      return { mode: "page", label: figmaPhase === "pulling" ? "Pulling from Figma…" : "Sending to Figma…" };
    }
    if (assistantBusy) return { mode: "page", label: "AI is working…" };
    return null;
  }, [compose.phase, bridge.placeholder, applying, screenPreviewMod.model.status, figmaMod.model.status, figmaPhase, assistantBusy]);

  // ── Live drag-and-drop move (§5.8) ────────────────────────────────────────
  // Behind a feature flag (Decision 3): when off, a drag is simply never opened as
  // a move and inspect works as before.
  const dragMoveEnabled = true;
  const move = useDragMove({
    project,
    bridge,
    // RT-5: an AI-reconciled move is undoable too — push its pre-move snapshot onto the shared stack.
    onCommitted: (preMoveSnapshot) => {
      if (preMoveSnapshot.length === 0) return;
      undoStack.current.push(preMoveSnapshot);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
    },
  });
  // A completed drop over a valid slot opens the gated move. The dragged element was
  // the selected node, so its label grounds the origin anchor; the drop clears once
  // consumed so a re-render can't re-open it.
  const selectionRefForMove = useRef(selection);
  selectionRefForMove.current = selection;
  useEffect(() => {
    if (!dragMoveEnabled || !bridge.dragDrop || move.phase !== "idle") return;
    const drop = bridge.dragDrop;
    bridge.clearDragDrop();
    void handleDrop(drop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.dragDrop]);
  async function handleDrop(drop: NonNullable<typeof bridge.dragDrop>): Promise<void> {
    // Light page: the ephemeral move is ALREADY applied to the guest DOM, and the DOM IS the source —
    // so there's no ts-morph reconcile and no data-source to require. Keep the move (forget the guest's
    // revert tracking) and persist the serialized DOM. Never fall through to the refuse/reconcile below.
    if (isLightPageRef.current) {
      bridge.clearMove();
      schedulePersistLight();
      return;
    }
    // FLUSH pending deterministic writes first, so a move — deterministic OR the AI reconcile — sees
    // the CURRENT source. Without this, editing an element then immediately moving it snapshots stale
    // source (the debounced text/style write hasn't landed), and the AI reports "the element doesn't
    // exist" because it's looking for the live text that isn't in source yet.
    await autoPersist.flush().catch(() => {});
    // Non-deterministic move (cross-file, a list/conditional, or an un-stamped element): there's no
    // single JSX node to relocate statically, so run the AI reconcile AUTOMATICALLY in the
    // background — no Keep gate (the user asked for every edit to just apply). The element is already
    // moved live; onDrop registers it and keep() reconciles source + auto-accepts + reloads.
    const autoReconcile = (): void => {
      setWriteError(null);
      move.onDrop(
        {
          fingerprint: drop.sourceFingerprint,
          label: drop.sourceLabel || selectionRefForMove.current?.label || "the selected element",
          text: drop.sourceText,
        },
        drop.target!,
      );
      void move.keep(); // auto-accept — don't wait for a Keep click
    };
    // Write a deterministic move/reorder in the background; on any withhold/failure, fall back to
    // the auto-reconcile (no Keep gate either way).
    const applyMoveEdit = (file: string, edit: CanvasEdit): void => {
      void api
        .writeCanvasEdit(project.path, file, edit)
        .then((r) => {
          if (!r.ok) {
            autoReconcile();
            return;
          }
          if (r.snapshot) {
            undoStack.current.push(r.snapshot);
            redoStack.current = [];
          }
          bridge.clearMove();
          bridge.reload();
          setWriteError(null);
        })
        .catch(() => autoReconcile());
    };
    const src = parseAnchor(drop.sourceDataSource);
    const tgt = drop.target ? parseAnchor(drop.target.anchorDataSource) : null;

    // Same-list REORDER (deterministic): the dragged row and the drop anchor are rows of the SAME
    // map (identical template data-source) → reorder the backing LOCAL array by index, no AI. This
    // is the "if I move one thing I might be moving more" case — editing the data, not one node.
    if (
      drop.target &&
      src &&
      drop.sourceListIndex != null &&
      drop.target.anchorListIndex != null &&
      drop.sourceDataSource &&
      drop.sourceDataSource === drop.target.anchorDataSource
    ) {
      const from = drop.sourceListIndex;
      const at = drop.target.anchorListIndex;
      let to = drop.target.position === "before" ? at : at + 1;
      if (from < to) to -= 1; // removing `from` (before the target) shifts the target left
      applyMoveEdit(src.file, { op: "listReorder", anchor: src.anchor, from, to });
      return;
    }

    // The origin isn't locatable, or the drop target isn't an editable JSX element (e.g. index.html's
    // #root mount point, a portal, a lib-rendered node — no data-source). There is nowhere to write
    // this move: REFUSE it (undo the live move + a short notice) rather than hand a dead-end to the
    // assistant, which would just fail with a wall of text. (The guest also stops offering such
    // targets, so this is mostly a safety net.)
    if (!src || !drop.target || !tgt) {
      bridge.revertMove();
      setWriteError("You can't move it there — drop it onto an element inside your page.");
      return;
    }
    // Same file → DETERMINISTIC move, no AI. Different files but both editable JSX → genuinely needs
    // the assistant to relocate across components; auto-reconcile in the background (no Keep gate).
    if (src.file === tgt.file) {
      applyMoveEdit(src.file, { op: "move", anchor: src.anchor, to: tgt.anchor, position: drop.target.position });
      return;
    }
    autoReconcile();
  }
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
    // Only a genuine return-replay orphans edits; an Apply/review reload never should.
    if (missing > 0 && !applyingRef.current && !reviewRef.current) setOrphanCount(missing);
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
      .map((e) => `${e.elementLabel ? `${e.elementLabel}: ` : ""}${e.label ?? e.key} → ${e.value}`)
      .join("; ");
    if (onSendToChat && list) {
      onSendToChat(
        `Apply these visual edits I made in the canvas — find the right element in the page source and change it: ${list}. Make the minimal change and preserve existing design-token usage.`,
        null,
      );
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
          // Light page: the ephemeral move is already in the guest DOM — persist the serialized DOM.
          // (move.keep() still clears the gate; its ts-morph reconcile no-ops with no React source file.)
          onKeep: () => {
            if (isLightPageRef.current) schedulePersistLight();
            void move.keep();
          },
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
  // Current viewport + pending ledger as refs — read inside commitEdits / the re-scope
  // effect without stale closures or re-subscribing.
  const viewportIdRef = useRef(viewportId);
  viewportIdRef.current = viewportId;
  // light-pages-on-canvas: pages edited in the Playground are ALWAYS light now. Their edits apply live to
  // the guest DOM (overrides + ephemeral moves); we persist by serializing that DOM back to the .html (the
  // DOM IS the source) — never the ts-morph React path. Refs so the debounced writer reads fresh values.
  const isLightPageRef = useRef(isLightPage);
  isLightPageRef.current = isLightPage;
  const lightPageRef = useRef(lightPage);
  lightPageRef.current = lightPage;
  const lightPersistTimer = useRef<number | undefined>(undefined);
  const schedulePersistLight = useCallback(() => {
    if (!isLightPageRef.current) return;
    window.clearTimeout(lightPersistTimer.current);
    lightPersistTimer.current = window.setTimeout(() => {
      const name = lightPageRef.current;
      if (!name) return;
      void bridge.serializeDom().then((html) => {
        if (html != null) void api.liteWritePage(project.path, name, html);
      });
    }, 500);
  }, [bridge, project.path]);

  // Re-scope live overrides when the viewport changes (responsive preview): a mobile/tablet
  // edit renders only in its own viewport — matching how it commits to source — so switching
  // views clears every override and re-applies just those that apply at the new breakpoint. A
  // viewport switch only resizes the webview (no reload), so node ids stay valid.
  useEffect(() => {
    // A light page has no per-viewport source edits and its edits live in the DOM (persisted on save),
    // NOT in `pending` — so clearing overrides here would just WIPE the user's edits on a viewport switch.
    // Skip the re-scope entirely for a light page; its single DOM applies at every viewport.
    if (isLightPageRef.current) return;
    bridge.clearOverride();
    for (const e of Object.values(pendingRef.current)) {
      if (!e.nodeId || !appliesInViewport(e.viewport, viewportId)) continue;
      if (e.css && Object.keys(e.css).length > 0) applyOverride(e.nodeId, e.css);
      else if (e.key === "content") setText(e.nodeId, e.value);
      else if (e.kind === "variant") setClass(e.nodeId, e.removeClasses ?? [], e.addClasses ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportId]);
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
      schedulePersistLight(); // light page: the live override IS the edit — persist the serialized DOM
    },
    [applyOverride, schedulePersistLight],
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
        remove?: boolean;
        label?: string;
      }[],
      forceStyle = false,
    ) => {
      const sel = selectionRef.current;
      if (!sel) return;
      // A light page persists by serializing the live guest DOM (the edit is already applied there via the
      // override/text/move) — the ts-morph React source path below never runs for it.
      if (isLightPageRef.current) {
        schedulePersistLight();
        return;
      }
      const fp = readoutRef.current?.fingerprint || undefined;
      const nodeId = selectedIdRef.current ?? undefined;
      const text = readoutRef.current?.text ?? null;
      const elementKey = fp || nodeId || "•";
      const uses = (n: string): number => tokensRef.current.find((t) => t.name === n)?.uses ?? 0;
      // Build each edit, then route it: a deterministic-capable edit (variant/text/delete) on a
      // stamped element writes to source in the BACKGROUND (no Apply, no AI); everything else
      // stays in the gated `pending`/Apply ledger. The optimistic live override is already applied
      // by the caller, so the preview is instant either way.
      const built: PendingEdit[] = edits.map((e) => {
        const edit = classifyFieldEdit(sel, e.key, e.value, e.cssProps, uses, forceStyle, e.css, e.token);
        return {
          ...edit,
          // Key by element + field so the SAME property on two elements doesn't collide.
          id: `${elementKey}::${edit.key}`,
          label: e.label ?? edit.label,
          fingerprint: fp,
          nodeId,
          // A deletion removes the USAGE from the page being viewed, not the component's
          // definition — so ground it to the current page (null → currentPageFile in Apply),
          // never to sel.file (which for a component instance is the component's own source).
          file: e.remove ? null : sel.file,
          elementLabel: sel.label,
          elementText: text,
          elementClassName: readoutRef.current?.className ?? undefined,
          resizeMode: e.resizeMode,
          remove: e.remove,
          // Tag the edit with the viewport it was made in — a mobile/tablet edit is scoped
          // to that breakpoint in source (and in the live preview across viewport switches).
          viewport: viewportIdRef.current,
        };
      });
      // Route into the instant lanes (deterministic source writes + token-value writes → no Apply)
      // and the gated ledger. Token-VALUE edits commit via setTokenValue; a token BINDING stays gated.
      const { deterministic, tokenValues, ledger } = routeEdits(built, sel);
      if (tokenValues.length > 0) tokenQueue.current.push(...tokenValues);
      if (deterministic.length > 0) persistQueue.current.push(...deterministic);
      if (tokenValues.length > 0 || deterministic.length > 0) autoPersist.schedule();
      if (ledger.length > 0) {
        setPending((p) => {
          const next = { ...p };
          for (const f of ledger) next[f.id] = f;
          return next;
        });
      }
    },
    [autoPersist, schedulePersistLight],
  );

  // Canvas drags (resize / padding / gap / margin) commit as per-element style
  // edits — Figma detaches to a literal rather than editing a shared token.
  const commitStyleEdits = useCallback(
    (edits: { key: string; value: string; cssProps: string[] }[]) => commitEdits(edits, true),
    [commitEdits],
  );

  // Delete the selected element: hide it live (display:none — reversible via clearOverride)
  // and record a removal that Apply writes to source (removes the JSX). Keep/Revert like any
  // other pending edit. Deselect so the panel doesn't dangle on a now-hidden node.
  const deleteSelected = useCallback(() => {
    const id = selectedIdRef.current;
    if (!id || !selectionRef.current) return;
    const css = { display: "none" };
    applyOverride(id, css);
    commitEdits([{ key: "remove", value: "", cssProps: ["display"], css, remove: true, label: "Delete element" }]);
    select(null);
  }, [applyOverride, commitEdits, select]);

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
      } else if (key === "gap-mode") {
        // Packed vs Space-between (Figma spacing mode) — distribute children to fill the
        // container's main axis. A fixed `gap` can't fill; this is the CSS that does.
        const css = gapModeCss(value);
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
        const displayValue = mode === "fixed" ? fixedPx : SIZE_MODE_LABEL[mode];
        const edits: Parameters<typeof commitEdits>[0] = [
          { key, value: displayValue, cssProps: Object.keys(css), css, resizeMode: mode },
        ];
        // Filling a flex container along ITS OWN main axis frees space its children don't
        // use (a fixed gap can't grow). Spread them to fill it — Figma "Space between" —
        // so Fill visibly redistributes the components inside, as expected. Committed as a
        // second edit so Apply writes `justify-between` into source alongside the resize.
        const disp = readoutRef.current?.computed["display"] ?? "";
        const dir = readoutRef.current?.computed["flex-direction"] ?? "row";
        const selfMainDim = dir.startsWith("column") ? "height" : "width";
        const childCount = readoutRef.current?.children.length ?? 0;
        const live: Record<string, string> = { ...css };
        if (mode === "fill" && disp.includes("flex") && dim === selfMainDim && childCount >= 2) {
          const jc = gapModeCss("distribute");
          Object.assign(live, jc);
          edits.push({ key: "gap-mode", value: "distribute", cssProps: Object.keys(jc), css: jc });
        }
        applyLive(live);
        commitEdits(edits);
      } else if (key === "padding" || key === "margin") {
        // Figma-style per-side spacing. BoxField emits only the sides the user
        // touched, as "side:value;side:value", so editing one side never clobbers
        // the others. Each side is an independent CSS property (`padding-top`, …)
        // and can carry its own spacing-token binding — so `var(--space-4)` on the
        // top stays a token while the left is a literal, exactly like Figma.
        const field = selectionRef.current?.sections.flatMap((s) => s.fields).find((f) => f.key === key);
        const live: Record<string, string> = {};
        const edits: Parameters<typeof commitEdits>[0] = [];
        for (const part of value.split(";")) {
          const [side, raw] = part.split(/:(.*)/s); // split on the first colon only
          if (!side || raw == null) continue;
          const prop = `${key}-${side}`; // padding-top | margin-left | …
          live[prop] = raw;
          const token = field?.tokenType
            ? (tokenNameFromVar(raw) ?? matchTokenName(raw, tokensRef.current, field.tokenType))
            : undefined;
          edits.push({ key: prop, value: raw, cssProps: [prop], css: { [prop]: raw }, token });
        }
        if (edits.length) {
          applyLive(live);
          commitEdits(edits);
        }
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
          elementClassName: readoutRef.current?.className ?? undefined,
        },
      }));
    },
    [setClass],
  );

  const onSelectNode = useCallback((id: string) => select(id), [select]);
  const onHoverNode = useCallback((id: string | null) => hover(id), [hover]);

  // Delete/Backspace deletes the selected element (Figma-style), in inspect mode only and
  // never while typing in a field. The webview swallows keys when focused, so this covers
  // the host chrome; the panel's trash button is the always-available path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (mode !== "inspect" || !selectedIdRef.current) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, deleteSelected]);

  // Roll a persisted instant edit back to a captured file state (undo/redo share this).
  // `save` receives the CURRENT on-disk content of the affected files so the inverse op can
  // reinstate it; then restore `target` and reload so the preview re-renders from source.
  const rollTo = useCallback(
    async (target: FileSnapshot[], save: (current: FileSnapshot[]) => void): Promise<void> => {
      const seen = new Set<string>();
      const paths = target.map((s) => s.path).filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
      // Current disk content of exactly these files = the counterpart to push on the other stack.
      const current = (
        await Promise.all(paths.map((p) => api.snapshotComponent(project.path, p).catch(() => [] as FileSnapshot[])))
      )
        .flat()
        .filter((s) => paths.includes(s.path));
      const byPath = new Map(current.map((s) => [s.path, s] as const));
      save(paths.map((p) => byPath.get(p) ?? target.find((s) => s.path === p)!));
      await api.restoreFiles(project.path, target);
      bridge.clearOverride();
      bridge.reload();
      // A restored token file leaves the panel's token list stale — re-read it.
      void api.inspectorTokens(project.path).then((r) => setTokens(r.tokens)).catch(() => {});
    },
    [project.path, bridge],
  );
  const undoEdit = useCallback(async (): Promise<void> => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    await rollTo(entry, (current) => {
      redoStack.current.push(current);
      if (redoStack.current.length > MAX_HISTORY) redoStack.current.shift();
    });
    setWriteError(null);
  }, [rollTo]);
  const redoEdit = useCallback(async (): Promise<void> => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    await rollTo(entry, (current) => {
      undoStack.current.push(current);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    });
    setWriteError(null);
  }, [rollTo]);

  // Cmd/Ctrl+Z undoes the last instant edit (Cmd/Ctrl+Shift+Z redoes) — the safety net that
  // replaces the Apply/Keep gate for manual edits. Two entry points, exactly one fires per press
  // depending on focus: this host handler (chrome focused) and the guest's forwarded `undoSignal`
  // (canvas/webview focused). The webview swallows its own keys, so the paths never double-fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      void (e.shiftKey ? redoEdit() : undoEdit());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoEdit, redoEdit]);
  useEffect(() => {
    if (!bridge.undoSignal) return;
    void (bridge.undoSignal.redo ? redoEdit() : undoEdit());
    bridge.clearUndoSignal();
  }, [bridge.undoSignal, bridge.clearUndoSignal, undoEdit, redoEdit]);

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
    setApplyMiss(false);
    setApplyMissReason(null);
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
        // A per-element visual edit is a per-INSTANCE change: target where the element is
        // USED (the current page) — the class often lives on the instance (e.g.
        // `<Card className="bg-neutral-100">`), and editing the component would change every
        // instance. Keep the component's own file as a SECONDARY location for the agent to
        // check. Falls back to the component file when the page can't be resolved.
        const targets = groupEditsByElement(structural).map((t) => {
          const usage = currentPageFile ?? t.file;
          const componentFile = t.file && t.file !== usage ? t.file : null;
          return { ...t, file: usage, componentFile };
        });
        // Snapshot every file the agent might touch (usage + component) so Discard/Revert
        // restores whichever it edited; fall back to the broad token scope if none resolved.
        const files = [
          ...new Set(
            targets.flatMap((t) => [t.file, t.componentFile]).filter((f): f is string => !!f),
          ),
        ];
        const snap =
          files.length > 0
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

  // When the structural (gated) run finishes, decide honestly whether it landed.
  // The agent can report "done" without editing anything (element not located in
  // source, ambiguous target). If NO file was written, the source is unchanged, so
  // entering review would show the change (from the live override) and then "revert"
  // on Keep. Instead: keep the edits pending, keep the override so the preview still
  // shows them, and surface why — the user can Re-apply in Chat or adjust.
  useEffect(() => {
    if (structuralMod.model.status !== "done") return;
    const patched = structuralMod.model.steps.some(
      (s) => /^(edit|write|multiedit)$/i.test(s.name) && s.status === "ok",
    );
    setApplying(false);
    if (patched) {
      bridge.reload();
      rediscoverRoutes(); // an Apply may have added/changed a route or nav — refresh the site tree
      setApplyMiss(false);
      setReview(true);
    } else {
      // No source edit → don't clear the override (keep showing the edit live), don't
      // enter review. The persistent unsaved bar stays up with an explanation. Capture the
      // agent's OWN final message — it usually says exactly why (e.g. "couldn't find the
      // element", "the classes don't appear in this file").
      const m = structuralMod.model;
      const reason = (m.result?.text ?? [...m.messages].reverse().find((x) => x.role === "assistant")?.text ?? "")
        .trim()
        .slice(0, 400);
      setApplyMissReason(reason || null);
      setApplyMiss(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralMod.model.status]);

  function discardEdits(): void {
    bridge.clearOverride();
    setPending({});
    setApplyMiss(false);
    setApplyMissReason(null);
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
    // Drop the now-redundant live override, then RELOAD so the preview re-renders from
    // the patched SOURCE. Without the reload, if HMR didn't refresh the DOM, clearing the
    // override dropped back to the pre-change render — the change "wasn't kept". Pending is
    // already empty here, so the reload's replay is a no-op.
    bridge.clearOverride();
    bridge.reload();
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

  // Seed the canvas with a default story (Storybook's index.json) so the preview shows
  // something on entry, before the native sidebar's first selection lands. The native
  // sidebar (StorybookSidebar) is the live nav from there on.
  useEffect(() => {
    if (isApp || !embedUrl) return;
    let alive = true;
    void api
      .storybookIndex(embedUrl)
      .then((entries) => {
        if (!alive) return;
        setStoryId((cur) => cur ?? entries.find((e) => e.type === "story")?.id ?? entries[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isApp, embedUrl, reloadNonce]);

  async function start(): Promise<void> {
    setDev(await startFor());
  }

  // Storybook's nav for the left dock (kind=storybook) — the REAL Storybook sidebar,
  // cropped out of the native manager (search + tree + docs), driving the story-only
  // canvas via the manager's own `?path=` URL. Not a hand-rolled list.
  const storybookNav = (
    <StorybookSidebar
      src={embedUrl}
      onSelect={(id, viewMode) => {
        setStoryId(id);
        setStoryViewMode(viewMode);
      }}
    />
  );

  // The Design/Layers sidebar body (Sitemap + Design or Comments panel). Rendered inline in
  // an <aside> on desktop, or PORTALED into the IDE's unified left-dock slot (sidebarSlot).
  const sidebarBody = (
    <>
      {/* Pages are created by ASKING in the Chat sidebar (light-first) — no create form/button here. */}
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
          <ChangesBar {...changesBarProps} />
        </>
      ) : (
        <DesignPanel
          selection={selection}
          tree={layersTree}
          hoveredId={bridge.hoveredId}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
          onFieldChange={onFieldChange}
          onDelete={deleteSelected}
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
          onCreateToken={createTokenForField}
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
    </>
  );

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

      {/* Storybook: portal the story nav into the dock's Section tab (canvas is app-only,
          so Storybook has no Design panel — its nav goes here instead). */}
      {!isApp && sidebarSlot && embedUrl && createPortal(storybookNav, sidebarSlot)}
      {/* Light-first: when there's no running app canvas, the Design panel (Sitemap + "+ New light
          page") still portals here — so light pages work WITHOUT an app scaffold. */}
      {isApp && sidebarSlot && !canvasReady &&
        createPortal(<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-vs-bg-surface">{sidebarBody}</div>, sidebarSlot)}
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
          {isLightPage ? (
            // A light page is already served + live in the canvas — no dev server to start/stop. Offer
            // to open it in a browser and reload, not "Start app".
            <>
              {lightPageSrc && <span className="font-mono text-[11px] text-vs-text-secondary">{lightPageSrc.replace(/^https?:\/\//, "")}</span>}
              <Button variant="ghost" disabled={!lightPageSrc} onClick={() => lightPageSrc && void api.openInstall(lightPageSrc)}>
                Open in browser
              </Button>
              <Button variant="ghost" onClick={refresh} title="Reload the preview">
                <RefreshIcon /> Refresh
              </Button>
            </>
          ) : dev.state === "running" && dev.url ? (
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
        {isApp && dirty && !applying && !review && (
          <div
            className={`flex flex-none items-center gap-3 border-b px-5 py-2 text-[12px] ${
              applyMiss ? "border-vs-warning/40 bg-vs-warning/10" : "border-vs-accent/40 bg-vs-accent-subtle"
            }`}
          >
            <span className={`flex-none ${applyMiss ? "text-vs-warning" : "text-vs-accent"}`} aria-hidden>
              {applyMiss ? "⚠" : "●"}
            </span>
            <span className="min-w-0 flex-1 leading-relaxed text-vs-text-primary">
              {applyMiss ? (
                <>
                  <b>Couldn’t locate {Object.keys(pending).length === 1 ? "this edit" : "these edits"} in your source</b> —
                  the run finished without changing a file, so {Object.keys(pending).length === 1 ? "it’s" : "they’re"}{" "}
                  still preview-only. Try <b>Re-apply in Chat</b> to describe the change to Claude, or Discard.
                  {applyMissReason && (
                    <span className="mt-1 block border-l-2 border-vs-warning/40 pl-2 text-[11px] italic text-vs-text-muted">
                      Claude said: “{applyMissReason}”
                    </span>
                  )}
                </>
              ) : (
                <>
                  <b>
                    {Object.keys(pending).length} unsaved edit{Object.keys(pending).length === 1 ? "" : "s"}
                  </b>{" "}
                  — live preview only. <b>Apply</b> to write them into your code so they persist across reloads.
                  {orphanCount > 0 && (
                    <span className="text-vs-warning">
                      {" "}
                      · {orphanCount} couldn’t reattach after the page changed — still saved, but not showing.
                    </span>
                  )}
                </>
              )}
            </span>
            {(orphanCount > 0 || applyMiss) && onSendToChat && (
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

        {/* Project-scoped Figma-MCP gate: blocking only for Figma design-source
            projects when the MCP isn't connected (change: figma-mcp-prerequisite). */}
        <FigmaMcpBanner project={project} />

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
          ) : isLightPage && !canvasReady ? (
            // A page is selected; its served URL is loading — it renders in the RunCanvas (below) once ready.
            <Centered>
              <Spinner /> Opening page…
            </Centered>
          ) : isApp && !lightPage && routes !== null && pageCount === 0 && dev.state !== "starting" && dev.state !== "running" && dev.state !== "error" ? (
            // Brand-new blank project: nothing built yet, no pages. Don't show a dev-server/no-script error
            // or any other project's pages — greet the user and point them at the one thing they need (the
            // Chat sidebar). Pages are created by asking; nothing else is shown here.
            <Centered>
              <div className="flex max-w-xl flex-col items-center gap-6 text-center">
                <Logo size={56} className="opacity-90" />
                <div className="flex flex-col gap-3">
                  <p className="text-2xl font-semibold tracking-[-0.01em] text-vs-text-primary">
                    Create whatever you want from a single prompt.
                  </p>
                  <p className="text-sm leading-relaxed text-vs-text-secondary">
                    Just describe it in the <b className="text-vs-text-primary">Chat sidebar</b> — it’s composed from
                    your design system and previews here, live. No forms, no buttons. That’s it.
                  </p>
                </div>
              </div>
            </Centered>
          ) : dev.state === "starting" ? (
            <Centered>
              <Spinner /> {dev.message ?? `Starting ${isApp ? "your app's dev server" : "Storybook"}…`}
            </Centered>
          ) : canvasReady ? (
            // Run Canvas: Figma-style Design panel (left) + instrumented preview (right).
            // When the IDE provides a left-dock slot, the panel is portaled there and the
            // canvas fills the center; otherwise it renders inline in a resizable <aside>.
            <div className="relative flex h-full min-h-0">
              {/* `sidebarSlot === undefined` = no host dock (desktop) → inline resizable aside.
                  Otherwise (IDE) always portal — render nothing until the slot element exists,
                  never a transient inline copy, so the panel mounts once and stays stable. */}
              {sidebarSlot !== undefined ? (
                sidebarSlot &&
                createPortal(
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-vs-bg-surface">{sidebarBody}</div>,
                  sidebarSlot,
                )
              ) : (
                <>
                  <aside
                    style={{ width: panelW }}
                    className="flex flex-none flex-col overflow-hidden border-r border-vs-border-default bg-vs-bg-surface"
                  >
                    {sidebarBody}
                  </aside>
                  {/* Resize the Design panel (like the IDE Explorer rail). */}
                  <div
                    role="separator"
                    aria-label="Resize Design panel"
                    onPointerDown={startPanelResize}
                    className="w-1 flex-none cursor-col-resize bg-vs-border-default/40 hover:bg-vs-accent"
                  />
                </>
              )}
              <div className="relative min-w-0 flex-1">
                {writeError && (
                  <div
                    role="status"
                    className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-vs-warning/40 bg-vs-warning/10 px-3 py-1.5 text-[12px] text-vs-text-primary"
                  >
                    <span className="flex-1">{writeError}</span>
                    <button
                      type="button"
                      className="text-vs-text-muted hover:text-vs-text-primary"
                      onClick={() => setWriteError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
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
                  src={canvasSrc}
                  guestPreloadUrl={guestPreload}
                  bridge={bridge}
                  mode={mode}
                  onModeChange={setMode}
                  viewport={viewport}
                  frame={frame}
                  onViewportChange={setViewportId}
                  onFrameChange={setFrame}
                  onLiveEdit={applyLive}
                  onCommitEdit={commitStyleEdits}
                  onSendToChat={
                    onSendToChat && selection
                      ? () => onSendToChat(buildSelectionContext(selection, Object.values(pending)), selection.file)
                      : undefined
                  }
                  onSendToFigma={() => void sendToFigma()}
                  onUpdateFromFigma={() => void pullFromFigma()}
                  figmaStatus={figmaToolbarStatus}
                  figmaConnected={figmaConnected}
                  figmaMapped={!!figmaScreen}
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
                  skeleton={skeleton}
                />
                {(() => {
                  // Only the transient round-trip states get a panel now — the persistent
                  // "already in Figma" affordance moved into the toolbar menu ("Update from Figma").
                  const panelPhase =
                    figmaPhase === "review"
                      ? ("review" as const)
                      : figmaPhase === "error"
                        ? ("error" as const)
                        : figmaPhase === "sent"
                          ? ("sent" as const)
                          : null;
                  if (!panelPhase) return null;
                  return (
                    <FigmaBridgePanel
                      phase={panelPhase}
                      openUrl={figmaOpenUrl}
                      error={figmaMod.model.result?.text ?? null}
                      onOpen={() => figmaOpenUrl && void api.openInstall(figmaOpenUrl)}
                      onPull={figmaScreen ? () => void pullFromFigma() : undefined}
                      onKeep={figmaKeep}
                      onRevert={() => void figmaRevert()}
                      onDismiss={figmaDismiss}
                    />
                  );
                })()}
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
              {(() => {
                // In the dock (sidebarSlot), the VortSpec nav drives Storybook, so show the
                // STORY only (iframe.html) — no in-iframe manager sidebar. Otherwise (desktop)
                // embed the full Storybook manager at its root.
                const storyOnly = !isApp && sidebarSlot && storyId;
                const src = storyOnly
                  ? `${embedUrl}iframe.html?id=${encodeURIComponent(storyId)}&viewMode=${storyViewMode}`
                  : embedUrl;
                return (
                  <iframe
                    key={`${src}:${reloadNonce}`}
                    title={noun}
                    src={src}
                    onLoad={() => setFrameLoading(false)}
                    className="h-full min-h-[340px] w-full border-0 bg-white"
                  />
                );
              })()}
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
              <div className="flex max-w-xl flex-col items-center gap-6 text-center">
                <Logo size={56} className="opacity-90" />
                <div className="flex flex-col gap-3">
                  <p className="text-2xl font-semibold tracking-[-0.01em] text-vs-text-primary">
                    Create whatever you want from a single prompt.
                  </p>
                  <p className="text-sm leading-relaxed text-vs-text-secondary">
                    Just describe it in the <b className="text-vs-text-primary">Chat sidebar</b> — it’s composed from
                    your design system and previews here, live. No forms, no buttons. That’s it.
                  </p>
                </div>
                {/* De-emphasized: start the real app dev server (only if this project has one). */}
                <button
                  type="button"
                  onClick={() => void start()}
                  className="text-[11px] text-vs-text-muted underline-offset-2 hover:text-vs-text-secondary hover:underline"
                >
                  or start the app dev server
                </button>
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
