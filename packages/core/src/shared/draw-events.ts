/**
 * Draw window → compose dialog handoff (docs/draw-to-component-graph.md). The Draw surface is a
 * separate, movable OS window; when the user finishes drawing there, the window hands the exported
 * sketch back to the WAITING compose dialog in the main window, which composes it INTO the selected
 * slot on the current screen. This is the main→renderer event the main process broadcasts (to every
 * window) after it writes the sketch PNG.
 */
export const DRAW_SKETCH_READY_CHANNEL = "draw:sketchReady";

export interface DrawSketchReady {
  projectPath: string;
  /** Absolute path to the exported sketch PNG the compose dialog attaches. */
  pngPath: string;
}
