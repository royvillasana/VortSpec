import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  figmaVariableSchema,
  figmaVariableModelSchema,
  type FigmaVariable,
  type FigmaVariableModel,
  type TokenDrift,
} from "@vortspec/core/inspector";
import { figmaComponentSchema, type FigmaComponent } from "@vortspec/core/figma";

/**
 * Figma-authoritative reconciliation. VortSpec never talks to Figma directly —
 * a scoped Claude Code run (the engine, with the user's own MCP) exports the
 * design variables to `.vortspec/figma-variables.json`. This module is the
 * cockpit half: read that cache and diff it against the parsed token file,
 * flagging drift. Pure file computation; no MCP client, no network.
 */

export const FIGMA_VARS_PATH = ".vortspec/figma-variables.json";
export const FIGMA_COMPONENTS_PATH = ".vortspec/figma-components.json";

/** Canonical token/variable name: no leading `--`, lowercased, `/ . _ space` → `-`. */
export function normName(name: string): string {
  return name
    .replace(/^--/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s/._]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Canonical component name for cross-convention matching: lowercased with every
 * non-alphanumeric stripped, so `InputField`, `input-field`, and `Input Field`
 * all collapse to `inputfield`. Component names vary far more than tokens (code
 * PascalCase vs Figma kebab/spaced/slashed), so this is stricter than `normName`.
 */
export function normComponentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Canonical value for equality: trim/lowercase, collapse space, expand & alpha-strip hex. */
export function normValue(value: string): string {
  let s = value.trim().toLowerCase().replace(/\s+/g, " ");
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6); // opaque alpha is noise
    return `#${h}`;
  }
  // Dimensions: Figma stores FLOATs unitless (18), code carries a unit (18px). Compare
  // the number so `18px`/`18rem`/`18` all match — otherwise every dimension token reads
  // as an orphan against its Figma variable (change: token-fidelity-sanitation).
  const dim = s.match(/^(-?\d*\.?\d+)(px|rem|em|%|pt|vh|vw)?$/);
  if (dim) return String(Number(dim[1]));
  return s;
}

export interface Reconciliation {
  /** normName → matched Figma variable value + drift verdict. */
  byName: Map<string, { figmaValue: string; drift: TokenDrift }>;
  /** Figma variables with no matching code token. */
  figmaOnly: FigmaVariable[];
}

/** The synthetic collection/mode names a legacy (mode-less) export is wrapped into. */
export const DEFAULT_COLLECTION = "Tokens";
export const DEFAULT_MODE = "Default";

/**
 * Parse the tolerant legacy shapes into flat FigmaVariable rows: an array of
 * `{name, resolvedValue|value}` objects, or a flat `{name: value}` map. Kept
 * field-for-field identical to the original `readFigmaVariables` output so the
 * back-compat contract (and its tests) hold. Returns [] for garbage rows.
 */
function parseLegacyVariableRows(data: unknown): FigmaVariable[] {
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

/**
 * Parse `.vortspec/figma-variables.json`. Tolerant of two shapes Claude may emit:
 * an array of `{name, resolvedValue|value}` objects, or a flat `{name: value}` map.
 * Returns null when the file is absent or unparseable (→ "not synced").
 *
 * Back-compat reader (change: figma-native-token-model kept this signature). For
 * the mode/group-aware object shape use `readFigmaVariableModel`; this returns
 * just the flat variable list (default-mode values), which the push planner and
 * legacy single-mode reconcile still consume.
 */
export async function readFigmaVariables(projectPath: string): Promise<FigmaVariable[] | null> {
  const model = await readFigmaVariableModel(projectPath);
  return model ? model.variables : null;
}

/**
 * Read the full mode/group/alias-aware variable model. Detects the new object
 * shape (`{collections, variables}`) and parses it richly; wraps a legacy flat
 * array/map as one `Default`-mode collection with the path taken from each name.
 * Returns null when the cache is absent or unparseable (→ "not synced").
 */
export async function readFigmaVariableModel(
  projectPath: string,
): Promise<FigmaVariableModel | null> {
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
  // New object shape: has a `variables` (and usually `collections`) key.
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "variables" in (data as Record<string, unknown>)
  ) {
    const parsed = figmaVariableModelSchema.safeParse(data);
    if (parsed.success) return parsed.data;
    // Fall through to legacy parsing if the object failed strict validation.
  }
  // Legacy array / flat map → wrap as a single Default-mode collection.
  const vars = parseLegacyVariableRows(data);
  const collections = new Set<string>();
  for (const v of vars) collections.add(v.collection ?? DEFAULT_COLLECTION);
  if (collections.size === 0) collections.add(DEFAULT_COLLECTION);
  return {
    collections: [...collections].map((name) => ({
      name,
      modes: [{ id: DEFAULT_MODE, name: DEFAULT_MODE }],
      defaultModeId: DEFAULT_MODE,
    })),
    variables: vars,
  };
}

/** Full slash segments of a Figma variable name (`primitive/color/primary` → 3 segments). */
export function figmaSegments(name: string): string[] {
  return name.split("/").map((s) => s.trim()).filter(Boolean);
}

/** Group-folder segments (path minus the leaf label) for indented display. */
export function figmaGroup(name: string): string[] {
  return figmaSegments(name).slice(0, -1);
}

/**
 * A variable's resolved value in a given mode. Prefers `valuesByMode[modeName]`,
 * falling back to the default mode's value, then the flat `resolvedValue`. When
 * the mode has an alias, the concrete resolved value is still returned for
 * display (the alias is surfaced separately).
 */
export function variableValueInMode(
  v: FigmaVariable,
  modeName: string | null,
  defaultModeName?: string,
): string | undefined {
  const byMode = v.valuesByMode;
  if (byMode) {
    const pick = (m: string | null | undefined) =>
      m && byMode[m] ? (byMode[m].value ?? undefined) : undefined;
    return pick(modeName) ?? pick(defaultModeName) ?? v.resolvedValue;
  }
  return v.resolvedValue;
}

/**
 * Parse `.vortspec/figma-components.json` (Wave 3). Returns null when absent or
 * unparseable (→ "not synced"). Skips malformed rows.
 */
export async function readFigmaComponents(projectPath: string): Promise<FigmaComponent[] | null> {
  let raw: string;
  try {
    raw = await readFile(join(projectPath, FIGMA_COMPONENTS_PATH), "utf8");
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return [];
  const comps: FigmaComponent[] = [];
  for (const row of data) {
    const parsed = figmaComponentSchema.safeParse(row);
    if (parsed.success) comps.push(parsed.data);
  }
  return comps;
}

export interface ComponentReconciliation {
  /** normName → the matched Figma component's variant axes. */
  byName: Map<string, { figmaVariants: string[]; isSet: boolean }>;
  /** Figma components with no matching code component (designed, not yet built). */
  figmaOnly: FigmaComponent[];
}

/** Diff code component names against Figma components by canonical name. */
export function reconcileComponents(
  codeNames: string[],
  figmaComps: FigmaComponent[],
): ComponentReconciliation {
  const codeNorms = new Set(codeNames.map(normComponentName));
  const byName = new Map<string, { figmaVariants: string[]; isSet: boolean }>();
  const figmaOnly: FigmaComponent[] = [];
  const seen = new Set<string>();
  for (const c of figmaComps) {
    const key = normComponentName(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (codeNorms.has(key)) {
      byName.set(key, { figmaVariants: c.variants, isSet: c.isSet });
    } else {
      figmaOnly.push(c);
    }
  }
  return { byName, figmaOnly };
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
