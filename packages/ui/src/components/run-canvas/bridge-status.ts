import type { CanvasMode } from "../../lib/useInspectorBridge";

/**
 * Shared bridge-liveness vocabulary for the canvas (change: canvas-compose-and-preview-bar).
 *
 * Both the toolbar (which disables modes) and the canvas notice (which explains
 * why) have to agree on two things: when the bridge counts as unusable, and what
 * we tell the user about it. Keeping either in two places is what produced the
 * duplicated mode toggle this change exists to delete.
 */

/** Modes that need the guest bridge attached; Interact never does. */
export const NEEDS_BRIDGE: ReadonlySet<CanvasMode> = new Set<CanvasMode>(["inspect", "comment", "insert"]);

/**
 * Liveness of the guest bridge.
 *
 * `connecting` is NOT `failed`. The bridge resets to not-ready on every guest
 * load (`did-start-loading` → `setReady(false)`), and the agent editing files is
 * this app's core loop, so a live reload passes through `connecting` constantly.
 * Treating that window as failure would disable Inspect/Comment several times a
 * minute and swallow the clicks that land in it.
 */
export type BridgeState = "live" | "connecting" | "failed";

export function bridgeState(ready: boolean, error: string | null | undefined): BridgeState {
  if (error) return "failed";
  return ready ? "live" : "connecting";
}

/**
 * The one "visual editing unavailable" sentence: what broke, plus the next step.
 * Rendered as the canvas notice and reused verbatim as the toolbar's disabled
 * reason — one string, so the two can't drift apart.
 */
export function bridgeStatusMessage(state: BridgeState, error?: string | null): string {
  switch (state) {
    case "live":
      return "Visual editing is live on this page.";
    case "connecting":
      return "Waiting for the page to connect — you can still use the app in Interact.";
    case "failed":
      return `Visual editing unavailable on this page — ${error}. You can still use the app in Interact.`;
  }
}
