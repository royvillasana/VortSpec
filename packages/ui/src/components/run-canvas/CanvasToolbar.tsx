import type { JSX } from "react";
import type { CanvasMode } from "../../lib/useInspectorBridge";
import { NEEDS_BRIDGE, bridgeState, bridgeStatusMessage, type BridgeState } from "./bridge-status";

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

/** Modes and their labels, in bar order. Interact leads — it is the resting state. */
const MODES: { key: CanvasMode; label: string; hint: string }[] = [
  { key: "interact", label: "Interact", hint: "Use the running app — VortSpec doesn't intercept anything" },
  { key: "inspect", label: "Inspect", hint: "Hover and click to select an element" },
  { key: "comment", label: "Comment", hint: "Pin a comment thread to the page" },
  { key: "insert", label: "Insert", hint: "Point at the gap between elements to compose something new there" },
];

export function CanvasToolbar({
  mode,
  onModeChange,
  zoom,
  onZoomBy,
  onZoomReset,
  bridgeReady,
  bridgeError,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  zoom: number;
  onZoomBy: (factor: number) => void;
  onZoomReset: () => void;
  /** Whether the guest bridge has attached to the page. */
  bridgeReady: boolean;
  /** Why the bridge is unavailable, when it is — shown as the disabled reason. */
  bridgeError?: string | null;
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
              title={blocked ? reason : m.hint}
            />
          );
        })}
      </div>

      <span className="mx-0.5 h-4 w-px bg-vs-border-subtle" aria-hidden />

      <div className="flex items-center gap-0.5 text-[11px]">
        <ZoomBtn onClick={() => onZoomBy(1 / 1.2)} label="−" title="Zoom out" />
        <button
          type="button"
          onClick={onZoomReset}
          title="Reset to 100%"
          className="min-w-[2.75rem] rounded px-1 py-0.5 text-center text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomBtn onClick={() => onZoomBy(1.2)} label="+" title="Zoom in" />
      </div>
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
      className="ml-1 mr-0.5 grid h-4 w-4 place-items-center"
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
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  title: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
        active
          ? "bg-vs-accent text-white"
          : disabled
            ? "cursor-not-allowed text-vs-text-muted opacity-50"
            : "text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function ZoomBtn({ onClick, label, title }: { onClick: () => void; label: string; title: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-5 w-5 place-items-center rounded text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary"
    >
      {label}
    </button>
  );
}
