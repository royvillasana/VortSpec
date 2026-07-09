import { useCallback, useRef, useState } from "react";
import {
  INSPECTOR_BRIDGE_CHANNEL,
  bridgeEventSchema,
  type BridgeCommand,
  type BridgeTree,
  type NodeReadout,
  type Rect,
} from "@vortspec/core/ipc";

/** Minimal shape of an Electron <webview> element (typed loosely to avoid the dep). */
interface WebviewEl extends HTMLElement {
  send(channel: string, ...args: unknown[]): void;
  reload(): void;
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
  /** Set an element's visible text live (from the sidebar Content input). */
  setText: (id: string, text: string) => void;
  /** Swap classes on an element for a live variant preview. */
  setClass: (id: string, remove: string[], add: string[]) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  /** Toggle guest input handling between selecting (inspect) and using the app (interact). */
  setMode: (mode: "inspect" | "interact") => void;
  applyOverride: (id: string, css: Record<string, string>) => void;
  clearOverride: (id?: string) => void;
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

  const send = useCallback((cmd: BridgeCommand) => {
    webviewRef.current?.send(INSPECTOR_BRIDGE_CHANNEL, cmd);
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
    (mode: "inspect" | "interact") => send({ t: "setMode", mode }),
    [send],
  );

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
    setText,
    setClass,
    select,
    hover,
    setMode,
    applyOverride,
    clearOverride,
    requestTree,
    reload,
  };
}
