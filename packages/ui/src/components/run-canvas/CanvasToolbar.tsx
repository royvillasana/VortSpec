import { useEffect, useRef, useState } from "react";
import type { JSX, ComponentType } from "react";
import { MousePointer2, SquareMousePointer, MessageSquare, Plus, Monitor, Tablet, Smartphone, Check, Loader2, RefreshCw, PenLine } from "lucide-react";
import { FigmaIcon } from "./FigmaIcon";
import type { CanvasMode } from "../../lib/useInspectorBridge";
import { NEEDS_BRIDGE, bridgeState, bridgeStatusMessage, type BridgeState } from "./bridge-status";
import { VIEWPORT_ORDER, DEFAULT_VIEWPORTS, frameApplies, type Viewport, type ViewportId, type DeviceFrameKind } from "./viewports";

/**
 * The canvas toolbar (change: canvas-compose-and-preview-bar).
 *
 * One floating bar, pinned bottom-center over the canvas viewport, owning the
 * input modes and the zoom controls for both the Run and Playground activities.
 *
 * It is deliberately owned by the CANVAS, not by whichever sidebar panel happens
 * to be mounted. The previous arrangement put these controls in the Design
 * panel's Layers header, which forced the Comments panel — which *replaces* the
 * Design panel in comment mode — to re-implement the same toggle so users
 * weren't stranded. Two copies, kept in sync by hand. Hanging the controls off
 * the canvas removes the panel-swap coupling that caused the duplication, so
 * there is exactly one implementation again.
 *
 * Modes are mutually exclusive and `interact` is the resting state: it passes
 * all input to the running app untouched. The bridge-status dot exists so
 * "the app is broken" reads differently from "visual editing is unavailable" —
 * and when the bridge is down, Interact stays live so the app remains usable.
 */

/** Modes, their labels + icons, in bar order. Interact leads — it is the resting state. */
const MODES: { key: CanvasMode; label: string; hint: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "interact", label: "Interact", hint: "Use the running app — VortSpec doesn't intercept anything", icon: MousePointer2 },
  { key: "inspect", label: "Edit", hint: "Click to select and edit an element", icon: SquareMousePointer },
  { key: "comment", label: "Comment", hint: "Pin a comment thread to the page", icon: MessageSquare },
  { key: "insert", label: "Insert", hint: "Point at the gap between elements to compose something new there", icon: Plus },
];

export function CanvasToolbar({
  mode,
  onModeChange,
  viewport,
  frame,
  onViewportChange,
  onFrameChange,
  bridgeReady,
  bridgeError,
  onSendToFigma,
  onUpdateFromFigma,
  figmaStatus = "idle",
  figmaConnected = false,
  figmaMapped = false,
  onOpenDraw,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  /** Current Playground viewport (Desktop/Tablet/Mobile). */
  viewport: Viewport;
  /** Device frame drawn around a Tablet/Mobile viewport. */
  frame: DeviceFrameKind;
  onViewportChange: (id: ViewportId) => void;
  onFrameChange: (frame: DeviceFrameKind) => void;
  /** Whether the guest bridge has attached to the page. */
  bridgeReady: boolean;
  /** Why the bridge is unavailable, when it is — shown as the disabled reason. */
  bridgeError?: string | null;
  /** Send the currently-previewed screen to Figma. Omit to hide the Figma control entirely. */
  onSendToFigma?: () => void;
  /** Pull the current screen's Figma changes back into code ("Update from Figma"). */
  onUpdateFromFigma?: () => void;
  /** In-place status of the send/pull round-trip. */
  figmaStatus?: "idle" | "sending" | "sent" | "error";
  /** Whether Figma is connected (figma-cli or the user's MCP) — gates the control. */
  figmaConnected?: boolean;
  /** Whether the current screen already has a Figma frame — gates "Update from Figma". */
  figmaMapped?: boolean;
  /** Open the separate Draw window (sketch → design-system component). Omit to hide the launcher. */
  onOpenDraw?: () => void;
}): JSX.Element {
  // Only a bridge that has actually FAILED disables a mode. A bridge that is
  // merely still attaching must not: `ready` drops to false on every guest load
  // (useInspectorBridge `did-start-loading`), so gating on `!ready` would kill
  // Inspect/Comment on each of the agent-driven reloads this app is built around.
  const state = bridgeState(bridgeReady, bridgeError);
  const reason = bridgeStatusMessage(state, bridgeError);

  return (
    <div
      data-vs-overlay
      data-testid="canvas-toolbar"
      // z-40 keeps the bar clickable above the context menu's dismiss backdrop (z-30).
      className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-vs-border-default bg-vs-bg-elevated/95 px-1.5 py-1 shadow-2xl backdrop-blur"
    >
      <BridgeDot state={state} reason={reason} />

      <span className="mx-0.5 h-4 w-px bg-vs-border-subtle" aria-hidden />

      <div role="group" aria-label="Canvas mode" className="flex items-center gap-0.5">
        {MODES.map((m) => {
          const blocked = state === "failed" && NEEDS_BRIDGE.has(m.key);
          return (
            <ModeBtn
              key={m.key}
              active={mode === m.key}
              disabled={blocked}
              onClick={() => onModeChange(m.key)}
              label={m.label}
              icon={m.icon}
              tip={blocked ? reason : m.label}
            />
          );
        })}
      </div>

      <span className="mx-0.5 h-4 w-px bg-vs-border-subtle" aria-hidden />

      <ViewportSelector
        viewport={viewport}
        frame={frame}
        onViewportChange={onViewportChange}
        onFrameChange={onFrameChange}
      />

      {onOpenDraw && (
        <>
          <span className="mx-0.5 h-4 w-px bg-vs-border-subtle" aria-hidden />
          <ModeBtn
            active={false}
            onClick={onOpenDraw}
            label="Draw"
            icon={PenLine}
            tip="Draw — sketch a component for the AI (opens a separate window)"
          />
        </>
      )}

      {onSendToFigma && (
        <>
          <span className="mx-0.5 h-4 w-px bg-vs-border-subtle" aria-hidden />
          <FigmaMenu
            onSend={onSendToFigma}
            onUpdate={onUpdateFromFigma}
            status={figmaStatus}
            connected={figmaConnected}
            mapped={figmaMapped}
          />
        </>
      )}
    </div>
  );
}

/**
 * The Figma control: a drop-up menu (the toolbar sits at the canvas bottom) with two
 * independent actions — "Send to Figma" (push the previewed screen) and "Update from Figma"
 * (pull this screen's Figma edits back). Send and pull are decoupled: send now, pull whenever.
 */
function FigmaMenu({
  onSend,
  onUpdate,
  status,
  connected,
  mapped,
}: {
  onSend: () => void;
  onUpdate?: () => void;
  status: "idle" | "sending" | "sent" | "error";
  connected: boolean;
  mapped: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const busy = status === "sending";
  return (
    <div ref={ref} className="group relative flex">
      <button
        type="button"
        onClick={() => connected && setOpen((o) => !o)}
        disabled={!connected}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Figma"
        data-testid="figma-menu-trigger"
        className={`grid h-7 w-7 place-items-center rounded transition-colors ${
          !connected
            ? "cursor-not-allowed text-vs-text-muted opacity-50"
            : "text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
        }`}
      >
        {busy ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <FigmaIcon size={16} />}
      </button>
      {!connected && <Tooltip>Connect Figma to send screens</Tooltip>}

      {open && (
        <div
          role="menu"
          data-testid="figma-menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-52 overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="figma-send"
            disabled={busy}
            onClick={() => {
              onSend();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FigmaIcon size={14} />
            <span className="flex-1">{busy ? "Sending…" : "Send to Figma"}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="figma-update"
            disabled={!mapped || busy || !onUpdate}
            title={mapped ? "Pull this screen's Figma changes back into code" : "Send this screen to Figma first"}
            onClick={() => {
              onUpdate?.();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} strokeWidth={2} />
            <span className="flex-1">Update from Figma</span>
          </button>
        </div>
      )}
    </div>
  );
}

const VIEWPORT_ICON: Record<ViewportId, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/**
 * The viewport picker that replaced the zoom controls: a button showing the current
 * viewport (icon + label), opening a menu of Desktop / Tablet / Mobile — and, for a
 * device viewport, a device-frame choice (None / iPhone / Android).
 */
function ViewportSelector({
  viewport,
  frame,
  onViewportChange,
  onFrameChange,
}: {
  viewport: Viewport;
  frame: DeviceFrameKind;
  onViewportChange: (id: ViewportId) => void;
  onFrameChange: (frame: DeviceFrameKind) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const Icon = VIEWPORT_ICON[viewport.id];
  const showFrames = frameApplies(viewport.id);
  const frames: { key: DeviceFrameKind; label: string }[] = [
    { key: "none", label: "No frame" },
    { key: "iphone", label: "iPhone" },
    { key: "android", label: "Android" },
  ];

  return (
    <div ref={ref} className="group relative flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Viewport"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
      >
        <Icon size={16} strokeWidth={2} />
        {viewport.width !== null && (
          <span className="font-mono text-[10px] text-vs-text-muted">
            {viewport.width}
            {viewport.height ? `×${viewport.height}` : ""}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-52 overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-elevated py-1 shadow-2xl"
        >
          {VIEWPORT_ORDER.map((id) => {
            const v = DEFAULT_VIEWPORTS[id];
            const ItemIcon = VIEWPORT_ICON[id];
            const active = id === viewport.id;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onViewportChange(id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] hover:bg-vs-bg-hover ${
                  active ? "text-vs-text-primary" : "text-vs-text-secondary"
                }`}
              >
                <ItemIcon size={15} strokeWidth={2} />
                <span className="flex-1">{v.label}</span>
                {v.width !== null && (
                  <span className="font-mono text-[10px] text-vs-text-muted">
                    {v.width}
                    {v.height ? `×${v.height}` : ""}
                  </span>
                )}
                {active && <Check size={13} className="text-vs-accent" />}
              </button>
            );
          })}

          {showFrames && (
            <>
              <div className="my-1 border-t border-vs-border-subtle" />
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted">
                Device frame
              </p>
              {frames.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={frame === f.key}
                  onClick={() => onFrameChange(f.key)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] hover:bg-vs-bg-hover ${
                    frame === f.key ? "text-vs-text-primary" : "text-vs-text-secondary"
                  }`}
                >
                  <span className="flex-1">{f.label}</span>
                  {frame === f.key && <Check size={13} className="text-vs-accent" />}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Liveness of the guest bridge — the difference between "app broken" and "editing unavailable". */
function BridgeDot({ state, reason }: { state: BridgeState; reason: string }): JSX.Element {
  // role="img" so the sentence is an accessible name a screen reader reports —
  // on a bare <span> it is not. Deliberately not role="status": the state flips
  // on every reload, and a live region would announce each one.
  return (
    <span
      role="img"
      title={reason}
      aria-label={reason}
      data-testid="canvas-bridge-status"
      data-state={state}
      className="ms-1 me-0.5 grid h-4 w-4 place-items-center"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[state]}`} />
    </span>
  );
}

/** Colour is a redundant channel — the accessible name above carries the same state. */
const DOT_CLASS: Record<BridgeState, string> = {
  live: "bg-emerald-500",
  connecting: "animate-pulse bg-amber-500",
  failed: "bg-red-500",
};

function ModeBtn({
  active,
  disabled,
  onClick,
  label,
  icon: Icon,
  tip,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  tip: string;
}): JSX.Element {
  return (
    <div className="group relative flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={`grid h-7 w-7 place-items-center rounded transition-colors ${
          active
            ? "bg-vs-accent text-white"
            : disabled
              ? "cursor-not-allowed text-vs-text-muted opacity-50"
              : "text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
        }`}
      >
        <Icon size={16} strokeWidth={2} />
      </button>
      <Tooltip>{tip}</Tooltip>
    </div>
  );
}

/** A small hover tooltip pinned above the control (the toolbar sits at the canvas bottom). */
function Tooltip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-vs-border-default bg-vs-bg-elevated px-2 py-1 text-[11px] font-medium text-vs-text-primary opacity-0 shadow-lg transition-[opacity,translate] duration-100 group-hover:translate-y-0 group-hover:opacity-100"
    >
      {children}
    </span>
  );
}

