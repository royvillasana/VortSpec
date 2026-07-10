import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DevServerStatus, Project, InspectorToken, InspectorComponent, FileSnapshot } from "@vortspec/core/ipc";
import { buildSelection, alignToCss, flowToCss } from "@vortspec/core/selection-builder";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";
import { DesignPanel } from "../components/run-canvas/DesignPanel";
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
  isTokenBinding,
  type PendingEdit,
} from "../components/run-canvas/pending";
import { useInspectorBridge } from "../lib/useInspectorBridge";
import { useAgentRun } from "../lib/useAgentRun";
import { routedModel } from "../lib/model-routing";
import { RunDoctor, type DoctorState } from "../components/run-canvas/RunDoctor";
import { buildDoctorPrompt, relFileFromSource } from "../components/run-canvas/doctor";

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

  useEffect(() => {
    setDoctorDismissed(false);
    setDoctorState("idle");
  }, [project.path]);

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

  // ── Run Canvas (visual editing) state — only used when `canvas` is on ──────
  const bridge = useInspectorBridge();

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
  const [mode, setMode] = useState<"inspect" | "interact">("interact");
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
      const component = resolveComponent(node, components);
      // If it's not a component instance, see whether it *resembles* one (should reuse it).
      const resembles = component ? null : resembleComponent(bridge.readout.className, components);
      return buildSelection(bridge.readout, { tokens, component, resembles, tag: node?.tag });
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
  const [pending, setPending] = useState<Record<string, PendingEdit>>({});
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState(false);
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const structuralMod = useAgentRun();

  // Stable methods (the hook memoizes these) + refs to current state, so the
  // Design-panel callbacks keep a stable identity across the 60fps geometry
  // echoes during a drag — that's what lets the memoized sections skip work.
  const { applyOverride, select, hover, setMode: setGuestMode, setText, setClass } = bridge;

  // Push the current mode to the guest whenever it (or readiness) changes.
  useEffect(() => {
    if (bridge.ready) setGuestMode(mode === "inspect" ? "inspect" : "interact");
  }, [mode, bridge.ready, setGuestMode]);
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
      }[],
      forceStyle = false,
    ) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const uses = (n: string): number => tokensRef.current.find((t) => t.name === n)?.uses ?? 0;
      setPending((p) => {
        const next = { ...p };
        for (const e of edits) {
          const edit = classifyFieldEdit(sel, e.key, e.value, e.cssProps, uses, forceStyle, e.css, e.token);
          next[edit.key] = edit;
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
        return;
      }
      if (key === "align") {
        const dir = readoutRef.current?.computed["flex-direction"] ?? "row";
        const css = alignToCss(value, dir);
        applyLive(css);
        commitEdits([
          { key, value: `${css["justify-content"]}, ${css["align-items"]}`, cssProps: ["justify-content", "align-items"], css },
        ]);
        return;
      }
      if (key === "flow") {
        // block / row / column → display (+ flex-direction). Multiple props, so
        // compute the override explicitly rather than via the 1-value field map.
        const css = flowToCss(value);
        applyLive(css);
        commitEdits([{ key, value, cssProps: Object.keys(css), css }]);
        return;
      }
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
    },
    [applyLive, commitEdits, setText],
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
      setPending((p) => ({ ...p, [`variant:${key}`]: classifyVariantEdit(key, value, remove, add) }));
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
        const snap = selection?.file
          ? await api.snapshotComponent(project.path, selection.file)
          : await api.snapshotTokenScope(project.path);
        setSnapshot(snap);
        await structuralMod.start({
          prompt: buildEditPrompt(selection?.file ?? null, selection?.component ?? null, structural),
          cwd: project.path,
          allowedTools: ["Read", "Edit", "Write"],
          bypassPermissions: true,
          // A visual-edit apply reads/edits one source file — it needs no MCP, so
          // skip the user's global MCP servers (Figma, etc.) to cut session startup,
          // and route the mechanical patch to a faster tier than the default.
          strictMcp: true,
          model: routedModel("sonnet"),
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
  }
  // Drop a single pending edit before applying: restore the node to its original,
  // then re-apply every remaining edit on top so the live preview stays exact.
  function removePending(key: string): void {
    const id = selectedIdRef.current;
    const next = { ...pending };
    delete next[key];
    if (id) {
      bridge.clearOverride(id);
      for (const e of Object.values(next)) {
        if (e.css && Object.keys(e.css).length > 0) bridge.applyOverride(id, e.css);
        else if (e.key === "content") setText(id, e.value);
        else if (e.kind === "variant") setClass(id, e.removeClasses ?? [], e.addClasses ?? []);
      }
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
          <span className="text-[15px] font-semibold">{isApp ? "Run app" : "Storybook"}</span>
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
            {!envCreated && (
              <Button variant="default" disabled={envBusy} onClick={() => void createEnvFile()}>
                {envBusy ? "Creating…" : `Create .env from ${envStatus?.examples[0]}`}
              </Button>
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

        <div className="min-h-0 flex-1 overflow-hidden bg-vs-bg-primary">
          {dev.state === "starting" ? (
            <Centered>
              <Spinner /> {dev.message ?? `Starting ${isApp ? "your app's dev server" : "Storybook"}…`}
            </Centered>
          ) : canvasReady ? (
            // Run Canvas: Figma-style Design panel (left) + instrumented preview (right).
            <div className="relative flex h-full min-h-0">
              <aside
                style={{ width: panelW }}
                className="flex-none overflow-hidden border-r border-vs-border-default bg-vs-bg-surface"
              >
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
                  mode={mode}
                  onModeChange={setMode}
                  zoom={zoom}
                  onZoomBy={zoomBy}
                  onZoomReset={resetZoom}
                  colorTokens={colorTokens}
                  tokens={tokens}
                  resembles={selection?.resembles ?? null}
                  onUseComponent={
                    onSendToChat && selection?.resembles
                      ? () =>
                          onSendToChat(
                            `Refactor the selected element to use the existing "${selection.resembles!.name}" design-system component instead of hand-written markup, picking the variant that matches its current appearance. Preserve look and behavior and remove the duplicated styles.\n\n${buildSelectionContext(selection)}`,
                            selection.resembles!.file,
                          )
                      : undefined
                  }
                  onExtractComponent={
                    onSendToChat && selection
                      ? () =>
                          onSendToChat(
                            `The selected element is hand-written markup that resembles a reusable pattern. Extract it into a new reusable component in the design system (with variants + tokens), then replace this usage with the new component.\n\n${buildSelectionContext(selection)}`,
                            selection.file,
                          )
                      : undefined
                  }
                />
              </aside>
              {/* Resize the Design panel (like the IDE Explorer rail). */}
              <div
                role="separator"
                aria-label="Resize Design panel"
                onPointerDown={startPanelResize}
                className="w-1 flex-none cursor-col-resize bg-vs-border-default/40 hover:bg-vs-accent"
              />
              <div className="min-w-0 flex-1">
                <RunCanvas
                  src={embedUrl}
                  guestPreloadUrl={guestPreload}
                  bridge={bridge}
                  mode={mode}
                  zoom={zoom}
                  onLiveEdit={applyLive}
                  onCommitEdit={commitStyleEdits}
                  onSendToChat={
                    onSendToChat && selection
                      ? () => onSendToChat(buildSelectionContext(selection, Object.values(pending)), selection.file)
                      : undefined
                  }
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
                onKeep={doctorKeep}
                onRevert={() => void doctorRevert()}
                onOpenSource={onSource}
                onRestart={() => void doctorRestart()}
                onDismiss={() => void start()}
              />
            </Centered>
          ) : (
            <Centered>
              <div className="text-center">
                <p className="text-sm text-vs-text-secondary">
                  {isApp ? "Run your project's app to preview it live." : "Run Storybook to browse your components live."}
                </p>
                <Button variant="primary" className="mt-3" onClick={() => void start()}>
                  {isApp ? "Start app" : "Start Storybook"}
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
