import { useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import { DEFAULT_LAYOUT, layoutReducer, type LayoutAction, type LayoutState } from "./layout";

// Bumped when the default sidebar width changed to a viewport fraction, so an
// older persisted width doesn't mask the new default (v2 = 1/3, v3 = 1/4).
const KEY = "vs.ide.layout.v3";

/** Default sidebar width: one quarter of the viewport (then clamped by effectiveWidths). */
function defaultPrimaryWidth(): number {
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  return Math.round(w / 4);
}

function load(): LayoutState {
  const fresh = { ...DEFAULT_LAYOUT, primaryWidth: defaultPrimaryWidth() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    // Merge over defaults so an older/partial persisted shape still boots; a
    // user's own resized width (persisted) still wins over the 1/3 default.
    return { ...fresh, ...parsed };
  } catch {
    return fresh;
  }
}

/**
 * The workbench layout state, persisted to localStorage and clamped to the
 * current viewport on load and on window resize.
 */
export function useLayout(): [LayoutState, Dispatch<LayoutAction>] {
  const [state, dispatch] = useReducer(layoutReducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  useEffect(() => {
    const onResize = (): void => dispatch({ type: "clamp", winW: window.innerWidth });
    onResize(); // clamp once on load
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return [state, dispatch];
}
