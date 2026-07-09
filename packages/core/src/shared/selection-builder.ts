import type { NodeReadout, Selection, SectionField, DesignSection, VariantControl } from "./inspector-bridge";
import type { InspectorToken, TokenType } from "./inspector";

/**
 * Selection builder (change: run-canvas-visual-editor, design D5/D8).
 *
 * Turns a guest `NodeReadout` (raw rect + computed style + in-scope custom
 * properties) plus the project's parsed tokens and the resolved component into
 * the `Selection` view-model that drives the Figma-style Design panel: values
 * grouped into Figma's sections, each bound to its owning design token when the
 * computed value traces back to one. Pure (no fs / DOM) so it is unit-testable
 * and can run in the renderer.
 */

export interface ComponentBinding {
  name: string;
  file: string | null;
  variants: VariantControl[];
}

export function buildSelection(
  readout: NodeReadout,
  opts: { tokens?: InspectorToken[]; component?: ComponentBinding | null; tag?: string } = {},
): Selection {
  const bind = makeTokenBinder(readout, opts.tokens ?? []);
  const c = readout.computed;
  const label = opts.component?.name ?? opts.tag ?? "element";

  const sections: DesignSection[] = [
    section("position", "Position", [
      literal("x", "X", "number", String(Math.round(readout.rect.x))),
      literal("y", "Y", "number", String(Math.round(readout.rect.y))),
      literal("rotation", "Rotation", "number", `${rotationDeg(c["transform"])}`),
    ]),
    // Size — always present so every element can be resized from the panel.
    section("size", "Size", [
      literal("width", "Width", "length", sizeVal(c["width"], readout.rect.width)),
      literal("height", "Height", "length", sizeVal(c["height"], readout.rect.height)),
    ]),
    section("layout", "Auto layout", [
      literal("flow", "Flow", "select", flow(c), ["block", "row", "column"]),
      // Figma-style auto-layout alignment (only meaningful for flex containers).
      ...(isFlex(c) ? [alignField(c)] : []),
      bind("gap", "Gap", "length", c["gap"], "spacing"),
      bind("padding-left", "Padding X", "length", c["padding-left"], "spacing"),
      bind("padding-top", "Padding Y", "length", c["padding-top"], "spacing"),
    ]),
    section("appearance", "Appearance", [
      literal("opacity", "Opacity", "number", c["opacity"] ?? "1"),
      bind("radius", "Radius", "length", c["border-top-left-radius"], "radius"),
      ...(isMeaningful(c["mix-blend-mode"], "normal")
        ? [literal("blend", "Blend", "select", c["mix-blend-mode"]!, blendModes)]
        : []),
    ]),
    // Typography — font tokens for the selection's text.
    section("typography", "Typography", [
      literal("font-family", "Font", "text", fontName(c["font-family"])),
      bind("font-size", "Size", "length", c["font-size"], "typography"),
      literal("font-weight", "Weight", "select", c["font-weight"], ["300", "400", "500", "600", "700", "800"]),
      bind("line-height", "Line height", "length", c["line-height"], "typography"),
    ]),
    section(
      "stroke",
      "Stroke",
      isMeaningful(c["border-top-width"], "0px")
        ? [
            bind("stroke-width", "Width", "length", c["border-top-width"]),
            bind("stroke-color", "Color", "color", c["border-top-color"], "color"),
            literal("stroke-style", "Style", "select", c["border-top-style"] ?? "solid", [
              "solid",
              "dashed",
              "dotted",
            ]),
          ]
        : [],
    ),
    section(
      "fill",
      "Fill",
      isColor(c["background-color"]) ? [bind("fill", "Background", "color", c["background-color"], "color")] : [],
    ),
    section("effects", "Effects", [
      ...(isMeaningful(c["box-shadow"], "none") ? [literal("shadow", "Shadow", "text", c["box-shadow"]!)] : []),
      ...(isMeaningful(c["filter"], "none") ? [literal("filter", "Filter", "text", c["filter"]!)] : []),
    ]),
    // Colors — every color token in effect for the selection (Figma "Selection colors").
    section("colors", "Colors", [
      isColor(c["color"]) ? bind("text-color", "Text", "color", c["color"], "color") : null,
      isColor(c["background-color"]) ? bind("bg-color", "Background", "color", c["background-color"], "color") : null,
      isMeaningful(c["border-top-width"], "0px") && isColor(c["border-top-color"])
        ? bind("border-color", "Border", "color", c["border-top-color"], "color")
        : null,
    ]),
    // Layout guide — no CSS grid guides surfaced in v1; left empty (panel hides it).
    section("layoutGuide", "Layout guide", []),
  ];

  return {
    nodeId: readout.nodeId,
    label,
    component: opts.component?.name ?? null,
    file: opts.component?.file ?? null,
    rect: readout.rect,
    variants: opts.component?.variants ?? [],
    sections: sections.filter((s) => s.fields.length > 0),
  };
}

/**
 * Map an alignment field value (`"<x>|<y>"`) + the container's flex direction to
 * the `justify-content` / `align-items` declarations. Exported so the host can
 * apply the live override and describe the commit.
 */
export function alignToCss(value: string, direction: string): Record<string, string> {
  const [x = "start", y = "start"] = value.split("|");
  const css = (a: string): string =>
    a === "center" ? "center" : a === "end" ? "flex-end" : a === "stretch" ? "stretch" : "flex-start";
  const column = direction === "column";
  return {
    "justify-content": css(column ? y : x),
    "align-items": css(column ? x : y),
  };
}

// ── helpers ──────────────────────────────────────────────────────────

function section(id: DesignSection["id"], title: string, fields: (SectionField | null)[]): DesignSection {
  return { id, title, fields: fields.filter((f): f is SectionField => f !== null) };
}

function literal(
  key: string,
  label: string,
  kind: SectionField["kind"],
  value: string | undefined,
  options: string[] = [],
): SectionField | null {
  if (value === undefined || value === "") return null;
  return { key, label, kind, value, token: null, options };
}

/**
 * A token binder: maps a computed value back to the design token whose value it
 * resolves from. Prefers the classified project tokens; falls back to a matching
 * in-scope `--custom-property` name.
 */
function makeTokenBinder(readout: NodeReadout, tokens: InspectorToken[]) {
  const byValue = new Map<string, string>();
  // value → (token type → name), so a field can prefer a type-appropriate token
  // when several tokens share the same value (e.g. an 8px spacing and 8px radius).
  const byValueType = new Map<string, Map<TokenType, string>>();
  // Custom props in scope: value → var name (without the leading `--`). No type.
  for (const [name, value] of Object.entries(readout.customProps)) {
    const norm = normalize(value);
    if (norm && !byValue.has(norm)) byValue.set(norm, name.replace(/^--/, ""));
  }
  // Project tokens carry the canonical, classified name (and win the value map).
  for (const t of tokens) {
    const norm = normalize(t.resolvedValue);
    if (!norm) continue;
    byValue.set(norm, t.name);
    const typed = byValueType.get(norm) ?? new Map<TokenType, string>();
    if (!typed.has(t.type)) typed.set(t.type, t.name);
    byValueType.set(norm, typed);
  }
  return (
    key: string,
    label: string,
    kind: SectionField["kind"],
    value: string | undefined,
    preferType?: TokenType,
  ): SectionField | null => {
    if (value === undefined || value === "") return null;
    const norm = normalize(value);
    const token = (preferType && byValueType.get(norm)?.get(preferType)) ?? byValue.get(norm) ?? null;
    return { key, label, kind, value, token, options: [] };
  };
}

/** Normalize a value for token matching (lowercase, collapse whitespace, rgb→hex-ish). */
function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMeaningful(v: string | undefined, ...noise: string[]): v is string {
  return v !== undefined && v !== "" && !noise.includes(v.trim());
}

function isColor(v: string | undefined): v is string {
  return isMeaningful(v, "rgba(0, 0, 0, 0)", "transparent");
}

/** The first family in a font-family stack, unquoted (e.g. `"Geist", sans-serif` → `Geist`). */
function fontName(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

function flow(c: Record<string, string>): string {
  if (!isFlex(c)) return "block";
  return c["flex-direction"] === "column" ? "column" : "row";
}

function isFlex(c: Record<string, string>): boolean {
  return c["display"] === "flex" || c["display"] === "inline-flex";
}

/** Prefer the computed width/height; fall back to the measured rect (e.g. `auto`). */
function sizeVal(computed: string | undefined, rect: number): string {
  if (computed && computed !== "auto" && /\d/.test(computed)) return computed;
  return `${Math.round(rect)}px`;
}

const AXIS = { "flex-start": "start", "center": "center", "flex-end": "end", stretch: "stretch" } as const;
function axis(v: string | undefined): string {
  return (AXIS as Record<string, string>)[(v ?? "").trim()] ?? "start";
}

/**
 * A Figma-style alignment field. Maps the container's justify/align to visual
 * X (horizontal) and Y (vertical) positions given its flex direction; the value
 * is `"<x>|<y>"` and `options[0]` carries the direction so the host can map an
 * edit back to the right CSS properties.
 */
function alignField(c: Record<string, string>): SectionField {
  const column = c["flex-direction"] === "column";
  const justify = axis(c["justify-content"]); // main axis
  const align = axis(c["align-items"]); // cross axis
  const x = column ? align : justify;
  const y = column ? justify : align;
  return {
    key: "align",
    label: "Align",
    kind: "align",
    value: `${x}|${y}`,
    token: null,
    options: [column ? "column" : "row"],
  };
}

const blendModes = ["normal", "multiply", "screen", "overlay", "darken", "lighten"];

/** Extract a rotation in degrees from a CSS transform matrix (0 when none). */
function rotationDeg(transform: string | undefined): number {
  if (!transform || transform === "none") return 0;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const parts = m[1].split(",").map((n) => parseFloat(n));
  if (parts.length < 2) return 0;
  return Math.round((Math.atan2(parts[1], parts[0]) * 180) / Math.PI);
}
