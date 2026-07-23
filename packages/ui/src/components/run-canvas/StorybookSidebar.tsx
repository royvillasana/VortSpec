import { createElement, useEffect, useRef } from "react";

/**
 * StorybookSidebar — the REAL Storybook navigation, cropped into the dock's Stories tab.
 *
 * Instead of hand-rolling a nav from `index.json`, we embed the native Storybook
 * *manager* (its full UI: search + collapsible tree + docs/story entries) in an
 * Electron <webview>, then geometry-crop it so only its left sidebar shows — the
 * manager's preview column is scrolled off to the right and clipped by the wrapper.
 *
 * Selection sync (sidebar → canvas) rides the manager's own URL: picking a story
 * updates the webview's `?path=/story/<id>` (or `/docs/<id>`). The IDE renderer and
 * Storybook (localhost) are cross-origin, but a <webview> lets the host read
 * `getURL()` and fires `did-navigate-in-page` on those in-page pushState changes —
 * so we parse the id/viewMode out and hand it up to drive the story-only canvas.
 */

// The manager is rendered WIDE so Storybook stays in its DESKTOP layout (sidebar on the
// left — its mobile layout hides the sidebar behind a menu). The wrapper clips it to the
// dock width, which the IDE pins to Storybook's default nav width (300px) so the sidebar's
// right edge lands exactly at the clip — no crop, no leftover preview sliver.
const MANAGER_WIDTH = 1024;

// Best-effort crop polish injected into the manager: drop the preview iframe and the
// column-resize handle so, if the dock is ever wider than the sidebar, the exposed area
// reads as empty Storybook chrome (not a sliver of the story) and there's no stray resizer
// at the clip edge. Storybook's manager DOM uses hashed styled-components classes, so we
// lean on the few STABLE preview ids and keep every rule defensive — a rule that matches
// nothing is simply inert, and the correctness (no crop) never depends on these hitting.
const CROP_CSS = `
  /* Never let the manager scroll horizontally into the preview. */
  html, body { overflow-x: hidden !important; }
  /* The preview iframe + its wrapping column (stable ids across SB 7/8). */
  #storybook-preview-iframe,
  #storybook-preview-wrapper,
  [id^="storybook-preview"] { display: none !important; }
  /* The draggable handle that sits between the nav and preview columns. */
  [class*="resizer"],
  [class*="Resizer"] { display: none !important; }
`;

type ViewMode = "story" | "docs";

/** Pull the story id + view mode out of a manager URL's `?path=/story/<id>`. */
function parsePath(rawUrl: string): { id: string; viewMode: ViewMode } | null {
  try {
    const url = new URL(rawUrl);
    const path = url.searchParams.get("path");
    if (!path) return null;
    const m = path.match(/^\/(story|docs)\/(.+)$/);
    if (!m) return null;
    return { id: m[2], viewMode: m[1] === "docs" ? "docs" : "story" };
  } catch {
    return null;
  }
}

export function StorybookSidebar({
  src,
  onSelect,
}: {
  /** The Storybook manager root URL (dev server URL, trailing slash). */
  src: string;
  /** Fired when the user picks a story/doc in the native sidebar. */
  onSelect: (id: string, viewMode: ViewMode) => void;
}): React.JSX.Element {
  // The <webview> DOM node — typed loosely (Electron intrinsic, not in React's JSX).
  const ref = useRef<HTMLElement & {
    getURL?: () => string;
    insertCSS?: (css: string) => Promise<string>;
  } | null>(null);
  // Keep the latest onSelect without re-subscribing the webview listeners.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const wv = ref.current;
    // In the CT browser there is no Electron <webview>, so these APIs are absent —
    // render the element (so its src is assertable) but skip the live wiring.
    if (!wv || typeof wv.getURL !== "function") return;

    const applyCrop = (): void => {
      void wv.insertCSS?.(CROP_CSS).catch(() => undefined);
    };
    const relaySelection = (): void => {
      const hit = parsePath(wv.getURL?.() ?? "");
      if (hit) onSelectRef.current(hit.id, hit.viewMode);
    };

    // `dom-ready` fires once the manager document exists (re-inject on every
    // navigation the manager does its own full loads rarely, but be safe).
    wv.addEventListener("dom-ready", applyCrop);
    // In-page pushState (`?path=…`) is how Storybook records the selected story.
    wv.addEventListener("did-navigate-in-page", relaySelection);
    // A hard navigation (initial load lands on the auto-selected first story).
    wv.addEventListener("did-navigate", relaySelection);
    return () => {
      wv.removeEventListener("dom-ready", applyCrop);
      wv.removeEventListener("did-navigate-in-page", relaySelection);
      wv.removeEventListener("did-navigate", relaySelection);
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-vs-bg-surface">
      {createElement("webview", {
        ref,
        src,
        // Match the main window so the manager loads normally; no guest preload here —
        // we only observe the URL, we don't instrument the page.
        webpreferences: "sandbox=no,contextIsolation=yes,nodeIntegration=no",
        // Wide + absolutely positioned: desktop layout renders, the wrapper clips it to
        // the dock width so only the left sidebar is visible.
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: MANAGER_WIDTH,
          height: "100%",
          border: 0,
          display: "flex",
        },
      })}
    </div>
  );
}
