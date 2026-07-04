import { createClient } from "@supabase/supabase-js";
import { generateId } from "../lib/id";
import type { StyleGroup } from "./style-mining";
import type {
  ComponentIR,
  CompletenessReport,
  CompletenessIssue,
  NodeOverride,
} from "@vortspec/ir";
import type {
  DesignToken,
  TokenType,
  TokenValue,
} from "@vortspec/ir";
import type {
  IRNode,
  StyleValue,
  StyleProperty,
} from "@vortspec/ir";
import type { Provenance } from "@vortspec/ir";

// ---- CSS property -> TokenType mapping ----
const CSS_PROP_TO_TOKEN_TYPE: Record<string, TokenType> = {
  "background-color": "color",
  "background": "color",
  "color": "color",
  "border-color": "color",
  "border-radius": "radius",
  "padding": "spacing",
  "padding-top": "spacing",
  "padding-right": "spacing",
  "padding-bottom": "spacing",
  "padding-left": "spacing",
  "margin": "spacing",
  "margin-top": "spacing",
  "margin-right": "spacing",
  "margin-bottom": "spacing",
  "margin-left": "spacing",
  "gap": "spacing",
  "width": "spacing",
  "height": "spacing",
  "top": "spacing",
  "left": "spacing",
  "right": "spacing",
  "bottom": "spacing",
  "font-family": "typography",
  "font-size": "spacing",
  "font-weight": "typography",
  "line-height": "typography",
  "letter-spacing": "typography",
  "box-shadow": "shadow",
  "opacity": "opacity",
  "border-width": "border",
  "z-index": "zIndex",
};

/**
 * Convert a CSS hex color (3 or 6 digit) to 6-digit hex.
 */
function normalizeHex(hex: string): string | null {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return "#" + clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    return "#" + clean.toUpperCase();
  }
  if (clean.length === 8) {
    // RGBA hex
    return "#" + clean.slice(0, 6).toUpperCase();
  }
  return null;
}

/**
 * Parse rgb(r,g,b) or rgba(r,g,b,a) to hex.
 */
function rgbToHex(value: string): string | null {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const hex =
    "#" +
    [r, g, b].map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");
  return hex;
}

/**
 * Parse a CSS value to a typed TokenValue, given the token type.
 * Returns null if the value cannot be parsed.
 */
export function parseTokenValue(
  cssValue: string,
  tokenType: TokenType
): TokenValue | null {
  const trimmed = cssValue.trim();

  switch (tokenType) {
    case "color": {
      // Hex color
      if (trimmed.startsWith("#")) {
        const hex = normalizeHex(trimmed);
        if (hex) return { type: "color", value: { hex } };
      }
      // rgb/rgba
      if (trimmed.startsWith("rgb")) {
        const hex = rgbToHex(trimmed);
        if (hex) return { type: "color", value: { hex } };
      }
      return null;
    }

    case "spacing":
    case "sizing":
    case "radius": {
      // Npx
      const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
      if (pxMatch) {
        return {
          type: tokenType,
          value: { value: parseFloat(pxMatch[1]), unit: "px" },
        };
      }
      // Nrem
      const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)rem$/);
      if (remMatch) {
        return {
          type: tokenType,
          value: { value: parseFloat(remMatch[1]), unit: "rem" },
        };
      }
      // N%
      const pctMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
      if (pctMatch) {
        return {
          type: tokenType,
          value: { value: parseFloat(pctMatch[1]), unit: "%" },
        };
      }
      return null;
    }

    case "opacity": {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) return { type: "opacity", value: num };
      return null;
    }

    case "zIndex": {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) return { type: "zIndex", value: num };
      return null;
    }

    default:
      return null;
  }
}

/**
 * Determine the TokenType for a CSS property.
 */
export function cssPropertyToTokenType(property: string): TokenType | null {
  return CSS_PROP_TO_TOKEN_TYPE[property] ?? null;
}

function makeProvenance(): Provenance {
  return {
    source: "zip-html",
    extractor: "zip-html/report@1",
    extractedAt: new Date().toISOString(),
    confidence: "inferred",
    inferredBy: "deterministic",
  };
}

/**
 * Count all style values in an IRNode tree.
 */
function countStyleValues(node: IRNode): { total: number; tokenized: number } {
  let total = 0;
  let tokenized = 0;

  if (node.styles) {
    for (const sv of Object.values(node.styles)) {
      if (!sv) continue;
      total++;
      if (sv.kind === "token") tokenized++;
    }
  }

  if (node.children) {
    for (const child of node.children) {
      const sub = countStyleValues(child);
      total += sub.total;
      tokenized += sub.tokenized;
    }
  }

  return { total, tokenized };
}

/**
 * Collect all flagged literals from an IRNode tree.
 */
function collectFlaggedLiterals(
  node: IRNode,
  path: string,
): Array<{ nodePath: string; property: string; value: string | number }> {
  const results: Array<{ nodePath: string; property: string; value: string | number }> = [];

  if (node.styles) {
    for (const [prop, sv] of Object.entries(node.styles)) {
      if (!sv) continue;
      if (sv.kind === "literal" && sv.flagged) {
        results.push({ nodePath: path, property: prop, value: sv.value });
      }
    }
  }

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      results.push(
        ...collectFlaggedLiterals(child, `${path}/${child.name}`)
      );
    }
  }

  return results;
}

/**
 * Collect unnamed nodes from an IRNode tree.
 */
function collectUnnamedNodes(
  node: IRNode,
  path: string,
): Array<{ nodePath: string; name: string }> {
  const results: Array<{ nodePath: string; name: string }> = [];

  // Check if name is a generic/auto-generated pattern
  if (/^(div|span|frame|text|image|icon)-\d+$/.test(node.name) ||
      node.name.startsWith("component-candidate")) {
    results.push({ nodePath: path, name: node.name });
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(
        ...collectUnnamedNodes(child, `${path}/${child.name}`)
      );
    }
  }

  return results;
}

/**
 * Rewrite an IRNode tree: replace flagged literals whose values match
 * a promoted token with token references.
 */
function rewriteNodeStyles(
  node: IRNode,
  tokenLookup: Map<string, string>, // "property::value" -> tokenId
): IRNode {
  const newNode = { ...node };

  if (node.styles) {
    const newStyles: Partial<Record<StyleProperty, StyleValue>> = {};
    for (const [prop, sv] of Object.entries(node.styles)) {
      if (!sv) continue;
      if (sv.kind === "literal" && sv.flagged) {
        const key = `${prop}::${String(sv.value)}`;
        const tokenId = tokenLookup.get(key);
        if (tokenId) {
          newStyles[prop as StyleProperty] = { kind: "token", tokenId };
        } else {
          newStyles[prop as StyleProperty] = sv;
        }
      } else {
        newStyles[prop as StyleProperty] = sv;
      }
    }
    newNode.styles = newStyles;
  }

  if (node.children) {
    newNode.children = node.children.map((child) =>
      rewriteNodeStyles(child, tokenLookup)
    );
  }

  return newNode;
}

// ---- CSS property -> StyleProperty mapping (for token lookup key) ----
const CSS_TO_STYLE_PROP_FOR_LOOKUP: Record<string, StyleProperty> = {
  "background-color": "background",
  "background": "background",
  "color": "color",
  "border-color": "borderColor",
  "border-width": "borderWidth",
  "border-style": "borderStyle",
  "border-radius": "radius",
  "box-shadow": "shadow",
  "opacity": "opacity",
  "width": "width",
  "height": "height",
  "min-width": "minWidth",
  "max-width": "maxWidth",
  "min-height": "minHeight",
  "max-height": "maxHeight",
  "overflow": "overflow",
  "z-index": "zIndex",
  "padding": "width", // spacing types map to the exact value match
  "gap": "width",
  "font-size": "typography",
  "font-weight": "typography",
  "font-family": "typography",
  "line-height": "typography",
};

export interface ReportResult {
  tokens: DesignToken[];
  components: ComponentIR[];
  summary: {
    tokenCount: number;
    componentCount: number;
    issueCount: number;
  };
}

/**
 * Core report logic -- pure function.
 * Promotes repeated style values to tokens, rewrites components, computes completeness.
 */
export function runReportCore(
  components: ComponentIR[],
  styleGroups: StyleGroup[],
): ReportResult {
  const provenance = makeProvenance();
  const tokens: DesignToken[] = [];
  // Map from "styleProp::value" -> tokenId for rewriting
  const tokenLookup = new Map<string, string>();

  // 1. Promote style groups with usageCount >= 2 to tokens
  for (const group of styleGroups) {
    if (group.usageCount < 2) continue;

    const tokenType = cssPropertyToTokenType(group.property);
    if (!tokenType) continue;

    const tokenValue = parseTokenValue(group.value, tokenType);
    if (!tokenValue) continue;

    const tokenId = generateId("tok");
    const tokenName = `${group.property}/${group.value}`;

    const token: DesignToken = {
      id: tokenId,
      name: tokenName,
      type: tokenType,
      value: tokenValue,
      provenance,
    };

    tokens.push(token);

    // Build lookup key using the StyleProperty that this CSS property maps to
    const styleProp = CSS_TO_STYLE_PROP_FOR_LOOKUP[group.property];
    if (styleProp) {
      tokenLookup.set(`${styleProp}::${group.value}`, tokenId);
    }
  }

  // 2. Rewrite component styles: replace matching flagged literals with token refs
  const updatedComponents: ComponentIR[] = components.map((comp) => {
    const newStructure = rewriteNodeStyles(comp.structure, tokenLookup);

    // Also rewrite variant overrides
    const newVariantOverrides = comp.variantOverrides.map((vo) => ({
      ...vo,
      nodeOverrides: vo.nodeOverrides.map((no) => {
        if (!no.styles) return no;
        const newStyles: Record<string, StyleValue> = {};
        for (const [prop, sv] of Object.entries(no.styles)) {
          if (!sv) continue;
          if (sv.kind === "literal" && sv.flagged) {
            const key = `${prop}::${String(sv.value)}`;
            const tokenId = tokenLookup.get(key);
            if (tokenId) {
              newStyles[prop] = { kind: "token", tokenId };
            } else {
              newStyles[prop] = sv;
            }
          } else {
            newStyles[prop] = sv;
          }
        }
        return { ...no, styles: newStyles } as NodeOverride;
      }),
    }));

    // Also rewrite interaction state overrides
    const newStates = comp.states.map((state) => ({
      ...state,
      nodeOverrides: state.nodeOverrides.map((no) => {
        if (!no.styles) return no;
        const newStyles: Record<string, StyleValue> = {};
        for (const [prop, sv] of Object.entries(no.styles)) {
          if (!sv) continue;
          if (sv.kind === "literal" && sv.flagged) {
            const key = `${prop}::${String(sv.value)}`;
            const tokenId = tokenLookup.get(key);
            if (tokenId) {
              newStyles[prop] = { kind: "token", tokenId };
            } else {
              newStyles[prop] = sv;
            }
          } else {
            newStyles[prop] = sv;
          }
        }
        return { ...no, styles: newStyles } as NodeOverride;
      }),
    }));

    // 3. Compute completeness
    const { total, tokenized } = countStyleValues(newStructure);
    const tokenizedStyleRatio = total > 0 ? tokenized / total : 0;
    const statesCovered = comp.states.length / 4;

    const issues: CompletenessIssue[] = [];

    // Flagged literal issues
    const flagged = collectFlaggedLiterals(newStructure, "/root");
    for (const f of flagged) {
      issues.push({
        id: generateId("iss"),
        severity: "warning",
        kind: "flagged-literal",
        message: `Style "${f.property}" has un-tokenized value "${f.value}" at ${f.nodePath}`,
        targets: [{ componentId: comp.id, nodePath: f.nodePath }],
      });
    }

    // Unconfirmed inference issues for variant axes
    for (const axis of comp.variantAxes) {
      issues.push({
        id: generateId("iss"),
        severity: "info",
        kind: "unconfirmed-inference",
        message: `Variant axis "${axis.name}" was inferred and needs confirmation`,
        targets: [{ componentId: comp.id }],
      });
    }

    // Unnamed node issues
    const unnamed = collectUnnamedNodes(newStructure, "/root");
    for (const u of unnamed) {
      issues.push({
        id: generateId("iss"),
        severity: "info",
        kind: "unnamed-node",
        message: `Node "${u.name}" has a generic name at ${u.nodePath}`,
        targets: [{ componentId: comp.id, nodePath: u.nodePath }],
      });
    }

    // Compute score: weighted average
    const metrics = {
      tokenizedStyleRatio,
      confirmedTokenRatio: 0,
      variantAxesConfirmed: 0,
      statesCovered: Math.min(statesCovered, 1),
      namedNodesRatio: 0,
      a11yChecksPassed: 0.5,
    };

    const score = Math.round(
      (metrics.tokenizedStyleRatio * 30 +
        metrics.confirmedTokenRatio * 15 +
        metrics.variantAxesConfirmed * 10 +
        metrics.statesCovered * 15 +
        metrics.namedNodesRatio * 15 +
        metrics.a11yChecksPassed * 15) *
        100
    ) / 100;

    const completeness: CompletenessReport = {
      score,
      computedAt: new Date().toISOString(),
      metrics,
      issues,
    };

    return {
      ...comp,
      structure: newStructure,
      variantOverrides: newVariantOverrides,
      states: newStates,
      status: "normalized" as const,
      completeness,
    };
  });

  const totalIssues = updatedComponents.reduce(
    (sum, c) => sum + c.completeness.issues.length,
    0,
  );

  return {
    tokens,
    components: updatedComponents,
    summary: {
      tokenCount: tokens.length,
      componentCount: updatedComponents.length,
      issueCount: totalIssues,
    },
  };
}

/**
 * Wired version: runs core and persists to Supabase.
 */
export async function runReportStage(
  importId: string,
  projectId: string,
  components: ComponentIR[],
  styleGroups: StyleGroup[],
): Promise<ReportResult> {
  const result = runReportCore(components, styleGroups);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Insert tokens
  for (const token of result.tokens) {
    await supabase.from("tokens").insert({
      project_id: projectId,
      doc: token,
    });
  }

  // Insert components
  for (const component of result.components) {
    await supabase.from("components").insert({
      project_id: projectId,
      doc: component,
      status: "normalized",
      version: 1,
    });
  }

  return result;
}
