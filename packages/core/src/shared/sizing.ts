/**
 * Figma-style resizing behavior for a layer's width/height (change: component-resize).
 *
 * A dimension can be **Fixed** (an explicit px value), **Hug** (size to its content),
 * or **Fill** (grow to fill the parent's available space). Fill/Hug are axis-aware:
 * along the parent's MAIN flex axis, Fill = `flex-grow` and Hug = content-basis; on the
 * CROSS axis, Fill = `align-self: stretch`; with a non-flex (block) parent, Fill = 100%.
 *
 * Pure: `detectSizeMode` reads the current mode from computed style + the parent's flow,
 * `sizeModeCss` produces the ephemeral override that applies a chosen mode. The host
 * applies the override live and commits it through the gated edit flow.
 */

export type SizeMode = "fixed" | "hug" | "fill";
export type SizeDim = "width" | "height";
/** The parent's layout flow — determines which axis a dimension is on. */
export type ParentFlow = "row" | "column" | "block";

export const SIZE_MODES: SizeMode[] = ["fixed", "hug", "fill"];
export const SIZE_MODE_LABEL: Record<SizeMode, string> = { fixed: "Fixed", hug: "Hug", fill: "Fill" };

/** Whether `dim` is the MAIN axis of the parent's flow (width in a row, height in a column). */
export function isMainAxis(dim: SizeDim, parentFlow: ParentFlow): boolean {
  return (parentFlow === "row" && dim === "width") || (parentFlow === "column" && dim === "height");
}

const CONTENT_SIZED = new Set(["", "auto", "fit-content", "max-content", "min-content"]);

/** Detect the current sizing mode from the element's computed style + its parent's flow. */
export function detectSizeMode(dim: SizeDim, computed: Record<string, string>, parentFlow: ParentFlow): SizeMode {
  const val = (computed[dim] ?? "").trim();
  const grow = parseFloat(computed["flex-grow"] ?? "0") || 0;
  const alignSelf = (computed["align-self"] ?? "auto").trim();

  // Fill first — it can coexist with an `auto` width, which would otherwise read as Hug.
  if (parentFlow === "block") {
    if (val === "100%") return "fill";
  } else if (isMainAxis(dim, parentFlow)) {
    if (grow > 0) return "fill";
  } else if (alignSelf === "stretch") {
    return "fill";
  }

  if (CONTENT_SIZED.has(val)) return "hug";
  return "fixed";
}

/**
 * The CSS override that APPLIES `mode` to `dim`, given the parent's flow. For Fixed,
 * pass the px value to keep (defaults to `auto` if absent). Only touches the properties
 * that define the behavior, so it composes with other edits.
 */
export function sizeModeCss(
  dim: SizeDim,
  mode: SizeMode,
  parentFlow: ParentFlow,
  fixedValue?: string,
): Record<string, string> {
  const main = isMainAxis(dim, parentFlow);
  const cross = parentFlow !== "block" && !main;

  if (mode === "fixed") {
    const css: Record<string, string> = { [dim]: fixedValue && fixedValue.trim() ? fixedValue.trim() : "auto" };
    if (main) {
      css["flex-grow"] = "0";
      css["flex-shrink"] = "0";
    }
    if (cross) css["align-self"] = "auto";
    return css;
  }

  if (mode === "hug") {
    const css: Record<string, string> = { [dim]: "fit-content" };
    if (main) {
      css["flex-grow"] = "0";
      css["flex-shrink"] = "0";
      css["flex-basis"] = "auto";
    }
    if (cross) css["align-self"] = "auto";
    return css;
  }

  // fill
  if (parentFlow === "block") return { [dim]: "100%" };
  if (main) return { [dim]: "auto", "flex-grow": "1", "flex-basis": "0%" };
  return { "align-self": "stretch", [dim]: "auto" };
}
