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
  selectedId: string | null;
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
  /** True when the selected node's element vanished after a re-render (couldn't be re-acquired). */
  selectionLost: boolean;
  clearSelectionLost: () => void;
  /** Set an element's visible text live (from the sidebar Content input). */
  setText: (id: string, text: string) => void;
  /** Swap classes on an element for a live variant preview. */
  setClass: (id: string, remove: string[], add: string[]) => void;
  select: (id: string | null) => void;
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
  /** The live drag in progress (ghost rect trailing the pointer + current drop slot), or null. */
  drag: {
    sourceFingerprint: string;
    nodeId: string;
    ghost: Rect;
    target: InsertTargetWire | null;
    poppedOut: boolean;
  } | null;
  /** A completed drop over a valid slot the host should turn into a gated move, or null. */
  dragDrop: { sourceFingerprint: string; target: InsertTargetWire; poppedOut: boolean } | null;
  clearDragDrop: () => void;
  /** A human sentence for an invalid drop or a force-cancelled drag (HMR-lost), else null. */
  dragMessage: string | null;
  clearDragMessage: () => void;
  /** Abort an in-flight drag from the host (the move panel closed / the flow reset). */
  cancelDrag: () => void;
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
  /** Re-request the selected node's readout so the panel reflects its actual state
   *  after a discrete edit or a cleared override. Defaults to the current selection. */
  refreshReadout: (id?: string) => void;
  requestTree: () => void;
  /** Reload the guest page (e.g. after a committed edit) — the bridge re-attaches. */
  reload: () => void;
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
  const attached = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<BridgeTree | null>(null);
  const [readout, setReadout] = useState<NodeReadout | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [runtimeError, setRuntimeError] = useState<InspectorBridge["runtimeError"]>(null);
  const [textEdited, setTextEdited] = useState<InspectorBridge["textEdited"]>(null);
  const [contextMenu, setContextMenu] = useState<InspectorBridge["contextMenu"]>(null);
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
      case "readout":
        setReadout(event.readout);
        setSelectedId(event.readout.nodeId);
        setSelectionLost(false); // a fresh readout means the node is alive again
        setRects((r) => ({ ...r, [event.readout.nodeId]: event.readout.rect }));
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
      case "selectionLost":
        // The selected node's element is gone after a re-render — drop the stale
        // selection so overlays/panels don't point at nothing.
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
          setDragDrop({ sourceFingerprint: event.sourceFingerprint, target: event.target, poppedOut: event.poppedOut });
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
      if (el && !attached.current) {
        attached.current = true;
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
    (id: string | null) => {
      setSelectedId(id);
      setSelectionLost(false);
      if (id === null) {
        setReadout(null);
        send({ t: "clearOverride" });
      } else {
        send({ t: "selectNode", nodeId: id });
      }
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
  const setClass = useCallback(
    (id: string, remove: string[], add: string[]) => send({ t: "setClass", nodeId: id, remove, add }),
    [send],
  );

  const applyOverride = useCallback(
    (id: string, css: Record<string, string>) => send({ t: "applyOverride", nodeId: id, css }),
    [send],
  );
  const clearOverride = useCallback((id?: string) => send({ t: "clearOverride", nodeId: id }), [send]);
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
  const reload = useCallback(() => webviewRef.current?.reload(), []);

  return {
    attach,
    ready,
    error,
    tree,
    readout,
    selectedId,
    hoveredId,
    rects,
    runtimeError,
    clearRuntimeError: useCallback(() => setRuntimeError(null), []),
    textEdited,
    clearTextEdited: useCallback(() => setTextEdited(null), []),
    contextMenu,
    clearContextMenu: useCallback(() => setContextMenu(null), []),
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
    drag,
    dragDrop,
    clearDragDrop: useCallback(() => setDragDrop(null), []),
    dragMessage,
    clearDragMessage: useCallback(() => setDragMessage(null), []),
    cancelDrag,
    anchorRects,
    watchAnchors,
    scrollToAnchor,
    captureThumbnail,
    setText,
    setClass,
    select,
    hover,
    setMode,
    applyOverride,
    clearOverride,
    refreshReadout,
    requestTree,
    reload,
  };
}
