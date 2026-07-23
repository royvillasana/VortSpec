/**
 * The IDE workbench layout model — a pure reducer over the region state the
 * activity bar and drag-resizers manipulate. Held above the shell so every
 * region (primary sidebar, editor group, panel group, secondary sidebar) reads
 * from one source and persists together. Effective (window-clamped) sizes are
 * computed at render time from this desired state; see `effectiveWidths`.
 */

export type SidebarView = "explorer";
export type WorkPanel =
  | "source"
  | "settings"
  | "flow"
  | "run"
  | "play"
  | "tokens"
  | "tasks"
  | "manifest"
  | "history";
export type Activity = SidebarView | WorkPanel;
export type PanelTab = "terminal";
export type PanelDock = "bottom" | "right";

// Only Explorer renders inside the narrow primary sidebar; every other activity
// (Source Control, Settings, and the rich SDD-DE panels) opens as a full-center
// panel and hides the sidebar — the reused panels are full-width, not sidebar
// views, so this is both pragmatic and VS Code-accurate for editor-area panels.
export const SIDEBAR_VIEWS: readonly SidebarView[] = ["explorer"];
export function isSidebarView(a: Activity): a is SidebarView {
  return (SIDEBAR_VIEWS as readonly string[]).includes(a);
}

export interface LayoutState {
  /** the selected activity — a sidebar view (Explorer/Source/Settings) or a full work panel. */
  activity: Activity;
  /** primary sidebar (only meaningful when the activity is a sidebar view). */
  primaryOpen: boolean;
  primaryWidth: number;
  /** secondary sidebar (the assistant). */
  secondaryOpen: boolean;
  secondaryWidth: number;
  /** the editor group can be closed to leave only the panel group. */
  editorOpen: boolean;
  /** the panel group (Terminal, extensible). */
  panelOpen: boolean;
  panelDock: PanelDock;
  panelSize: number;
  panelTabs: PanelTab[];
  panelSelected: PanelTab | null;
}

export const MIN = {
  primary: 180,
  secondary: 300,
  panel: 120,
  editor: 360,
  activityBar: 48,
} as const;

export const DEFAULT_LAYOUT: LayoutState = {
  activity: "explorer",
  primaryOpen: true,
  primaryWidth: 248,
  secondaryOpen: true,
  secondaryWidth: 380,
  editorOpen: true,
  panelOpen: false,
  panelDock: "bottom",
  panelSize: 240,
  panelTabs: [],
  panelSelected: null,
};

export type LayoutAction =
  | { type: "setActivity"; activity: Activity }
  | { type: "togglePrimary" }
  | { type: "setPrimaryWidth"; width: number }
  | { type: "nudgePrimary"; delta: number }
  | { type: "nudgeSecondary"; delta: number }
  | { type: "nudgePanel"; delta: number }
  | { type: "toggleSecondary" }
  | { type: "setSecondaryWidth"; width: number }
  | { type: "toggleEditor" }
  | { type: "setEditorOpen"; open: boolean }
  | { type: "togglePanel" }
  | { type: "openPanelTab"; tab: PanelTab }
  | { type: "closePanelTab"; tab: PanelTab }
  | { type: "selectPanelTab"; tab: PanelTab }
  | { type: "setPanelDock"; dock: PanelDock }
  | { type: "setPanelSize"; size: number }
  | { type: "clamp"; winW: number };

function clampN(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case "setActivity": {
      if (isSidebarView(action.activity)) {
        // Re-clicking the active sidebar view toggles the primary sidebar.
        if (state.activity === action.activity) return { ...state, primaryOpen: !state.primaryOpen };
        return { ...state, activity: action.activity, primaryOpen: true };
      }
      // A work panel takes the center; the primary sidebar is hidden by render.
      return { ...state, activity: action.activity };
    }
    case "togglePrimary":
      return { ...state, primaryOpen: !state.primaryOpen };
    case "setPrimaryWidth":
      return { ...state, primaryWidth: Math.max(MIN.primary, action.width) };
    case "nudgePrimary":
      return { ...state, primaryWidth: Math.max(MIN.primary, state.primaryWidth + action.delta) };
    case "nudgeSecondary":
      return { ...state, secondaryWidth: Math.max(MIN.secondary, state.secondaryWidth + action.delta) };
    case "nudgePanel":
      return { ...state, panelSize: Math.max(MIN.panel, state.panelSize + action.delta) };
    case "toggleSecondary":
      return { ...state, secondaryOpen: !state.secondaryOpen };
    case "setSecondaryWidth":
      return { ...state, secondaryWidth: Math.max(MIN.secondary, action.width) };
    case "toggleEditor":
      return { ...state, editorOpen: !state.editorOpen };
    case "setEditorOpen":
      return { ...state, editorOpen: action.open };
    case "togglePanel": {
      const opening = !state.panelOpen;
      if (opening && state.panelTabs.length === 0) {
        return { ...state, panelOpen: true, panelTabs: ["terminal"], panelSelected: "terminal" };
      }
      return { ...state, panelOpen: opening };
    }
    case "openPanelTab": {
      const tabs = state.panelTabs.includes(action.tab)
        ? state.panelTabs
        : [...state.panelTabs, action.tab];
      return { ...state, panelOpen: true, panelTabs: tabs, panelSelected: action.tab };
    }
    case "closePanelTab": {
      const tabs = state.panelTabs.filter((t) => t !== action.tab);
      const selected =
        state.panelSelected === action.tab ? (tabs[tabs.length - 1] ?? null) : state.panelSelected;
      return { ...state, panelTabs: tabs, panelSelected: selected, panelOpen: tabs.length > 0 };
    }
    case "selectPanelTab":
      return state.panelTabs.includes(action.tab) ? { ...state, panelSelected: action.tab } : state;
    case "setPanelDock":
      return { ...state, panelDock: action.dock };
    case "setPanelSize":
      return { ...state, panelSize: Math.max(MIN.panel, action.size) };
    case "clamp": {
      // Bound desired sizes to sane ranges so a garbage/oversized persisted
      // value can't wedge the layout. The hard editor-min guarantee is applied
      // at render via effectiveWidths().
      const wide = Math.max(600, action.winW);
      return {
        ...state,
        primaryWidth: clampN(state.primaryWidth, MIN.primary, wide - MIN.activityBar - MIN.editor),
        secondaryWidth: clampN(state.secondaryWidth, MIN.secondary, wide - MIN.activityBar - MIN.editor),
        panelSize: clampN(state.panelSize, MIN.panel, wide),
      };
    }
    default:
      return state;
  }
}

/**
 * Render-time effective widths: honor the desired sizes but shrink the side
 * regions so the editor keeps at least MIN.editor px and nothing overflows the
 * window. Mirrors the reducer's clamp but computed live against the viewport.
 */
export function effectiveWidths(
  state: LayoutState,
  winW: number,
): { primary: number; secondary: number; panelSide: number } {
  // The primary region is now the ALWAYS-present unified left dock (Section + Chat), shown
  // in every activity — not just Explorer — so its width no longer gates on isSidebarView.
  const primaryShown = state.primaryOpen;
  const secondaryShown = state.secondaryOpen;
  const panelShown = state.panelOpen && state.panelDock === "right";

  const priMin = primaryShown ? MIN.primary : 0;
  const secMin = secondaryShown ? MIN.secondary : 0;
  const panMin = panelShown ? MIN.panel : 0;

  // Budget for all side regions that still leaves the editor its minimum. Assign
  // in priority order (secondary → side-panel → primary); each region is capped
  // so the not-yet-assigned regions keep at least their minimum.
  let budget = winW - MIN.activityBar - MIN.editor;

  let secondary = 0;
  if (secondaryShown) {
    secondary = clampN(state.secondaryWidth, MIN.secondary, Math.max(MIN.secondary, budget - panMin - priMin));
    budget -= secondary;
  }
  let panelSide = 0;
  if (panelShown) {
    panelSide = clampN(state.panelSize, MIN.panel, Math.max(MIN.panel, budget - priMin));
    budget -= panelSide;
  }
  let primary = 0;
  if (primaryShown) {
    primary = clampN(state.primaryWidth, MIN.primary, Math.max(MIN.primary, budget));
  }

  return { primary, secondary, panelSide };
}
