import { useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import { DEFAULT_LAYOUT, layoutReducer, type LayoutAction, type LayoutState } from "./layout";

const KEY = "vs.ide.layout";

function load(): LayoutState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    // Merge over defaults so an older/partial persisted shape still boots.
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
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
