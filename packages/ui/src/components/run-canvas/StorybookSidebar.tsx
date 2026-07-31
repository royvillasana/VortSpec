import { createElement, useEffect, useRef } from "react";

/**
 * StorybookSidebar — the REAL Storybook navigation, cropped into the dock's Stories tab.
 *
 * Instead of hand-rolling a nav from `index.json`, we embed the native Storybook
 * *manager* (its full UI: search + collapsible tree + docs/story entries) in an
 * Electron <webview>, then geometry-crop it so only its left sidebar shows — the
 * manager's preview column is scrolled off to the right and clipped by the wrapper.
 *
 * The dock sizes like every other section (a viewport fraction), which is usually
 * wider than Storybook's ~300px default sidebar. So we WIDEN the manager's sidebar
 * column to the dock width (a small script run inside the manager), and the nav
 * fills the container with crisp text — no zoom, no leftover dead strip.
 *
 * Selection sync (sidebar → canvas) rides the manager's own URL: picking a story
 * updates the webview's `?path=/story/<id>` (or `/docs/<id>`). The IDE renderer and
 * Storybook (localhost) are cross-origin, but a <webview> lets the host read
 * `getURL()` and fires `did-navigate-in-page` on those in-page pushState changes —
 * so we parse the id/viewMode out and hand it up to drive the story-only canvas.
 */

// The manager is rendered WIDE so Storybook stays in its DESKTOP layout (sidebar on the
// left — its mobile layout hides the sidebar behind a menu). The wrapper clips it to the
// dock width; the sidebar column is then widened to fill that width (see FILL_SIDEBAR_JS).
const MANAGER_WIDTH = 1024;

// Best-effort crop polish injected into the manager: drop the preview iframe and the
// column-resize handle so the exposed area never shows a sliver of the story or a stray
// resizer. Storybook's manager DOM uses hashed styled-components classes, so we lean on the
// few STABLE preview ids and keep every rule defensive — a rule that matches nothing is inert.
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

/**
 * A script run INSIDE the manager to widen Storybook's sidebar column to the dock width,
 * so the nav fills the container instead of leaving Storybook's default ~300px column.
 * Traversal-based (find the stable explorer tree, walk up to the sized column) so it never
 * depends on hashed classes; if it finds nothing it's simply inert and the sidebar keeps its
 * default width (the wrapper still clips cleanly — just with some empty space on the right).
 */
function fillSidebarJs(width: number): string {
  return `(function(W){
    try {
      var menu = document.querySelector('#storybook-explorer-menu')
        || document.querySelector('#storybook-explorer-tree')
        || document.querySelector('[aria-label="Storybook Explorer"]');
      if (!menu) return;
      var el = menu, target = null;
      // The sidebar column is the OUTERMOST ancestor still roughly nav-width (its parent,
      // the manager, is ~1024px and out of range) — keep the last in-range ancestor.
      while (el && el !== document.body) {
        var w = el.getBoundingClientRect().width;
        if (w > 220 && w < 480) target = el;
        el = el.parentElement;
      }
      if (!target) return;
      target.style.setProperty('width', W + 'px', 'important');
      target.style.setProperty('min-width', W + 'px', 'important');
      target.style.setProperty('max-width', W + 'px', 'important');
      target.style.setProperty('flex', '0 0 ' + W + 'px', 'important');
      // The canvas column (Storybook's toolbar + preview) sits BESIDE the sidebar as its
      // sibling(s); hide them so only the nav shows — no stray toolbar bleeding into the
      // widened sidebar. Structural (siblings of the sidebar column), not class-based.
      var sib = target.nextElementSibling;
      while (sib) { sib.style.setProperty('display', 'none', 'important'); sib = sib.nextElementSibling; }
    } catch (e) { /* inert on any failure */ }
  })(${Math.round(width)});`;
}

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
  // The clip wrapper — its width is the dock width the sidebar must fill.
  const wrapRef = useRef<HTMLDivElement>(null);
  // The <webview> DOM node — typed loosely (Electron intrinsic, not in React's JSX).
  const ref = useRef<HTMLElement & {
    getURL?: () => string;
    insertCSS?: (css: string) => Promise<string>;
    executeJavaScript?: (code: string) => Promise<unknown>;
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
    const applyFill = (): void => {
      const w = wrapRef.current?.clientWidth ?? 0;
      if (w > 0) void wv.executeJavaScript?.(fillSidebarJs(w)).catch(() => undefined);
    };
    const relaySelection = (): void => {
      const hit = parsePath(wv.getURL?.() ?? "");
      if (hit) onSelectRef.current(hit.id, hit.viewMode);
    };
    // `dom-ready` fires once the manager document exists — crop + fill on every (re)load.
    const onReady = (): void => {
      applyCrop();
      applyFill();
    };

    wv.addEventListener("dom-ready", onReady);
    // In-page pushState (`?path=…`) is how Storybook records the selected story.
    wv.addEventListener("did-navigate-in-page", relaySelection);
    // A hard navigation (initial load lands on the auto-selected first story).
    wv.addEventListener("did-navigate", relaySelection);

    // Re-widen the sidebar when the dock is resized (best-effort; inert until dom-ready).
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        applyFill();
      });
    });
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      wv.removeEventListener("dom-ready", onReady);
      wv.removeEventListener("did-navigate-in-page", relaySelection);
      wv.removeEventListener("did-navigate", relaySelection);
      ro.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-vs-bg-surface">
      {createElement("webview", {
        ref,
        src,
        // Match the main window so the manager loads normally; no guest preload here —
        // we only observe the URL, we don't instrument the page.
        webpreferences: "sandbox=no,contextIsolation=yes,nodeIntegration=no",
        // Wide + absolutely positioned: desktop layout renders, the wrapper clips it to the
        // dock width and the sidebar column is widened (FILL_SIDEBAR_JS) to fill it.
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
