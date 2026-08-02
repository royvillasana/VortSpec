import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  effectiveWidths,
  layoutReducer,
  MIN,
  type LayoutState,
} from "./layout";

const base = DEFAULT_LAYOUT;

describe("layoutReducer", () => {
  it("selecting Explorer (the sidebar view) shows the primary sidebar", () => {
    const s = layoutReducer(
      { ...base, activity: "tokens", primaryOpen: false },
      { type: "setActivity", activity: "explorer" },
    );
    expect(s.activity).toBe("explorer");
    expect(s.primaryOpen).toBe(true);
  });

  it("re-selecting the active sidebar view toggles the primary sidebar", () => {
    const open = { ...base, activity: "explorer" as const, primaryOpen: true };
    const collapsed = layoutReducer(open, { type: "setActivity", activity: "explorer" });
    expect(collapsed.primaryOpen).toBe(false);
    const reopened = layoutReducer(collapsed, { type: "setActivity", activity: "explorer" });
    expect(reopened.primaryOpen).toBe(true);
  });

  it("a work-panel activity is selected without touching the primary sidebar flag", () => {
    const s = layoutReducer({ ...base, activity: "explorer" }, { type: "setActivity", activity: "tokens" });
    expect(s.activity).toBe("tokens");
  });

  it("re-selecting the active WORK PANEL toggles the dock too, so it is never unrecoverable", () => {
    // The bug this pins: the toggle used to apply only to sidebar views. Collapse the dock while in the
    // Playground and the only control that could reopen it — the activity you are already on — did
    // nothing, so the user had to guess that Explorer was the way back.
    const open = { ...base, activity: "run" as const, primaryOpen: true };
    const collapsed = layoutReducer(open, { type: "setActivity", activity: "run" });
    expect(collapsed.primaryOpen).toBe(false);
    expect(collapsed.activity).toBe("run");

    const reopened = layoutReducer(collapsed, { type: "setActivity", activity: "run" });
    expect(reopened.primaryOpen).toBe(true);
  });

  it("holds for every activity, not just the one that was reported", () => {
    for (const activity of ["run", "tokens", "play", "flow", "manifest", "source", "tasks"] as const) {
      const collapsed = layoutReducer({ ...base, activity, primaryOpen: true }, { type: "setActivity", activity });
      expect(collapsed.primaryOpen, `${activity} should collapse`).toBe(false);
      const reopened = layoutReducer(collapsed, { type: "setActivity", activity });
      expect(reopened.primaryOpen, `${activity} should reopen`).toBe(true);
    }
  });

  it("switching between work panels does not force the dock back open", () => {
    // A user who deliberately collapsed the dock should not have it reappear on every navigation.
    const s = layoutReducer({ ...base, activity: "run", primaryOpen: false }, { type: "setActivity", activity: "tokens" });
    expect(s.activity).toBe("tokens");
    expect(s.primaryOpen).toBe(false);
  });

  it("opens the terminal tab when the panel is first toggled on", () => {
    const s = layoutReducer({ ...base, panelOpen: false, panelTabs: [], panelSelected: null }, { type: "togglePanel" });
    expect(s.panelOpen).toBe(true);
    expect(s.panelTabs).toEqual(["terminal"]);
    expect(s.panelSelected).toBe("terminal");
  });

  it("closing the last panel tab closes the panel; reopening starts fresh", () => {
    const withTab: LayoutState = { ...base, panelOpen: true, panelTabs: ["terminal"], panelSelected: "terminal" };
    const closed = layoutReducer(withTab, { type: "closePanelTab", tab: "terminal" });
    expect(closed.panelOpen).toBe(false);
    expect(closed.panelTabs).toEqual([]);
    const reopened = layoutReducer(closed, { type: "openPanelTab", tab: "terminal" });
    expect(reopened.panelOpen).toBe(true);
    expect(reopened.panelSelected).toBe("terminal");
  });

  it("moves the panel between bottom and side, preserving tabs", () => {
    const withTab: LayoutState = { ...base, panelOpen: true, panelTabs: ["terminal"], panelSelected: "terminal" };
    const side = layoutReducer(withTab, { type: "setPanelDock", dock: "right" });
    expect(side.panelDock).toBe("right");
    expect(side.panelTabs).toEqual(["terminal"]);
    expect(side.panelSelected).toBe("terminal");
  });

  it("toggles the editor and the secondary sidebar independently", () => {
    const noEditor = layoutReducer(base, { type: "toggleEditor" });
    expect(noEditor.editorOpen).toBe(false);
    // The right assistant sidebar defaults OFF now (chat moved into the unified left
    // dock), so toggling it from the default opens it.
    const chatOn = layoutReducer(base, { type: "toggleSecondary" });
    expect(chatOn.secondaryOpen).toBe(true);
  });

  it("clamps oversized persisted widths to the viewport", () => {
    const huge: LayoutState = { ...base, primaryWidth: 5000, secondaryWidth: 5000, panelSize: 9000 };
    const s = layoutReducer(huge, { type: "clamp", winW: 1200 });
    expect(s.primaryWidth).toBeLessThanOrEqual(1200 - MIN.activityBar - MIN.editor);
    expect(s.secondaryWidth).toBeLessThanOrEqual(1200 - MIN.activityBar - MIN.editor);
    expect(s.panelSize).toBeLessThanOrEqual(1200);
  });
});

describe("effectiveWidths", () => {
  it("keeps the editor at least MIN.editor by shrinking side regions", () => {
    const s: LayoutState = {
      ...base,
      activity: "explorer",
      primaryOpen: true,
      primaryWidth: 640,
      secondaryOpen: true,
      secondaryWidth: 720,
    };
    const w = effectiveWidths(s, 1000);
    const editor = 1000 - MIN.activityBar - w.primary - w.secondary - w.panelSide;
    expect(editor).toBeGreaterThanOrEqual(MIN.editor - 0.5);
  });

  it("shows the primary width for any activity — the unified left dock is always present", () => {
    // The primary region is now the always-present left dock (Section + Chat), shown in
    // every activity, so its width no longer gates on the activity being a sidebar view.
    const s: LayoutState = { ...base, activity: "tokens", primaryOpen: true, primaryWidth: 300 };
    expect(effectiveWidths(s, 1600).primary).toBe(300);
    // Collapsing the dock still hides it, regardless of activity.
    expect(effectiveWidths({ ...s, primaryOpen: false }, 1600).primary).toBe(0);
  });

  it("counts the panel width only when docked to the side and open", () => {
    const bottom: LayoutState = { ...base, panelOpen: true, panelDock: "bottom", panelSize: 300 };
    expect(effectiveWidths(bottom, 1600).panelSide).toBe(0);
    const side: LayoutState = { ...base, panelOpen: true, panelDock: "right", panelSize: 300 };
    expect(effectiveWidths(side, 1600).panelSide).toBeGreaterThan(0);
  });
});
