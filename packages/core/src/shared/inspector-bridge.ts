import { z } from "zod";
import { propControlSchema } from "./inspector";

/**
 * Inspector-bridge contracts (change: run-canvas-visual-editor).
 *
 * The Run Canvas embeds the project's dev server in an Electron <webview> whose
 * guest preload injects an "inspector bridge" into the rendered page. This module
 * is the single, isolated protocol between that guest and the host renderer
 * (design D4), plus the host-facing `Selection` view-model that drives the
 * Figma-style Design panel (design D8). Keeping wire shapes here contains the
 * Electron-specific surface so a future transport swap stays a contained change.
 *
 * Zod validation lives only at this boundary — bridge messages are untrusted
 * (they cross into the guest page) and are parsed on receipt.
 */

// ── Node tree (guest → host) ─────────────────────────────────────────

/** One rendered element in the page's component/DOM tree. */
export const bridgeNodeSchema = z.object({
  /** Stable per-render handle — a DOM path the guest can resolve back to the element. */
  id: z.string(),
  /** Lowercased tag name (e.g. `button`, `div`). */
  tag: z.string(),
  /** The element's `id` attribute, when present. */
  idAttr: z.string().optional(),
  /** Key class names (best-effort; framework hashes may be filtered by the guest). */
  classes: z.array(z.string()).default([]),
  /** ARIA `role`, when present. */
  role: z.string().optional(),
  /** `data-component` value — the strongest element→component hint, when present. */
  component: z.string().optional(),
  /** Number of element children (so the tree can show an expand affordance). */
  childCount: z.number().int().nonnegative().default(0),
});
export type BridgeNode = z.infer<typeof bridgeNodeSchema>;

/**
 * The node tree, delivered flat — `nodes` maps id→node and `children` maps
 * id→child-ids — mirroring the Explorer's flat-map pattern so the same lazy
 * expand/collapse rendering can be reused (design D6).
 */
export const bridgeTreeSchema = z.object({
  roots: z.array(z.string()).default([]),
  nodes: z.record(z.string(), bridgeNodeSchema).default({}),
  children: z.record(z.string(), z.array(z.string())).default({}),
});
export type BridgeTree = z.infer<typeof bridgeTreeSchema>;

// ── Raw element readout (guest → host) ───────────────────────────────

/** A bounding rectangle in guest-viewport coordinates. */
export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Rect = z.infer<typeof rectSchema>;

/**
 * The guest's raw readout for a node: its rectangle, a subset of computed style,
 * and the CSS custom properties in scope. The host turns this into a `Selection`
 * (token resolution + Figma-section grouping happen host-side — design D5).
 */
export const nodeReadoutSchema = z.object({
  nodeId: z.string(),
  rect: rectSchema,
  /** Computed style subset (padding, margin, border-radius, color, font, …). */
  computed: z.record(z.string(), z.string()).default({}),
  /** `--custom-property` → value, resolved in the element's scope. */
  customProps: z.record(z.string(), z.string()).default({}),
  /** `data-component` value, when present. */
  dataComponent: z.string().nullable().default(null),
  /** The element's full className string, for component/token heuristics. */
  className: z.string().default(""),
  /** Direct element children's border-boxes (guest coords) — used to place gap bands. */
  children: z.array(rectSchema).default([]),
  /** The element's editable text when it is a text leaf (no element children), else undefined. */
  text: z.string().optional(),
});
export type NodeReadout = z.infer<typeof nodeReadoutSchema>;

// ── Selection view-model (host → Design panel) ───────────────────────

/** How a field's value is edited in the Design panel. */
export const fieldKindSchema = z.enum([
  "length", // px/rem numeric with unit (padding, radius, gap, size)
  "color", // a color swatch + value
  "number", // unitless number (opacity, rotation)
  "select", // an enumerated dropdown (variant options, blend mode)
  "segment", // an inline segmented button group (flow: block/row/column)
  "text", // free text
  "toggle", // boolean
  "align", // a Figma-style 3×3 auto-layout alignment grid (value `"<x>|<y>"`)
]);
export type FieldKind = z.infer<typeof fieldKindSchema>;

/**
 * One editable value in a Design-panel section. When `token` is set the value is
 * backed by that design token (traced through `var()` chains); otherwise it is a
 * literal style. The panel renders a token-vs-literal indicator from this.
 */
export const sectionFieldSchema = z.object({
  /** Stable key within the selection (e.g. `padding-left`, `variant:size`). */
  key: z.string(),
  /** Human label (e.g. `Padding`, `Size`). */
  label: z.string(),
  kind: fieldKindSchema,
  /** Current resolved value (e.g. `12px`, `#2563EB`, `secondary`). */
  value: z.string(),
  /** Owning design-token name when token-backed, else null. */
  token: z.string().nullable().default(null),
  /** Token category this field binds to (`spacing`/`radius`/`typography`), so the
   *  panel can offer the right variables and re-recognize a token when the value
   *  changes. Absent for fields that never bind a token (margins, opacity, …). */
  tokenType: z.string().optional(),
  /** Options for a `select` field (variant options, blend modes, …). */
  options: z.array(z.string()).default([]),
  /** Unit hint for a `length` field (`px`, `rem`, …). */
  unit: z.string().optional(),
});
export type SectionField = z.infer<typeof sectionFieldSchema>;

/** The Figma-style sections, in the order the Design panel renders them (design D8). */
export const designSectionIdSchema = z.enum([
  "variant", // Current variant (component variant switchers)
  "content", // Editable text content (text leaf elements)
  "position", // Position: alignment, X/Y, constraints, rotation
  "size", // Width / Height
  "layout", // Auto/outer layout: flow, resizing, alignment, gap, padding
  "appearance", // Opacity, corner radius, blend mode, visibility
  "typography", // Font family / size / weight / line-height
  "stroke", // Border width/color/style
  "fill", // Background
  "effects", // Box-shadow / filters
  "colors", // All color tokens in effect (text / background / border)
  "layoutGuide", // Layout grid / guides
]);
export type DesignSectionId = z.infer<typeof designSectionIdSchema>;

export const designSectionSchema = z.object({
  id: designSectionIdSchema,
  title: z.string(),
  fields: z.array(sectionFieldSchema).default([]),
});
export type DesignSection = z.infer<typeof designSectionSchema>;

/** A variant control for the Current-variant section (a `PropControl` + its current value). */
export const variantControlSchema = propControlSchema.extend({
  /** The variant value on the selected instance, when derivable. */
  current: z.string().optional(),
});
export type VariantControl = z.infer<typeof variantControlSchema>;

/**
 * The resolved selection that drives the Design panel: identity, geometry, the
 * component/variant binding, and the ordered Figma sections. Built host-side from
 * a `NodeReadout` + the project's parsed tokens & component roster.
 */
export const selectionSchema = z.object({
  nodeId: z.string(),
  /** Display label — the component name when known, else the tag. */
  label: z.string(),
  /** Owning project component name, when the element maps to one. */
  component: z.string().nullable().default(null),
  /** Project-relative source file of that component, when known. */
  file: z.string().nullable().default(null),
  /** A component this element *resembles* by class signature but isn't using (suggest reuse). */
  resembles: z.object({ name: z.string(), file: z.string().nullable() }).nullable().default(null),
  rect: rectSchema,
  /** Variant controls for the Current-variant section (empty for non-components). */
  variants: z.array(variantControlSchema).default([]),
  /** The Figma-style property sections, already ordered and populated. */
  sections: z.array(designSectionSchema).default([]),
});
export type Selection = z.infer<typeof selectionSchema>;

// ── Wire protocol (discriminated unions) ─────────────────────────────

/** Messages the host renderer sends into the guest bridge. */
export const bridgeCommandSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("requestTree") }),
  z.object({ t: z.literal("selectNode"), nodeId: z.string() }),
  z.object({ t: z.literal("hoverNode"), nodeId: z.string().nullable() }),
  /**
   * Toggle guest input handling: `inspect` intercepts hover/click to drive
   * selection from the canvas; `interact` lets clicks reach the app normally.
   */
  z.object({ t: z.literal("setMode"), mode: z.enum(["inspect", "interact"]) }),
  /** Apply an ephemeral CSS override to a node (instant preview; nothing written). */
  z.object({
    t: z.literal("applyOverride"),
    nodeId: z.string(),
    css: z.record(z.string(), z.string()),
  }),
  /** Clear overrides for one node, or all when `nodeId` is omitted. */
  z.object({ t: z.literal("clearOverride"), nodeId: z.string().optional() }),
  /** Set the visible text of a node (live text-content edit). */
  z.object({ t: z.literal("setText"), nodeId: z.string(), text: z.string() }),
  /** Swap classes on a node for a live variant preview (remove old, add new). */
  z.object({
    t: z.literal("setClass"),
    nodeId: z.string(),
    remove: z.array(z.string()).default([]),
    add: z.array(z.string()).default([]),
  }),
]);
export type BridgeCommand = z.infer<typeof bridgeCommandSchema>;

/** Messages the guest bridge emits back to the host renderer. */
export const bridgeEventSchema = z.discriminatedUnion("t", [
  /** The bridge attached (or failed to) — the host toggles editing affordances. */
  z.object({ t: z.literal("ready"), ok: z.boolean(), message: z.string().optional() }),
  z.object({ t: z.literal("tree"), tree: bridgeTreeSchema }),
  z.object({ t: z.literal("readout"), readout: nodeReadoutSchema }),
  /** Geometry-only update (scroll/resize/layout) so overlays stay aligned. */
  z.object({ t: z.literal("geometry"), nodeId: z.string(), rect: rectSchema }),
  /** The element under the pointer in inspect mode (null when the pointer leaves). */
  z.object({ t: z.literal("hovered"), nodeId: z.string().nullable(), rect: rectSchema.optional() }),
  /** An uncaught error / unhandled rejection in the previewed app (for the Run Doctor). */
  z.object({
    t: z.literal("runtimeError"),
    message: z.string(),
    source: z.string().optional(),
    line: z.number().optional(),
    stack: z.string().optional(),
  }),
  /** The user edited an element's text inline on the canvas (double-click). */
  z.object({ t: z.literal("textEdited"), nodeId: z.string(), text: z.string() }),
  /** Right-click on an element — the host shows a context menu at (x,y) guest coords. */
  z.object({ t: z.literal("contextMenu"), nodeId: z.string(), x: z.number(), y: z.number() }),
  /** The selected node could not be re-acquired after a re-render (its element is gone). */
  z.object({ t: z.literal("selectionLost"), nodeId: z.string() }),
]);
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;

// The stable node-identity fingerprint (Phase 1) — re-exported so the guest, which
// imports this module, gets the resolver from one place.
export { fingerprint, classSignature, segToken, type FpSeg } from "./dom-fingerprint";

/** The channel name used for host⇄guest `webview` IPC messages. */
export const INSPECTOR_BRIDGE_CHANNEL = "vortspec:inspector-bridge";
