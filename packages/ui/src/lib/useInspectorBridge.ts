import { useCallback, useRef, useState } from "react";
import {
  INSPECTOR_BRIDGE_CHANNEL,
  bridgeEventSchema,
  type BridgeCommand,
  type BridgeTree,
  type NodeReadout,
  type Rect,
  type InsertTargetWire,
  type StructureSnapshotWire,
} from "@vortspec/core/ipc";

/** Minimal shape of an Electron <webview> element (typed loosely to avoid the dep). */
interface WebviewEl extends HTMLElement {
  send(channel: string, ...args: unknown[]): void;
  reload(): void;
  loadURL(url: string): void;
  executeJavaScript(code: string): Promise<unknown>;
}

/** Canvas input mode: select (inspect), use the app (interact), pin a comment, or place an insert slot. */
export type CanvasMode = "inspect" | "interact" | "comment" | "insert";

/** The live placeholder the guest has materialized for a composition slot. */
export interface PlaceholderState {
  target: InsertTargetWire;
  rect: Rect;
}
type WebviewIpcEvent = Event & { channel: string; args: unknown[] };

export interface InspectorBridge {
  /** Callback ref to attach to the <webview> element. */
  attach: (el: WebviewEl | null) => void;
  /** Whether the guest bridge has reported it is attached and instrumenting. */
  ready: boolean;
  /** Non-null with a message when the bridge failed to attach (CSP, etc.). */
  error: string | null;
  tree: BridgeTree | null;
  /** The most recent selected-node readout (raw computed style + custom props). */
  readout: NodeReadout | null;
  /**
   * The FOCUSED member of the selection. Single-target operations that cannot fan out — reparent,
   * insert-into, inline text — act on this, so none of them needed redesigning for multi-select.
   */
  selectedId: string | null;
  /**
   * The whole selection, focused member included. A selection of one is `[selectedId]`, so every
   * existing single-selection behaviour is the one-member case of this rather than a separate path.
   */
  selectedIds: string[];
  /** Answers to `matchElements`, keyed by the query key: the node ids that currently look the same. */
  matched: Record<string, string[]>;
  hoveredId: string | null;
  /** Live rectangles keyed by node id (updated on readout/geometry) for the overlay. */
  rects: Record<string, Rect>;
  /** The most recent uncaught error in the previewed app (for the Run Doctor), or null. */
  runtimeError: { message: string; source?: string; line?: number; stack?: string } | null;
  clearRuntimeError: () => void;
  /** The most recent inline text edit on the canvas ({nodeId, text}), consumed by the host. */
  textEdited: { nodeId: string; text: string } | null;
  clearTextEdited: () => void;
  /** A pending context-menu request from a right-click ({nodeId, x, y} in guest coords), or null. */
  contextMenu: { nodeId: string; x: number; y: number } | null;
  clearContextMenu: () => void;
  /** Cmd/Ctrl+Z forwarded from the canvas (webview focus) — `n` bumps per press so repeats fire. */
  undoSignal: { redo: boolean; n: number } | null;
  clearUndoSignal: () => void;
  /** True when the selected node's element vanished after a re-render (couldn't be re-acquired). */
  selectionLost: boolean;
  clearSelectionLost: () => void;
  /** Set an element's visible text live (from the sidebar Content input). */
  setText: (id: string, text: string) => void;
  /** Remove an element from the DOM — a true delete for a light page (DOM is the source). */
  removeNode: (id: string) => void;
  /** Move an element before/after (reorder) or inside (nest) another — the page rearranges to match. */
  moveNode: (id: string, targetId: string, position: "before" | "after" | "inside") => void;
  /** Swap classes on an element for a live variant preview. */
  setClass: (id: string, remove: string[], add: string[]) => void;
  /** Select a node; `additive` toggles it in the selection instead of replacing it. */
  select: (id: string | null, additive?: boolean) => void;
  /** Ask the guest which elements look the same; the answer lands in `matched[key]`. */
  matchElements: (key: string, component: string, cssProp: string, value: string) => void;
  hover: (id: string | null) => void;
  /** Toggle guest input handling: inspect (select), interact (use the app), comment (pin). */
  setMode: (mode: CanvasMode) => void;
  /** A comment-mode click's anchor payload (the target to pin a new thread to), or null. */
  commentTarget: { nodeId: string; fingerprint: string; label: string; component: string | null; rect: Rect } | null;
  clearCommentTarget: () => void;
  /** The insertion slot under the pointer in insert mode (null when over none). */
  insertTarget: InsertTargetWire | null;
  /** The materialized composition placeholder, or null when none is placed. */
  placeholder: PlaceholderState | null;
  /** A human sentence when the placeholder was lost after a reload (else null). */
  placeholderLost: string | null;
  clearPlaceholderLost: () => void;
  /** Resize the active placeholder (soft hint) — drives the guest's live resize. */
  resizePlaceholder: (size: { width?: number; height?: number }) => void;
  /** Dismiss the active placeholder (discard / cancel). */
  dismissPlaceholder: () => void;
  /** Re-render the placeholder to a chosen axis + slot count (the user's layout choice). */
  setPlaceholderSpec: (axis: "row" | "column", slotCount: number) => void;
  /** Preview one composed option in place (null shows all) — drives the option cycler. */
  previewOption: (option: number | null) => void;
  /** The latest structural snapshot of a subtree (from `requestStructure`), or null. */
  structure: StructureSnapshotWire | null;
  /** Ask the guest for a subtree's structural snapshot (null nodeId scans from the body). */
  requestStructure: (nodeId?: string | null) => void;
  /** The outcome of the last override replay after a reload — how many were restored vs lost. */
  replayResult: { applied: number; missing: number } | null;
  clearReplayResult: () => void;
  /** The live drag in progress (ghost rect trailing the pointer + current drop slot), or null. */
  drag: {
    sourceFingerprint: string;
    nodeId: string;
    ghost: Rect;
    target: InsertTargetWire | null;
    poppedOut: boolean;
  } | null;
  /** A completed drop over a valid slot the host should turn into a gated move, or null. */
  dragDrop: {
    sourceFingerprint: string;
    sourceLabel: string;
    sourceText: string | null;
    sourceDataSource: string | null;
    sourceListIndex: number | null;
    target: InsertTargetWire;
    poppedOut: boolean;
  } | null;
  clearDragDrop: () => void;
  /** A human sentence for an invalid drop or a force-cancelled drag (HMR-lost), else null. */
  dragMessage: string | null;
  clearDragMessage: () => void;
  /** Abort an in-flight drag from the host (the move panel closed / the flow reset). */
  cancelDrag: () => void;
  /** Undo an ephemeral live-DOM move (Revert) — re-insert the element at its origin. */
  revertMove: () => void;
  /** Forget the tracked ephemeral move without moving anything (after Keep reloads source). */
  clearMove: () => void;
  /** Live rects of the watched comment anchors (fingerprint → rect, null = currently lost). */
  anchorRects: Record<string, Rect | null>;
  /** Tell the guest which anchor fingerprints to track (for pin placement). */
  watchAnchors: (fingerprints: string[]) => void;
  /** Scroll the element for a comment anchor into view (jump-to-pin). */
  scrollToAnchor: (fingerprint: string) => void;
  /** Capture a ~160px thumbnail of a guest rect (webview capturePage crop); "" if unavailable. */
  captureThumbnail: (rect: Rect) => Promise<string>;
  applyOverride: (id: string, css: Record<string, string>) => void;
  clearOverride: (id?: string) => void;
  /** Re-apply a set of unsaved visual edits by fingerprint after a reload (persist + replay). */
  replayOverrides: (
    edits: { fingerprint: string; css?: Record<string, string>; text?: string; removeClasses?: string[]; addClasses?: string[] }[],
  ) => void;
  /** Re-request the selected node's readout so the panel reflects its actual state
   *  after a discrete edit or a cleared override. Defaults to the current selection. */
  refreshReadout: (id?: string) => void;
  requestTree: () => void;
  /** Reload the guest page (e.g. after a committed edit) — the bridge re-attaches. */
  reload: () => void;
  /** Navigate the preview to a URL (sitemap navigation) — the bridge re-attaches on load. */
  loadUrl: (url: string) => void;
  /**
   * Serialize the guest's LIVE DOM to clean HTML (bridge instrumentation stripped), for persisting a
   * light page — where the DOM IS the source (light-pages-on-canvas). Null if the webview isn't ready.
   */
  serializeDom: () => Promise<string | null>;
  /** Tell the guest whether it's a light page (drop targets don't need a `data-source` dev-stamp). */
  setLightMode: (on: boolean) => void;
}

/**
 * Renderer side of the Run-Canvas inspector bridge (change: run-canvas-visual-editor).
 *
 * Owns the <webview> ref, decodes guest events off the single bridge channel, and
 * exposes commands (select/hover/override) + the tree/selection/geometry state the
 * canvas overlay and Design panel render from. All wire messages are zod-validated
 * on receipt (they cross into the guest page and are untrusted — design D4).
 */
export function useInspectorBridge(): InspectorBridge {
  const webviewRef = useRef<WebviewEl | null>(null);
  // The element we've wired listeners onto. The <webview> REMOUNTS when its `src`/key changes
  // (e.g. opening a light page), so we must re-attach to each NEW element — a once-only boolean
  // guard would leave the remounted webview with no listeners (no "ready", no tree → uneditable
  // until the whole app reloads). Track the element identity instead.
  const attachedEl = useRef<WebviewEl | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<BridgeTree | null>(null);
  const [readout, setReadout] = useState<NodeReadout | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matched, setMatched] = useState<Record<string, string[]>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [runtimeError, setRuntimeError] = useState<InspectorBridge["runtimeError"]>(null);
  const [textEdited, setTextEdited] = useState<InspectorBridge["textEdited"]>(null);
  const [contextMenu, setContextMenu] = useState<InspectorBridge["contextMenu"]>(null);
  const [undoSignal, setUndoSignal] = useState<InspectorBridge["undoSignal"]>(null);
  const [selectionLost, setSelectionLost] = useState(false);
  const [commentTarget, setCommentTarget] = useState<InspectorBridge["commentTarget"]>(null);
  const [anchorRects, setAnchorRects] = useState<Record<string, Rect | null>>({});
  const [insertTarget, setInsertTarget] = useState<InsertTargetWire | null>(null);
  const [placeholder, setPlaceholder] = useState<PlaceholderState | null>(null);
  const [placeholderLost, setPlaceholderLost] = useState<string | null>(null);
  const [structure, setStructure] = useState<StructureSnapshotWire | null>(null);
  const [drag, setDrag] = useState<InspectorBridge["drag"]>(null);
  const [dragDrop, setDragDrop] = useState<InspectorBridge["dragDrop"]>(null);
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<InspectorBridge["replayResult"]>(null);

  const send = useCallback((cmd: BridgeCommand) => {
    // `<webview>.send` throws until the view is attached + `dom-ready`. An early
    // command (e.g. watchAnchors when threads load before the preview mounts) is
    // harmlessly dropped — the host re-syncs (tree/watchAnchors) once `ready`.
    try {
      webviewRef.current?.send(INSPECTOR_BRIDGE_CHANNEL, cmd);
    } catch {
      /* webview not ready yet */
    }
  }, []);

  const onIpcMessage = useCallback((raw: Event) => {
    const e = raw as WebviewIpcEvent;
    if (e.channel !== INSPECTOR_BRIDGE_CHANNEL) return;
    const parsed = bridgeEventSchema.safeParse(e.args?.[0]);
    if (!parsed.success) return;
    const event = parsed.data;
    switch (event.t) {
      case "ready":
        setReady(event.ok);
        setError(event.ok ? null : (event.message ?? "The inspector bridge could not attach."));
        return;
      case "tree":
        setTree(event.tree);
        return;
      case "readout": {
        const id = event.readout.nodeId;
        setReadout(event.readout);
        setSelectionLost(false); // a fresh readout means the node is alive again
        setRects((r) => ({ ...r, [id]: event.readout.rect }));
        if (!event.additive) {
          setSelectedId(id);
          setSelectedIds([id]);
          return;
        }
        // Additive: toggle. Removing the focused member hands focus to whatever is left rather than
        // leaving the panel pointed at something no longer selected.
        setSelectedIds((prev) => {
          if (!prev.includes(id)) {
            setSelectedId(id);
            return [...prev, id];
          }
          const next = prev.filter((x) => x !== id);
          setSelectedId(next[next.length - 1] ?? null);
          return next;
        });
        return;
      }
      case "matchedElements":
        setMatched((m) => ({ ...m, [event.key]: event.nodeIds }));
        return;
      case "selectionCleared":
        setSelectedId(null);
        setSelectedIds([]);
        setReadout(null);
        return;
      case "geometry":
        setRects((r) => ({ ...r, [event.nodeId]: event.rect }));
        return;
      case "hovered":
        setHoveredId(event.nodeId);
        if (event.nodeId && event.rect) {
          const rect = event.rect;
          setRects((r) => ({ ...r, [event.nodeId as string]: rect }));
        }
        return;
      case "runtimeError":
        setRuntimeError({ message: event.message, source: event.source, line: event.line, stack: event.stack });
        return;
      case "textEdited":
        setTextEdited({ nodeId: event.nodeId, text: event.text });
        return;
      case "contextMenu":
        setContextMenu({ nodeId: event.nodeId, x: event.x, y: event.y });
        return;
      case "undo":
        setUndoSignal((s) => ({ redo: event.redo, n: (s?.n ?? 0) + 1 }));
        return;
      case "selectionLost":
        // The selected node's element is gone after a re-render — drop the stale
        // selection so overlays/panels don't point at nothing.
        // Drop only the member that went away, and never substitute another element for it — a
        // selection that silently retargets is worse than one that shrinks.
        setSelectedIds((prev) => prev.filter((x) => x !== event.nodeId));
        setSelectedId((cur) => (cur === event.nodeId ? null : cur));
        setReadout((r) => (r?.nodeId === event.nodeId ? null : r));
        setSelectionLost(true);
        return;
      case "commentTarget":
        setCommentTarget({
          nodeId: event.nodeId,
          fingerprint: event.fingerprint,
          label: event.label,
          component: event.component,
          rect: event.rect,
        });
        return;
      case "anchorRects":
        setAnchorRects(event.rects);
        return;
      case "insertTarget":
        setInsertTarget(event.target);
        return;
      case "placeholderReady":
        setPlaceholder({ target: event.target, rect: event.rect });
        setInsertTarget(null); // the line gives way to the placeholder
        setPlaceholderLost(null);
        return;
      case "placeholderLost":
        // The slot's anchor couldn't be re-acquired after a reload — surface the
        // reason and drop the placeholder (never point at the wrong element).
        setPlaceholder(null);
        setPlaceholderLost(event.message);
        return;
      case "structure":
        setStructure(event.snapshot);
        return;
      case "replayResult":
        setReplayResult({ applied: event.applied, missing: event.missing });
        return;
      case "dragStart":
        setDrag({ sourceFingerprint: event.sourceFingerprint, nodeId: event.nodeId, ghost: event.rect, target: null, poppedOut: false });
        setDragMessage(null);
        setDragDrop(null);
        return;
      case "dragTarget":
        // Per-frame update: keep the drag's identity, refresh the ghost + slot.
        setDrag((cur) =>
          cur ? { ...cur, ghost: event.ghost, target: event.target, poppedOut: event.poppedOut } : cur,
        );
        return;
      case "dragDrop":
        setDrag(null);
        if (event.target) {
          // A valid slot → hand it to the host to open the gated move.
          setDragDrop({
            sourceFingerprint: event.sourceFingerprint,
            sourceLabel: event.sourceLabel,
            sourceText: event.sourceText,
            sourceDataSource: event.sourceDataSource,
            sourceListIndex: event.sourceListIndex,
            target: event.target,
            poppedOut: event.poppedOut,
          });
        } else {
          // A drop belonging to no container is refused (never guessed).
          setDragMessage("That spot isn't a layout slot — drop the element onto a row or column.");
        }
        return;
      case "dragCancel":
        setDrag(null);
        if (event.message) setDragMessage(event.message);
        return;
    }
  }, []);

  const attach = useCallback(
    (el: WebviewEl | null) => {
      webviewRef.current = el;
      if (!el) {
        // Old element unmounted (React calls the ref with null before mounting the new one).
        attachedEl.current = null;
        return;
      }
      if (attachedEl.current !== el) {
        // A NEW webview element (first mount, or a remount after `src`/key changed) — wire it up.
        // Force `ready` false now: a remount carries over the old element's `ready=true`, and if the
        // new element's `did-start-loading` is missed, the ready→true transition (which re-syncs mode,
        // light-mode, and the tree) would never fire. Starting from false guarantees that transition.
        attachedEl.current = el;
        setReady(false);
        el.addEventListener("ipc-message", onIpcMessage);
        // Reset on load START (before the guest re-attaches) so we don't clobber
        // the guest's `ready`/`tree` that arrive right after DOMContentLoaded.
        el.addEventListener("did-start-loading", () => {
          setReady(false);
          setRuntimeError(null);
        });
        // Once the guest DOM is ready, ask for the tree (belt-and-suspenders vs
        // the guest's own auto-send).
        el.addEventListener("dom-ready", () => el.send(INSPECTOR_BRIDGE_CHANNEL, { t: "requestTree" }));
        // Surface guest-side failures in the IDE console (they otherwise stay in
        // the guest page's own console and fail silently).
        el.addEventListener("console-message", (e) => {
          const m = e as unknown as { message?: string; level?: number };
          if (m.message) console.log("[run-canvas guest]", m.message);
        });
        el.addEventListener("did-fail-load", (e) => console.warn("[run-canvas guest] did-fail-load", e));
      }
    },
    [onIpcMessage],
  );

  const select = useCallback(
    (id: string | null, additive = false) => {
      setSelectionLost(false);
      if (id === null) {
        setSelectedId(null);
        setSelectedIds([]);
        setReadout(null);
        send({ t: "clearOverride" });
        return;
      }
      // The guest echoes the readout (with `additive`), and THAT is what updates the set — so a
      // selection made from the tree and one made on the canvas converge through one code path.
      send({ t: "selectNode", nodeId: id, additive });
    },
    [send],
  );

  const hover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      send({ t: "hoverNode", nodeId: id });
    },
    [send],
  );

  const setMode = useCallback(
    (mode: CanvasMode) => {
      // Leaving insert mode clears its transient host state right away (the guest
      // tears down its own affordances in parallel).
      if (mode !== "insert") {
        setInsertTarget(null);
        setPlaceholder(null);
        setPlaceholderLost(null);
      }
      // Drag lives inside inspect mode (Decision 3) — leaving it drops any drag state.
      if (mode !== "inspect") {
        setDrag(null);
        setDragDrop(null);
        setDragMessage(null);
      }
      send({ t: "setMode", mode });
    },
    [send],
  );
  const resizePlaceholder = useCallback(
    (size: { width?: number; height?: number }) => send({ t: "resizePlaceholder", ...size }),
    [send],
  );
  const dismissPlaceholder = useCallback(() => {
    setPlaceholder(null);
    setInsertTarget(null);
    send({ t: "dismissPlaceholder" });
  }, [send]);
  const previewOption = useCallback((option: number | null) => send({ t: "previewOption", option }), [send]);
  const setPlaceholderSpec = useCallback(
    (axis: "row" | "column", slotCount: number) => send({ t: "setPlaceholderSpec", axis, slotCount }),
    [send],
  );
  const requestStructure = useCallback(
    (nodeId: string | null = null) => send({ t: "requestStructure", nodeId }),
    [send],
  );
  const cancelDrag = useCallback(() => {
    setDrag(null);
    send({ t: "cancelDrag" });
  }, [send]);
  const revertMove = useCallback(() => send({ t: "revertMove" }), [send]);
  const clearMove = useCallback(() => send({ t: "clearMove" }), [send]);
  const watchAnchors = useCallback((fingerprints: string[]) => send({ t: "watchAnchors", fingerprints }), [send]);
  const scrollToAnchor = useCallback((fingerprint: string) => send({ t: "scrollToAnchor", fingerprint }), [send]);
  const captureThumbnail = useCallback(async (rect: Rect): Promise<string> => {
    // Electron <webview>.capturePage(rect) → NativeImage; downscale to a thumbnail.
    const wv = webviewRef.current as unknown as {
      capturePage?: (r: { x: number; y: number; width: number; height: number }) => Promise<{
        toDataURL: () => string;
        resize: (o: { width: number }) => { toDataURL: () => string };
      }>;
    } | null;
    if (!wv?.capturePage || rect.width < 1 || rect.height < 1) return "";
    try {
      const img = await wv.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      return img.resize({ width: 160 }).toDataURL();
    } catch {
      return "";
    }
  }, []);

  const setText = useCallback((id: string, text: string) => send({ t: "setText", nodeId: id, text }), [send]);
  const removeNode = useCallback((id: string) => send({ t: "removeNode", nodeId: id }), [send]);
  const moveNode = useCallback(
    (id: string, targetId: string, position: "before" | "after" | "inside") => send({ t: "moveNode", nodeId: id, targetId, position }),
    [send],
  );
  const setClass = useCallback(
    (id: string, remove: string[], add: string[]) => send({ t: "setClass", nodeId: id, remove, add }),
    [send],
  );

  const applyOverride = useCallback(
    (id: string, css: Record<string, string>) => send({ t: "applyOverride", nodeId: id, css }),
    [send],
  );
  const clearOverride = useCallback((id?: string) => send({ t: "clearOverride", nodeId: id }), [send]);
  const replayOverrides = useCallback<InspectorBridge["replayOverrides"]>(
    (edits) =>
      send({
        t: "replayOverrides",
        edits: edits.map((e) => ({
          fingerprint: e.fingerprint,
          css: e.css,
          text: e.text,
          removeClasses: e.removeClasses ?? [],
          addClasses: e.addClasses ?? [],
        })),
      }),
    [send],
  );
  // Re-read the selected node's computed styles after a discrete edit or a clear, so
  // the Design panel reflects the element's *actual* state (ephemeral overrides only
  // emit geometry, not a fresh readout, so the panel would otherwise go stale). Sent
  // after the mutating command on the same ordered channel, so it sees the new state.
  const refreshReadout = useCallback(
    (id?: string) => {
      const target = id ?? selectedId;
      if (target) send({ t: "selectNode", nodeId: target });
    },
    [selectedId, send],
  );
  const requestTree = useCallback(() => send({ t: "requestTree" }), [send]);
  /** Ask which elements currently look the same as `value` for `cssProp`, under `component`. */
  const matchElements = useCallback(
    (key: string, component: string, cssProp: string, value: string) =>
      send({ t: "matchElements", key, component, cssProp, value }),
    [send],
  );
  const reload = useCallback(() => webviewRef.current?.reload(), []);
  const setLightMode = useCallback((on: boolean) => send({ t: "setLightMode", on }), [send]);
  const loadUrl = useCallback((url: string) => {
    try {
      webviewRef.current?.loadURL(url);
    } catch {
      /* webview not ready — the caller can retry */
    }
  }, []);
  const serializeDom = useCallback(async (): Promise<string | null> => {
    const wv = webviewRef.current;
    if (!wv) return null;
    // Run in the guest: clone the live document, strip the bridge's instrumentation (any `data-vs*`
    // attribute, contenteditable, overlay/injected style/script), and return clean HTML. The live DOM
    // already reflects every edit (live overrides + ephemeral moves), so this is the page's new source.
    const code = `(() => {
      const root = document.documentElement.cloneNode(true);
      root.querySelectorAll('[data-vs-overlay]').forEach((n) => n.remove());
      root.querySelectorAll('style[data-vs-style], style[data-vs], script[data-vs]').forEach((n) => n.remove());
      root.querySelectorAll('*').forEach((el) => {
        Array.from(el.attributes).forEach((a) => { if (a.name.indexOf('data-vs') === 0) el.removeAttribute(a.name); });
        if (el.hasAttribute('contenteditable')) el.removeAttribute('contenteditable');
      });
      return '<!doctype html>\\n' + root.outerHTML;
    })()`;
    try {
      const html = await wv.executeJavaScript(code);
      return typeof html === "string" ? html : null;
    } catch {
      return null;
    }
  }, []);

  return {
    attach,
    ready,
    error,
    tree,
    readout,
    selectedId,
    selectedIds,
    matched,
    matchElements,
    hoveredId,
    rects,
    runtimeError,
    clearRuntimeError: useCallback(() => setRuntimeError(null), []),
    textEdited,
    clearTextEdited: useCallback(() => setTextEdited(null), []),
    contextMenu,
    clearContextMenu: useCallback(() => setContextMenu(null), []),
    undoSignal,
    clearUndoSignal: useCallback(() => setUndoSignal(null), []),
    selectionLost,
    clearSelectionLost: useCallback(() => setSelectionLost(false), []),
    commentTarget,
    clearCommentTarget: useCallback(() => setCommentTarget(null), []),
    insertTarget,
    placeholder,
    placeholderLost,
    clearPlaceholderLost: useCallback(() => setPlaceholderLost(null), []),
    resizePlaceholder,
    dismissPlaceholder,
    setPlaceholderSpec,
    previewOption,
    structure,
    requestStructure,
    replayResult,
    clearReplayResult: useCallback(() => setReplayResult(null), []),
    drag,
    dragDrop,
    clearDragDrop: useCallback(() => setDragDrop(null), []),
    dragMessage,
    clearDragMessage: useCallback(() => setDragMessage(null), []),
    cancelDrag,
    revertMove,
    clearMove,
    anchorRects,
    watchAnchors,
    scrollToAnchor,
    captureThumbnail,
    setText,
    removeNode,
    moveNode,
    setClass,
    select,
    hover,
    setMode,
    applyOverride,
    clearOverride,
    replayOverrides,
    refreshReadout,
    requestTree,
    reload,
    loadUrl,
    serializeDom,
    setLightMode,
  };
}
