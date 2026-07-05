import { nanoid } from "nanoid";
import type {
  DesignToken,
  TokenType,
  TokenValue,
  ColorValue,
  DimensionValue,
  TypographyValue,
  ShadowLayer,
  IRNode,
  NodeType,
  StyleValue,
  LayoutSpec,
  Provenance,
  ComponentIR,
  VariantAxis,
  PropDef,
  CompletenessReport,
  A11yMeta,
} from "@vortspec/ir";
import type {
  FigmaNode,
  FigmaFill,
  FigmaEffect,
  FigmaVariable,
  FigmaVariablesResponse,
  FigmaStylesResponse,
  FigmaComponentProperty,
} from "./client.js";

// ---------- ID generation ----------

type IdPrefix = "tok" | "cmp" | "nod" | "iss" | "pat" | "scr" | "thm";

function generateId(prefix: IdPrefix): string {
  return `${prefix}_${nanoid(12)}`;
}

// ---------- Helpers ----------

function makeProvenance(
  extractor: string,
  sourceRef?: string,
): Provenance {
  return {
    source: "figma",
    sourceRef,
    extractor,
    extractedAt: new Date().toISOString(),
    confidence: "confirmed",
  };
}

function makeInferredProvenance(
  extractor: string,
  sourceRef?: string,
): Provenance {
  return {
    source: "figma",
    sourceRef,
    extractor,
    extractedAt: new Date().toISOString(),
    confidence: "inferred",
    inferredBy: "deterministic",
  };
}

/**
 * Convert Figma's 0-1 RGBA color to a hex string (uppercase, no alpha).
 */
export function rgbaToHex(color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

function makeLiteral(value: string | number): StyleValue {
  return { kind: "literal" as const, value, flagged: true as const };
}

function makeTokenRef(tokenId: string): StyleValue {
  return { kind: "token" as const, tokenId };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferTokenTypeFromName(name: string): TokenType {
  const lower = name.toLowerCase();
  if (/radius/i.test(lower)) return "radius";
  if (/spacing|gap|padding|margin/i.test(lower)) return "spacing";
  if (/size|width|height/i.test(lower)) return "sizing";
  if (/opacity|alpha/i.test(lower)) return "opacity";
  if (/z-?index|elevation/i.test(lower)) return "zIndex";
  // Default for FLOAT variables without a recognized name pattern
  return "sizing";
}

// ---------- Map Variables to Tokens ----------

export function mapVariablesToTokens(
  variablesResponse: FigmaVariablesResponse,
): { tokens: DesignToken[]; variableIdToTokenId: Map<string, string> } {
  const tokens: DesignToken[] = [];
  const variableIdToTokenId = new Map<string, string>();
  const { variables, variableCollections } = variablesResponse.meta;

  for (const variable of Object.values(variables)) {
    const collection = variableCollections[variable.variableCollectionId];
    if (!collection) continue;

    const defaultModeId = collection.defaultModeId;
    const rawValue = variable.valuesByMode[defaultModeId];
    if (rawValue === undefined) continue;

    // Skip alias variables (they reference other variables)
    if (
      typeof rawValue === "object" &&
      rawValue !== null &&
      "type" in rawValue &&
      (rawValue as { type: string }).type === "VARIABLE_ALIAS"
    ) {
      continue;
    }

    const tokenId = generateId("tok");
    variableIdToTokenId.set(variable.id, tokenId);

    const provenance = makeProvenance(
      "figma-variables-adapter",
      `variable:${variable.id}`,
    );

    let tokenValue: TokenValue | undefined;

    switch (variable.resolvedType) {
      case "COLOR": {
        const color = rawValue as { r: number; g: number; b: number; a: number };
        const colorVal: ColorValue = {
          hex: rgbaToHex(color),
          alpha: color.a,
        };
        tokenValue = { type: "color" as const, value: colorVal };
        break;
      }
      case "FLOAT": {
        const numValue = rawValue as number;
        const tokenType = inferTokenTypeFromName(variable.name);
        if (tokenType === "opacity") {
          tokenValue = { type: "opacity" as const, value: numValue };
        } else if (tokenType === "zIndex") {
          tokenValue = { type: "zIndex" as const, value: numValue };
        } else {
          const dimValue: DimensionValue = { value: numValue, unit: "px" };
          tokenValue = { type: tokenType, value: dimValue } as TokenValue;
        }
        break;
      }
      case "STRING":
      case "BOOLEAN":
        // String and boolean variables don't map to VortSpec tokens directly
        continue;
    }

    if (!tokenValue) continue;

    tokens.push({
      id: tokenId,
      name: variable.name,
      type: tokenValue.type,
      value: tokenValue,
      description: variable.description,
      provenance,
    });
  }

  return { tokens, variableIdToTokenId };
}

// ---------- Map Fill to StyleValue ----------

export function mapFillToStyleValue(
  fill: FigmaFill,
  variableIdToTokenId?: Map<string, string>,
): StyleValue | undefined {
  // Check for bound variable
  if (fill.boundVariables?.color?.id && variableIdToTokenId) {
    const tokenId = variableIdToTokenId.get(fill.boundVariables.color.id);
    if (tokenId) {
      return makeTokenRef(tokenId);
    }
  }

  // Solid fill without variable binding
  if (fill.type === "SOLID" && fill.color) {
    return makeLiteral(rgbaToHex(fill.color));
  }

  return undefined;
}

// ---------- Map Effect to Shadow ----------

function mapEffectToShadowLayer(effect: FigmaEffect): ShadowLayer | undefined {
  if (
    effect.type !== "DROP_SHADOW" &&
    effect.type !== "INNER_SHADOW"
  ) {
    return undefined;
  }
  if (effect.visible === false) return undefined;

  const colorVal: ColorValue = effect.color
    ? { hex: rgbaToHex(effect.color), alpha: effect.color.a }
    : { hex: "#000000", alpha: 1 };

  return {
    x: effect.offset?.x ?? 0,
    y: effect.offset?.y ?? 0,
    blur: effect.radius ?? 0,
    spread: effect.spread ?? 0,
    colorRef: colorVal,
    inset: effect.type === "INNER_SHADOW" ? true : undefined,
  };
}

// ---------- Map Auto Layout to LayoutSpec ----------

export function mapAutoLayoutToLayoutSpec(
  node: FigmaNode,
): LayoutSpec | undefined {
  if (!node.layoutMode || node.layoutMode === "NONE") {
    return undefined;
  }

  const direction: "row" | "column" =
    node.layoutMode === "HORIZONTAL" ? "row" : "column";

  // Map primary axis alignment
  let justify: LayoutSpec["justify"];
  switch (node.primaryAxisAlignItems) {
    case "MIN":
      justify = "start";
      break;
    case "CENTER":
      justify = "center";
      break;
    case "MAX":
      justify = "end";
      break;
    case "SPACE_BETWEEN":
      justify = "between";
      break;
    default:
      justify = undefined;
  }

  // Map counter axis alignment
  let align: LayoutSpec["align"];
  switch (node.counterAxisAlignItems) {
    case "MIN":
      align = "start";
      break;
    case "CENTER":
      align = "center";
      break;
    case "MAX":
      align = "end";
      break;
    case "BASELINE":
      align = "baseline";
      break;
    default:
      align = undefined;
  }

  // Build padding
  const hasPadding =
    node.paddingTop ||
    node.paddingRight ||
    node.paddingBottom ||
    node.paddingLeft;

  const padding = hasPadding
    ? {
        top: makeLiteral(`${node.paddingTop ?? 0}px`),
        right: makeLiteral(`${node.paddingRight ?? 0}px`),
        bottom: makeLiteral(`${node.paddingBottom ?? 0}px`),
        left: makeLiteral(`${node.paddingLeft ?? 0}px`),
      }
    : undefined;

  const gap =
    node.itemSpacing !== undefined
      ? makeLiteral(`${node.itemSpacing}px`)
      : undefined;

  return {
    mode: "flex",
    direction,
    gap,
    padding,
    align,
    justify,
  };
}

// ---------- Map Node to IRNode ----------

function mapFigmaTypeToNodeType(figmaType: string): NodeType {
  switch (figmaType) {
    case "TEXT":
      return "text";
    case "INSTANCE":
      return "instance";
    default:
      // FRAME, COMPONENT, COMPONENT_SET, RECTANGLE, ELLIPSE, GROUP, etc.
      return "frame";
  }
}

export function mapNodeToIRNode(
  node: FigmaNode,
  variableIdToTokenId?: Map<string, string>,
): IRNode {
  const nodeId = generateId("nod");
  const nodeType = mapFigmaTypeToNodeType(node.type);

  // Build styles
  const styles: IRNode["styles"] = {};

  // Background from fills
  if (node.fills && node.fills.length > 0) {
    const visibleFill = node.fills.find((f) => f.visible !== false);
    if (visibleFill) {
      const bg = mapFillToStyleValue(visibleFill, variableIdToTokenId);
      if (bg) styles.background = bg;
    }
  }

  // Border color from strokes
  if (node.strokes && node.strokes.length > 0) {
    const visibleStroke = node.strokes.find((f) => f.visible !== false);
    if (visibleStroke) {
      const bc = mapFillToStyleValue(visibleStroke, variableIdToTokenId);
      if (bc) styles.borderColor = bc;
    }
  }

  // Shadow from effects
  if (node.effects && node.effects.length > 0) {
    const shadowLayers = node.effects
      .map(mapEffectToShadowLayer)
      .filter((l): l is ShadowLayer => l !== undefined);
    if (shadowLayers.length > 0) {
      // Store shadow as a stringified representation since StyleValue is string | number
      const shadowDesc = shadowLayers
        .map(
          (l) =>
            `${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${typeof l.colorRef === "string" ? l.colorRef : l.colorRef.hex}`,
        )
        .join(", ");
      styles.shadow = makeLiteral(shadowDesc);
    }
  }

  // Dimensions from bounding box
  if (node.absoluteBoundingBox) {
    styles.width = makeLiteral(`${node.absoluteBoundingBox.width}px`);
    styles.height = makeLiteral(`${node.absoluteBoundingBox.height}px`);
  }

  // Corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    styles.radius = makeLiteral(`${node.cornerRadius}px`);
  }

  // Layout
  const layout = mapAutoLayoutToLayoutSpec(node);

  // Text
  const text =
    nodeType === "text" && node.characters
      ? { content: node.characters }
      : undefined;

  // Typography from text style
  if (nodeType === "text" && node.style?.fontFamily) {
    // Store typography as a literal description
    const typoDesc = `${node.style.fontFamily} ${node.style.fontWeight ?? 400} ${node.style.fontSize ?? 16}px`;
    styles.typography = makeLiteral(typoDesc);
  }

  // Instance reference
  const instance =
    nodeType === "instance" && node.componentId
      ? {
          componentId: node.componentId,
          variantSelection: {} as Record<string, string>,
          propBindings: {} as Record<string, string | number | boolean>,
        }
      : undefined;

  // Recurse children
  const children = node.children
    ?.filter((child) => child.visible !== false)
    .map((child) => mapNodeToIRNode(child, variableIdToTokenId));

  const irNode: IRNode = {
    id: nodeId,
    type: nodeType,
    name: node.name,
    provenance: makeProvenance("figma-node-mapper", `node:${node.id}`),
    ...(layout && { layout }),
    ...(Object.keys(styles).length > 0 && { styles }),
    ...(text && { text }),
    ...(instance && { instance }),
    ...(children && children.length > 0 && { children }),
  };

  return irNode;
}

// ---------- Map ComponentSet to ComponentIR ----------

export function mapComponentSetToIR(
  componentSetNode: FigmaNode,
  childNodes: FigmaNode[],
  variableIdToTokenId?: Map<string, string>,
): ComponentIR {
  const componentId = generateId("cmp");
  const propDefs = componentSetNode.componentPropertyDefinitions ?? {};

  // Extract variant axes and props
  const variantAxes: VariantAxis[] = [];
  const props: PropDef[] = [];

  for (const [propName, propDef] of Object.entries(propDefs)) {
    const provenance = makeProvenance(
      "figma-component-mapper",
      `component-set:${componentSetNode.id}:prop:${propName}`,
    );

    if (propDef.type === "VARIANT" && propDef.variantOptions) {
      variantAxes.push({
        name: propName,
        options: propDef.variantOptions,
        default: propDef.variantOptions[0],
        provenance,
      });
    } else if (propDef.type === "TEXT") {
      props.push({
        name: propName,
        type: "string",
        default:
          typeof propDef.defaultValue === "string"
            ? propDef.defaultValue
            : undefined,
        required: false,
        provenance,
      });
    } else if (propDef.type === "BOOLEAN") {
      props.push({
        name: propName,
        type: "boolean",
        default: propDef.defaultValue,
        required: false,
        provenance,
      });
    } else if (propDef.type === "INSTANCE_SWAP") {
      props.push({
        name: propName,
        type: "node",
        required: false,
        provenance,
      });
    }
  }

  // Build structure from the first child (base variant)
  const baseVariant = childNodes[0] ?? componentSetNode;
  const structure = mapNodeToIRNode(baseVariant, variableIdToTokenId);

  const emptyCompleteness: CompletenessReport = {
    score: 0,
    computedAt: new Date().toISOString(),
    metrics: {
      tokenizedStyleRatio: 0,
      confirmedTokenRatio: 0,
      variantAxesConfirmed: 0,
      statesCovered: 0,
      namedNodesRatio: 0,
      a11yChecksPassed: 0,
    },
    issues: [],
  };

  const emptyA11y: A11yMeta = {};

  return {
    id: componentId,
    name: componentSetNode.name,
    slug: slugify(componentSetNode.name),
    status: "imported",
    version: 1,
    provenance: makeProvenance(
      "figma-component-mapper",
      `component-set:${componentSetNode.id}`,
    ),
    variantAxes,
    props,
    slots: [],
    states: [],
    structure,
    variantOverrides: [],
    a11y: emptyA11y,
    completeness: emptyCompleteness,
  };
}

// ---------- Map Text Styles to Tokens ----------

export function mapTextStylesToTokens(
  stylesResponse: FigmaStylesResponse,
  styleNodes: Record<string, FigmaNode>,
): DesignToken[] {
  const tokens: DesignToken[] = [];

  for (const styleMeta of stylesResponse.meta.styles) {
    if (styleMeta.style_type !== "TEXT") continue;

    const node = styleNodes[styleMeta.node_id];
    if (!node?.style) continue;

    const textStyle = node.style;
    const tokenId = generateId("tok");

    const fontSize: DimensionValue = {
      value: textStyle.fontSize ?? 16,
      unit: "px",
    };

    const lineHeight: DimensionValue | number = textStyle.lineHeightPx
      ? { value: textStyle.lineHeightPx, unit: "px" as const }
      : 1.5;

    const typographyValue: TypographyValue = {
      fontFamily: textStyle.fontFamily ?? "sans-serif",
      fontSize,
      fontWeight: textStyle.fontWeight ?? 400,
      lineHeight,
      ...(textStyle.letterSpacing !== undefined && {
        letterSpacing: {
          value: textStyle.letterSpacing,
          unit: "px" as const,
        },
      }),
    };

    tokens.push({
      id: tokenId,
      name: styleMeta.name,
      type: "typography",
      value: { type: "typography", value: typographyValue },
      description: styleMeta.description || undefined,
      provenance: makeProvenance(
        "figma-text-style-adapter",
        `style:${styleMeta.key}`,
      ),
    });
  }

  return tokens;
}

// ---------- Mine fills from document tree ----------

export function mineFills(document: FigmaNode): DesignToken[] {
  const colorCounts = new Map<string, { hex: string; alpha: number; count: number }>();

  function walkNode(node: FigmaNode): void {
    if (node.fills) {
      for (const fill of node.fills) {
        if (
          fill.type === "SOLID" &&
          fill.color &&
          fill.visible !== false &&
          !fill.boundVariables?.color
        ) {
          const hex = rgbaToHex(fill.color);
          const alpha = fill.color.a ?? 1;
          const key = `${hex}_${alpha}`;
          const existing = colorCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorCounts.set(key, { hex, alpha, count: 1 });
          }
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        walkNode(child);
      }
    }
  }

  walkNode(document);

  // Only create tokens for colors used more than once (likely intentional)
  const tokens: DesignToken[] = [];
  for (const [, { hex, alpha, count }] of colorCounts) {
    if (count < 2) continue;

    const tokenId = generateId("tok");
    tokens.push({
      id: tokenId,
      name: `mined/${hex.slice(1).toLowerCase()}`,
      type: "color",
      value: {
        type: "color",
        value: { hex, alpha },
      },
      provenance: makeInferredProvenance("figma-fill-miner"),
    });
  }

  return tokens;
}
