/**
 * Playground viewports — Desktop / Tablet / Mobile breakpoints for the Run canvas
 * (change: canvas-viewports). Switching viewport resizes the emulated preview
 * (Chrome DevTools device mode): the webview is rendered at the viewport's CSS px
 * width so the page's own media queries respond, then scaled to fit the canvas.
 *
 * Widths default to standard breakpoints and can be overridden by the project's
 * Figma breakpoint variables (synced as tokens named breakpoint/screen/viewport).
 */

export type ViewportId = "desktop" | "tablet" | "mobile";
export type DeviceFrameKind = "none" | "iphone" | "android";

export interface Viewport {
  id: ViewportId;
  label: string;
  /** Emulated CSS px width; `null` = fill the canvas (Desktop, responsive full-width). */
  width: number | null;
  /** Emulated CSS px height; `null` = fill the canvas. */
  height: number | null;
}

export const DEFAULT_VIEWPORTS: Record<ViewportId, Viewport> = {
  desktop: { id: "desktop", label: "Desktop", width: null, height: null },
  tablet: { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  mobile: { id: "mobile", label: "Mobile", width: 390, height: 844 },
};

/** Bar order — Desktop leads (the resting state). */
export const VIEWPORT_ORDER: ViewportId[] = ["desktop", "tablet", "mobile"];

/** A device frame only makes sense for the phone/tablet emulations. */
export function frameApplies(id: ViewportId): boolean {
  return id === "mobile" || id === "tablet";
}

/**
 * The Tailwind variant an edit made in each viewport is scoped to (responsive editing).
 * Desktop is the base (no prefix — the default appearance at every width unless a smaller
 * breakpoint overrides). Mobile/Tablet use max-width variants so a change there affects ONLY
 * that view: `max-md:` = below 768px (mobile), `md:max-lg:` = 768–1023px (tablet).
 */
export const VIEWPORT_VARIANT: Record<ViewportId, string> = {
  desktop: "",
  tablet: "md:max-lg:",
  mobile: "max-md:",
};

/** Human label for the breakpoint an edit in `id` targets — for the Apply prompt. */
export const VIEWPORT_BREAKPOINT_LABEL: Record<ViewportId, string> = {
  desktop: "all widths (the base/default)",
  tablet: "tablet only (768px–1023px)",
  mobile: "mobile only (below 768px)",
};

/**
 * Whether an edit made in `editVp` should render live while viewing `current`. A base
 * (desktop) edit applies everywhere; a viewport-scoped (mobile/tablet) edit shows only in
 * its own viewport — so switching views re-scopes the preview to match the source.
 */
export function appliesInViewport(editVp: ViewportId | undefined, current: ViewportId): boolean {
  if (!editVp || editVp === "desktop") return true;
  return editVp === current;
}

const leadingPx = (v: string): number | null => {
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1]));
  return n >= 240 && n <= 4000 ? n : null; // a plausible viewport width, not a stray value
};

/**
 * Override Tablet/Mobile widths from Figma breakpoint variables synced as tokens.
 * Conservative on purpose: only tokens whose NAME clearly names a breakpoint (so a
 * spacing token like `space-md` is never mistaken for one). Defaults stand otherwise.
 */
export function viewportsFromTokens(tokens: { name: string; resolvedValue: string }[]): Record<ViewportId, Viewport> {
  const out: Record<ViewportId, Viewport> = {
    desktop: { ...DEFAULT_VIEWPORTS.desktop },
    tablet: { ...DEFAULT_VIEWPORTS.tablet },
    mobile: { ...DEFAULT_VIEWPORTS.mobile },
  };
  const isBreakpoint = /break\s*-?point|\bbreakpoint\b|\bscreens?\b|\bviewports?\b|\bbp\b/i;
  for (const t of tokens) {
    const n = t.name.toLowerCase();
    const named = isBreakpoint.test(n);
    const hasDevice = /tablet|mobile|phone|desktop/.test(n);
    if (!named && !hasDevice) continue;
    const w = leadingPx(t.resolvedValue);
    if (w === null) continue;
    if (/tablet/.test(n)) out.tablet.width = w;
    else if (/mobile|phone/.test(n)) out.mobile.width = w;
  }
  return out;
}
