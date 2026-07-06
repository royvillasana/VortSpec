import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { figmaVariableSchema, type FigmaVariable, type TokenDrift } from "../../shared/inspector";

/**
 * Figma-authoritative reconciliation. VortSpec never talks to Figma directly —
 * a scoped Claude Code run (the engine, with the user's own MCP) exports the
 * design variables to `.vortspec/figma-variables.json`. This module is the
 * cockpit half: read that cache and diff it against the parsed token file,
 * flagging drift. Pure file computation; no MCP client, no network.
 */

export const FIGMA_VARS_PATH = ".vortspec/figma-variables.json";

/** Canonical token/variable name: no leading `--`, lowercased, `/ . _ space` → `-`. */
export function normName(name: string): string {
  return name
    .replace(/^--/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s/._]+/g, "-")
    .replace(/-+/g, "-");
}

/** Canonical value for equality: trim/lowercase, collapse space, expand & alpha-strip hex. */
export function normValue(value: string): string {
  let s = value.trim().toLowerCase().replace(/\s+/g, " ");
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6); // opaque alpha is noise
    s = `#${h}`;
  }
  return s;
}

export interface Reconciliation {
  /** normName → matched Figma variable value + drift verdict. */
  byName: Map<string, { figmaValue: string; drift: TokenDrift }>;
  /** Figma variables with no matching code token. */
  figmaOnly: FigmaVariable[];
}

/**
 * Parse `.vortspec/figma-variables.json`. Tolerant of two shapes Claude may emit:
 * an array of `{name, resolvedValue|value}` objects, or a flat `{name: value}` map.
 * Returns null when the file is absent or unparseable (→ "not synced").
 */
export async function readFigmaVariables(projectPath: string): Promise<FigmaVariable[] | null> {
  let raw: string;
  try {
    raw = await readFile(join(projectPath, FIGMA_VARS_PATH), "utf8");
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const rows: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.entries(data as Record<string, unknown>).map(([name, value]) => ({ name, value }))
      : [];
  const vars: FigmaVariable[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : null;
    const value = r.resolvedValue ?? r.value ?? r.resolved ?? r.val;
    if (!name || value == null) continue;
    const parsed = figmaVariableSchema.safeParse({
      name,
      resolvedValue: String(value),
      type: r.type,
      collection: r.collection,
    });
    if (parsed.success) vars.push(parsed.data);
  }
  return vars;
}

/** Diff parsed code tokens against Figma variables by normalized name. */
export function reconcile(
  tokens: { name: string; resolvedValue: string }[],
  figmaVars: FigmaVariable[],
): Reconciliation {
  const codeByNorm = new Map<string, string>(); // normName → resolvedValue
  for (const t of tokens) codeByNorm.set(normName(t.name), t.resolvedValue);

  const byName = new Map<string, { figmaValue: string; drift: TokenDrift }>();
  const figmaOnly: FigmaVariable[] = [];
  const seen = new Set<string>();

  for (const v of figmaVars) {
    const key = normName(v.name);
    if (seen.has(key)) continue; // first mode/collection wins
    seen.add(key);
    const codeValue = codeByNorm.get(key);
    if (codeValue === undefined) {
      figmaOnly.push(v);
      continue;
    }
    byName.set(key, {
      figmaValue: v.resolvedValue,
      drift: normValue(codeValue) === normValue(v.resolvedValue) ? "in-sync" : "drifted",
    });
  }
  return { byName, figmaOnly };
}
