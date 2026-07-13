import type {
  FigmaVariable,
  FigmaVariableType,
  InspectorToken,
  PushPlan,
  PushPlanEntry,
  TokenType,
} from "@vortspec/core/inspector";
import { normName, normValue } from "./figma-reconcile";

/**
 * Code→Figma push planning (change: add-code-to-figma-token-push). Pure file
 * computation, sibling to `reconcile()`: diff parsed code tokens against the
 * Figma-variable cache and produce a plan of variables to create/update. The
 * plan is what the UI previews and the user confirms; the actual Figma write is
 * delegated to figma-cli or a scoped Claude Code run. No MCP client, no network.
 */

/**
 * The Figma Variables collection VortSpec pushes into. VortSpec owns this
 * collection: the push auto-creates it if it doesn't exist and writes the code
 * tokens there, so the user never has to create or name a collection in Figma.
 */
export const VORTSPEC_COLLECTION = "VortSpec";

/** Leading numeric magnitude of a dimension value (`16px` → 16, `1.5rem` → 1.5). null when not numeric. */
function numericValue(value: string): number | null {
  const m = value.trim().match(/^-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function looksLikeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) ||
    /^(?:rgb|rgba|hsl|hsla|oklch|color)\(/.test(v)
  );
}

/**
 * Map a code token to the scalar Figma variable type it should be written as.
 * Figma variables are scalar (COLOR / FLOAT / STRING); composite tokens are
 * decomposed upstream in `planEntriesForToken`, so this only sees scalars.
 */
export function figmaTypeFor(type: TokenType, name: string, resolvedValue: string): FigmaVariableType {
  if (type === "color") return "COLOR";
  if (looksLikeColor(resolvedValue)) return "COLOR";
  if (type === "spacing" || type === "radius") return "FLOAT";
  if (type === "typography") {
    if (/family/.test(name)) return "STRING";
    if (numericValue(resolvedValue) !== null) return "FLOAT"; // size, line-height, weight, tracking
    return "STRING";
  }
  // other / shadow-scalar
  return numericValue(resolvedValue) !== null ? "FLOAT" : "STRING";
}

/** A parsed single box-shadow → scalar sub-parts, or null when not decomposable. */
export function decomposeShadow(
  value: string,
): { suffix: string; value: string; figmaType: FigmaVariableType }[] | null {
  const v = value.trim();
  // Only decompose a single, comma-free shadow of the form: <ox> <oy> <blur> [spread] <color>
  if (v.includes(",") && !/\)\s*$/.test(v)) return null; // multiple shadows → not decomposable here
  // Pull the color out (hex or color function) so the remainder is pure lengths.
  const colorMatch = v.match(/(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch)\([^)]*\))\s*$/);
  const color = colorMatch ? colorMatch[1] : null;
  const lengths = (color ? v.slice(0, v.length - color.length) : v)
    .trim()
    .replace(/^inset\s+/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (lengths.length < 3) return null; // need at least offset-x, offset-y, blur
  const out: { suffix: string; value: string; figmaType: FigmaVariableType }[] = [];
  const labels = ["offset-x", "offset-y", "blur", "spread"];
  lengths.slice(0, 4).forEach((len, i) => {
    if (numericValue(len) === null) return;
    out.push({ suffix: labels[i], value: len, figmaType: "FLOAT" });
  });
  if (out.length < 3) return null;
  if (color) out.push({ suffix: "color", value: color, figmaType: "COLOR" });
  return out;
}

/**
 * Expand one code token into the Figma variable entries it should push to. Most
 * tokens are a single scalar entry; a shadow composite decomposes into
 * offset/blur/spread/color sub-variables so no token type is left unrepresented.
 */
function expandToken(token: Pick<InspectorToken, "name" | "rawValue" | "resolvedValue" | "type">): {
  variable: string;
  figmaType: FigmaVariableType;
  value: string;
  /** the referenced token name when rawValue is `var(--x)`, else null */
  ref: string | null;
}[] {
  const ref = token.rawValue.trim().match(/^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/);
  const refName = ref ? ref[1] : null;

  // A composite box-shadow with no reference → decompose into scalar sub-variables.
  if (token.type === "shadow" && !refName) {
    const parts = decomposeShadow(token.resolvedValue);
    if (parts) {
      return parts.map((p) => ({
        variable: `${token.name}-${p.suffix}`,
        figmaType: p.figmaType,
        value: p.value,
        ref: null,
      }));
    }
    // Unparseable → push the raw shadow string so it is still represented.
    return [{ variable: token.name, figmaType: "STRING", value: token.resolvedValue, ref: null }];
  }

  return [
    {
      variable: token.name,
      figmaType: figmaTypeFor(token.type, token.name, token.resolvedValue),
      value: token.resolvedValue,
      ref: refName,
    },
  ];
}

/**
 * Compute the push plan: for each code token, the Figma variable(s) to create
 * (no match in the cache) or update (drifted). In-sync tokens are skipped.
 * A `var(--x)` reference whose target variable exists in the collection becomes
 * an alias entry; otherwise it falls back to its resolved concrete value.
 */
export function computePushPlan(
  tokens: Pick<InspectorToken, "name" | "rawValue" | "resolvedValue" | "type">[],
  figmaVars: FigmaVariable[],
  collection: string = VORTSPEC_COLLECTION,
): PushPlan {
  const figmaByNorm = new Map<string, string>(); // normName → resolvedValue
  for (const v of figmaVars) if (!figmaByNorm.has(normName(v.name))) figmaByNorm.set(normName(v.name), v.resolvedValue);

  const entries: PushPlanEntry[] = [];
  for (const token of tokens) {
    for (const e of expandToken(token)) {
      const key = normName(e.variable);
      const figmaValue = figmaByNorm.get(key);
      const exists = figmaValue !== undefined;

      // Alias when the reference resolves to a variable that exists in the collection.
      const aliasTarget = e.ref && figmaByNorm.has(normName(e.ref)) ? normName(e.ref) : undefined;

      if (exists && normValue(e.value) === normValue(figmaValue)) continue; // in-sync → skip

      entries.push({
        variable: e.variable,
        op: exists ? "update" : "create",
        figmaType: e.figmaType,
        ...(aliasTarget ? { aliasTarget } : { value: e.value }),
        ...(exists ? { currentFigmaValue: figmaValue } : {}),
        tokenName: token.name,
        tokenType: token.type,
      });
    }
  }
  return { collection, entries };
}
