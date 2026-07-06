import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { readProjectConfig } from "../workspace/config-manager";
import type {
  InspectorToken,
  InspectorTokensResult,
  TokenType,
} from "../../shared/inspector";

/**
 * Parse the project's design tokens from its configured token file (CSS custom
 * properties). This is a file-derived viewer — no IR store. Figma-authoritative
 * reconciliation (source: figma-variable) is layered on later; for now every
 * parsed token is attributed to the generated code.
 */

const CSS_VAR = /--([\w-]+)\s*:\s*([^;]+);/g;
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla|oklch|color)\(/i;
const CSS_COLOR_KEYWORDS = new Set([
  "white",
  "black",
  "transparent",
  "currentcolor",
  "red",
  "green",
  "blue",
  "gray",
  "grey",
]);

function looksLikeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  return HEX.test(v) || COLOR_FN.test(v) || CSS_COLOR_KEYWORDS.has(v);
}

/** Classify a token by name first (authoritative for our slash/hyphen naming), then value. */
function classify(name: string, resolvedValue: string): TokenType {
  const n = name.toLowerCase();
  if (/(^|[-/])(radius)([-/]|$)/.test(n)) return "radius";
  if (/(^|[-/])(shadow|elevation)([-/]|$)/.test(n)) return "shadow";
  if (/(^|[-/])(spacing|space|gap|size-)/.test(n) && !/font/.test(n)) return "spacing";
  if (/(font|line-height|letter|weight|leading|tracking|family|type)/.test(n))
    return "typography";
  if (/(color|colour|bg|background|foreground|border|text|fill|stroke|primary|secondary|accent|status|neutral|surface|muted)/.test(n))
    return "color";
  if (looksLikeColor(resolvedValue)) return "color";
  return "other";
}

/** Follow in-file `var(--x)` references to a concrete value (bounded to avoid cycles). */
function resolve(value: string, table: Map<string, string>, depth = 0): string {
  if (depth > 10) return value;
  const match = value.trim().match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if (!match) return value.trim();
  const referenced = table.get(match[1]);
  if (referenced !== undefined) return resolve(referenced, table, depth + 1);
  // Unresolved reference — fall back to the declared default, else the raw ref.
  return (match[2] ?? value).trim();
}

export function parseTokensFromCss(css: string): Omit<InspectorToken, "source">[] {
  const raw = new Map<string, string>();
  for (const m of css.matchAll(CSS_VAR)) {
    // Last declaration wins, matching CSS cascade within a single :root block.
    raw.set(m[1], m[2].trim());
  }
  const tokens: Omit<InspectorToken, "source">[] = [];
  for (const [name, rawValue] of raw) {
    const resolvedValue = resolve(rawValue, raw);
    tokens.push({ name, rawValue, resolvedValue, type: classify(name, resolvedValue) });
  }
  return tokens;
}

export async function getInspectorTokens(
  projectPath: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  if (!tokenFile) return { tokenFile: null, tokens: [] };
  let css: string;
  try {
    css = await readFile(join(projectPath, tokenFile), "utf8");
  } catch {
    return { tokenFile, tokens: [] };
  }
  const tokens: InspectorToken[] = parseTokensFromCss(css).map((t) => ({
    ...t,
    source: "generated-code",
  }));
  return { tokenFile, tokens };
}
