import { join, basename, dirname, extname } from "node:path";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { readProjectConfig } from "../workspace/config-manager";
import {
  readFigmaVariableModel,
  variableValueInMode,
  figmaGroup,
  normName,
  normValue,
} from "./figma-reconcile";
import { resolveToken, readTokenLinks, type ResolveCandidate } from "./token-resolver";
import { readTokenKeyMap, mergeTokenKeys } from "./design-map";
import { cachedScan } from "./scan-cache";
import { inspectorTokensResultSchema } from "@vortspec/core/inspector";
import type {
  FigmaCollection,
  FigmaVariable,
  FileSnapshot,
  InspectorToken,
  InspectorTokensResult,
  TokenType,
  TokenUsage,
} from "@vortspec/core/inspector";

/**
 * Parse the project's design tokens from its configured token file (CSS custom
 * properties). This is a file-derived viewer — no IR store. Figma-authoritative
 * reconciliation (source: figma-variable) is layered on later; for now every
 * parsed token is attributed to the generated code.
 */

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

/** The canonical key for the default (light / mode-less) code context. */
export const DEFAULT_CONTEXT = ":root";

/**
 * Context-aware parse of a token file (change: figma-native-token-model). CSS
 * expresses Figma "modes" as selector scopes (`:root`, `.dark`,
 * `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`), so we collect
 * each `--var: value;` under the context it is declared in rather than merging
 * everything into one map. A brace-matched scan tracks the enclosing prelude
 * stack; isolated here so it can be swapped for a full CSS AST later (D5).
 */
export interface CssContextParse {
  /** Context keys found, `:root` first when present. */
  contexts: string[];
  /** Token names in first-seen order (union across contexts). */
  order: string[];
  /** token name → (context key → raw value). */
  raw: Map<string, Map<string, string>>;
}

/** Collapse an at-rule/selector prelude stack to a single canonical context key. */
function contextKeyFor(stack: string[]): string {
  const joined = stack.join(" | ").toLowerCase();
  if (/prefers-color-scheme\s*:\s*dark/.test(joined)) return "@media (prefers-color-scheme: dark)";
  for (let i = stack.length - 1; i >= 0; i--) {
    const p = stack[i].trim();
    if (!p) continue;
    if (p.startsWith("@")) {
      if (/^@theme\b/.test(p)) return DEFAULT_CONTEXT; // Tailwind v4 @theme is the default context
      continue; // other at-rules (@media light, @supports) — look further out for a selector
    }
    return normalizeSelector(p);
  }
  return DEFAULT_CONTEXT;
}

/** Canonicalize a selector prelude to its context key (root-ish selectors → `:root`). */
function normalizeSelector(sel: string): string {
  const first = sel.split(",")[0].trim().replace(/\s+/g, " ");
  if (first === ":root" || first === "html" || first === "*" || first === ":where(:root)") {
    return DEFAULT_CONTEXT;
  }
  return first;
}

export function parseCssContexts(css: string): CssContextParse {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments
  const raw = new Map<string, Map<string, string>>();
  const order: string[] = [];
  const contextsSeen = new Set<string>();
  const stack: string[] = [];
  let buf = "";
  const record = (ctx: string, name: string, value: string) => {
    let byCtx = raw.get(name);
    if (!byCtx) {
      byCtx = new Map();
      raw.set(name, byCtx);
      order.push(name);
    }
    byCtx.set(ctx, value.trim()); // last declaration in a context wins
    contextsSeen.add(ctx);
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      stack.pop();
      buf = "";
    } else if (ch === ";") {
      const decl = buf.trim();
      const m = decl.match(/^--([\w-]+)\s*:\s*([\s\S]+)$/);
      if (m) record(contextKeyFor(stack), m[1], m[2]);
      buf = "";
    } else {
      buf += ch;
    }
  }
  const contexts = [...contextsSeen];
  contexts.sort((a, b) => (a === DEFAULT_CONTEXT ? -1 : b === DEFAULT_CONTEXT ? 1 : 0));
  return { contexts, order, raw };
}

/**
 * Resolve a `var(--x)` reference to a concrete value within a context: look up
 * the referenced token in the same context first, then fall back to the default
 * context, mirroring the CSS cascade. Bounded to avoid reference cycles.
 */
export function resolveInContext(
  value: string,
  ctx: string,
  parse: CssContextParse,
  depth = 0,
): string {
  if (depth > 10) return value.trim();
  const match = value.trim().match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if (!match) return value.trim();
  const byCtx = parse.raw.get(match[1]);
  const referenced = byCtx?.get(ctx) ?? byCtx?.get(DEFAULT_CONTEXT);
  if (referenced !== undefined) return resolveInContext(referenced, ctx, parse, depth + 1);
  return (match[2] ?? value).trim();
}

/**
 * Parse a token file into the flat, default-context token list the base view
 * uses. Each token is valued at the default (`:root`) context when present, else
 * its first-declared context, so the union of custom properties is returned
 * (back-compatible with the pre-mode single-value behavior).
 */
export function parseTokensFromCss(
  css: string,
): Omit<InspectorToken, "source" | "uses">[] {
  const parse = parseCssContexts(css);
  const tokens: Omit<InspectorToken, "source" | "uses">[] = [];
  for (const name of parse.order) {
    const byCtx = parse.raw.get(name);
    if (!byCtx) continue;
    const ctx = byCtx.has(DEFAULT_CONTEXT) ? DEFAULT_CONTEXT : [...byCtx.keys()][0];
    const rawValue = byCtx.get(ctx) ?? "";
    const resolvedValue = resolveInContext(rawValue, ctx, parse);
    tokens.push({ name, rawValue, resolvedValue, type: classify(name, resolvedValue) });
  }
  return tokens;
}

const SOURCE_EXTS = new Set([".tsx", ".jsx", ".ts", ".vue", ".svelte", ".css", ".scss"]);

/** Read every component source file under `dir` as { component, text }. */
async function collectSources(dir: string): Promise<{ component: string; text: string }[]> {
  const out: { component: string; text: string }[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(extname(entry.name)) && !entry.name.endsWith(".variants.ts")) {
        const text = await readFile(full, "utf8").catch(() => "");
        if (text) out.push({ component: basename(entry.name, extname(entry.name)), text });
      }
    }
  }
  await walk(dir);
  return out;
}

/**
 * Best-effort recovery of the CSS property or Tailwind utility a token reference
 * sits on, by looking at the text just before it. Covers:
 *   - `color: var(--x)`      → "color"            (CSS declaration)
 *   - `background: var(--x)`  → "background"
 *   - `bg-[--x]` / `bg-[var(--x)]` → "bg"          (Tailwind arbitrary value)
 * Returns undefined when no clear context is found.
 */
function deriveProperty(text: string, at: number): string | undefined {
  const before = text.slice(Math.max(0, at - 48), at);
  // Tailwind arbitrary value: `bg-[` or `text-[var(`
  const tw = before.match(/([a-z][a-z-]*)-\[(?:var\()?$/);
  if (tw) return tw[1];
  // CSS declaration: `color: ` or `border-color: var(`
  const css = before.match(/([a-zA-Z-]+)\s*:\s*(?:var\()?$/);
  if (css) return css[1];
  return undefined;
}

/**
 * Build a token → usage map by scanning component sources for any reference to a
 * token — `var(--name)`, Tailwind arbitrary values (`bg-[--name]`,
 * `text-[var(--name)]`), `@apply`, or `theme(--name)` — not just `var()`. Each
 * component is listed once per token, with the property/utility it sits on when
 * recoverable (for the detail drawer's "where used").
 */
export function buildUsage(
  tokenNames: string[],
  sources: { component: string; text: string }[],
): Record<string, TokenUsage[]> {
  const usage: Record<string, TokenUsage[]> = {};
  const names = new Set(tokenNames);
  for (const { component, text } of sources) {
    const seen = new Set<string>();
    // Any `--name` mention (word-boundary at the end so `--x` ≠ `--x-hover`).
    for (const m of text.matchAll(/--([\w-]+)(?![\w-])/g)) {
      const name = m[1];
      if (!names.has(name) || seen.has(name)) continue;
      seen.add(name);
      const property = deriveProperty(text, m.index ?? 0);
      (usage[name] ??= []).push(property ? { component, property } : { component });
    }
  }
  return usage;
}

/**
 * Names of tokens the user has hand-edited in the Inspector, persisted per
 * project so their provenance survives reload (local-first, plain file). Reading
 * is forgiving — a missing or malformed file just means "nothing hand-edited".
 */
const OVERRIDES_PATH = ".vortspec/token-overrides.json";

async function readOverrides(projectPath: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(projectPath, OVERRIDES_PATH), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
  } catch {
    /* no overrides yet */
  }
  return new Set();
}

async function markOverridden(projectPath: string, name: string): Promise<void> {
  const set = await readOverrides(projectPath);
  set.add(name);
  const path = join(projectPath, OVERRIDES_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify([...set].sort(), null, 2)}\n`, "utf8").catch(
    () => undefined,
  );
}

/**
 * User overrides for the Figma-mode → code-context mapping, persisted per project
 * (local-first plain file, like token overrides). A missing/malformed file means
 * "use the derived defaults". Kept out of the CLI-written `project.yaml` because
 * that file is flat and machine-owned; this is VortSpec-owned state.
 */
const MODE_MAP_PATH = ".vortspec/token-mode-map.json";

async function readModeMapOverrides(projectPath: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(projectPath, MODE_MAP_PATH), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
      return out;
    }
  } catch {
    /* no override yet */
  }
  return {};
}

/** Persist a full mode→context map override (used by the transparent-cockpit editor). */
export async function writeTokenModeMap(
  projectPath: string,
  map: Record<string, string>,
): Promise<InspectorTokensResult> {
  const path = join(projectPath, MODE_MAP_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, "utf8").catch(() => undefined);
  return getInspectorTokens(projectPath);
}

/**
 * Derive the default Figma-mode → code-context mapping from a collection's modes
 * and the contexts present in the token file. The collection's default mode maps
 * to the default `:root` context; a dark-named mode maps to the best dark context
 * found; otherwise a context whose selector mentions the mode name, else unmapped.
 */
export function deriveModeMap(
  collection: FigmaCollection | null,
  contexts: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!collection) return map;
  const darkCtx =
    contexts.find((c) => c === "@media (prefers-color-scheme: dark)") ??
    contexts.find((c) => /(^|\.)dark\b/.test(c)) ??
    contexts.find((c) => /dark/i.test(c));
  for (const m of collection.modes) {
    const nm = m.name.toLowerCase();
    if (collection.modes.length === 1 || m.id === collection.defaultModeId) {
      map[m.name] = DEFAULT_CONTEXT;
    } else if (/dark|night/.test(nm) && darkCtx) {
      map[m.name] = darkCtx;
    } else if (/light|day|default/.test(nm)) {
      map[m.name] = DEFAULT_CONTEXT;
    } else {
      const byName = contexts.find((c) => c.toLowerCase().includes(nm));
      map[m.name] = byName ?? "";
    }
  }
  return map;
}

/** The name of a collection's default mode (by `defaultModeId`, else the first mode). */
function defaultModeName(collection: FigmaCollection | null): string | null {
  if (!collection || collection.modes.length === 0) return null;
  const byId = collection.modes.find((m) => m.id === collection.defaultModeId);
  return (byId ?? collection.modes[0]).name;
}

/** Pick the collection to reconcile against: the one whose variables match the most code tokens. */
function pickActiveCollection(
  collections: FigmaCollection[],
  variables: FigmaVariable[],
  codeNorms: Set<string>,
  preferred?: string,
): FigmaCollection | null {
  if (collections.length === 0) return null;
  if (preferred) {
    const p = collections.find((c) => c.name === preferred);
    if (p) return p;
  }
  const counts = new Map<string, number>();
  for (const v of variables) {
    if (v.collection && codeNorms.has(normName(v.name))) {
      counts.set(v.collection, (counts.get(v.collection) ?? 0) + 1);
    }
  }
  let best = collections[0];
  let bestN = -1;
  for (const c of collections) {
    const n = counts.get(c.name) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

const EMPTY_RESULT: Omit<InspectorTokensResult, "tokenFile"> = {
  tokens: [],
  usage: {},
  figmaOnly: [],
  figmaSynced: false,
  collections: [],
  activeCollection: null,
  activeMode: null,
  modeMap: {},
};

/**
 * Read the project's tokens, cached by an input fingerprint (Plan B2): a warm cache
 * (no source/Figma change since last read) returns the stored result without re-parsing.
 * The derived key map (`.vortspec/maps/tokens.json`) is NOT an input — it's an output of
 * this scan, computed from the token file + Figma cache, both already fingerprinted.
 */
export async function getInspectorTokens(
  projectPath: string,
  preferredCollection?: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  if (!tokenFile) return { tokenFile: null, ...EMPTY_RESULT };
  return cachedScan<InspectorTokensResult>(
    projectPath,
    `tokens-${preferredCollection ?? "default"}`,
    {
      files: [
        ".sdd-de/project.yaml",
        tokenFile,
        ".vortspec/figma-variables.json",
        ".vortspec/token-overrides.json",
        ".vortspec/token-links.json",
        ".vortspec/token-mode-map.json",
      ],
      dirs: config?.componentDir ? [config.componentDir] : [],
      extra: preferredCollection ?? "",
    },
    () => computeInspectorTokens(projectPath, preferredCollection),
    inspectorTokensResultSchema,
  );
}

async function computeInspectorTokens(
  projectPath: string,
  preferredCollection?: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  if (!tokenFile) return { tokenFile: null, ...EMPTY_RESULT };
  let css: string;
  try {
    css = await readFile(join(projectPath, tokenFile), "utf8");
  } catch {
    return { tokenFile, ...EMPTY_RESULT };
  }
  const parse = parseCssContexts(css);
  const parsed = parseTokensFromCss(css);
  const sources = config?.componentDir
    ? await collectSources(join(projectPath, config.componentDir))
    : [];
  const usage = buildUsage(
    parsed.map((t) => t.name),
    sources,
  );
  const edited = await readOverrides(projectPath);

  // Figma-authoritative overlay, now mode- and group-aware (change:
  // figma-native-token-model). Absent export → model is null and every token
  // stays generated-code/hand-edited with a single (default) mode.
  const model = await readFigmaVariableModel(projectPath);
  const codeNorms = new Set(parsed.map((t) => normName(t.name)));
  const figmaByNorm = new Map<string, FigmaVariable>();
  if (model) {
    for (const v of model.variables) {
      const k = normName(v.name);
      if (!figmaByNorm.has(k)) figmaByNorm.set(k, v); // first wins
    }
  }

  const activeCollection = model
    ? pickActiveCollection(model.collections, model.variables, codeNorms, preferredCollection)
    : null;
  const modeNames = activeCollection?.modes.map((m) => m.name) ?? [];
  const defMode = defaultModeName(activeCollection);

  // Layered token resolution (change: token-fidelity-sanitation): match code
  // tokens to Figma variables by link → name → value → alias, so a token that
  // exists under a different name (e.g. `--font-size-md` ↔ `typography/font-size/md`)
  // still reconciles instead of showing as unmatched. Value equality uses the
  // default mode's resolved value; ambiguous value matches don't auto-bind.
  const links = await readTokenLinks(projectPath);
  // Durable key map (Plan B1): the highest-precedence resolver signal. Figma candidates
  // carry their publish-stable `variableKey`; code tokens carry the key recorded for them.
  const keyMap = await readTokenKeyMap(projectPath);
  const figmaIndex: ResolveCandidate[] = [...figmaByNorm.values()].map((v) => ({
    name: v.name,
    value: variableValueInMode(v, defMode, defMode ?? undefined) ?? v.resolvedValue,
    aliasOf: defMode ? v.valuesByMode?.[defMode]?.aliasOf : undefined,
    key: v.key,
  }));
  const resolveMatch = (t: (typeof parsed)[number]): { match?: FigmaVariable; signal: InspectorToken["matchSignal"] } => {
    if (!model) return { signal: undefined };
    const ref = t.rawValue.trim().match(/^var\(\s*--([\w-]+)/);
    const res = resolveToken(
      { name: t.name, value: t.resolvedValue, aliasOf: ref ? ref[1] : undefined, key: keyMap.tokens[normName(t.name)]?.variableKey },
      figmaIndex,
      { links },
    );
    return { match: res.match ? figmaByNorm.get(normName(res.match.name)) : undefined, signal: res.signal };
  };
  const modeMap = {
    ...deriveModeMap(activeCollection, parse.contexts),
    ...(await readModeMapOverrides(projectPath)),
  };
  const multiMode = modeNames.length > 1;
  const activeMode = multiMode ? defMode : (modeNames[0] ?? null);

  const driftOf = (codeResolved: string, figmaVal: string | undefined) =>
    figmaVal === undefined
      ? undefined
      : normValue(codeResolved) === normValue(figmaVal)
        ? ("in-sync" as const)
        : ("drifted" as const);

  const matchedFigma = new Set<string>(); // figma variables claimed by a code token (any signal)
  // Confident code↔variableKey joins to persist into the durable map (Plan B1b): only
  // high-confidence signals (key/link/name), never a fuzzy value guess. Recording them
  // now means a later Figma rename still resolves by key next session.
  const keyJoins: { token: string; variableKey: string; value?: string }[] = [];
  const CONFIDENT = new Set(["key", "link", "name"]);
  const tokens: InspectorToken[] = parsed.map((t) => {
    const { match, signal: matchSignal } = resolveMatch(t);
    if (match) matchedFigma.add(normName(match.name));
    if (match?.key && matchSignal && CONFIDENT.has(matchSignal)) {
      keyJoins.push({ token: t.name, variableKey: match.key, value: match.resolvedValue || undefined });
    }
    const source = edited.has(t.name) ? "hand-edited" : match ? "figma-variable" : "generated-code";
    const figmaPath = match ? match.name : undefined;
    const group = match ? figmaGroup(match.name) : undefined;

    // Per-mode view (only when the active collection actually has >1 mode).
    let modes: InspectorToken["modes"];
    if (multiMode) {
      modes = {};
      for (const m of modeNames) {
        const ctx = modeMap[m];
        // Read-only is a property of the MODE, not the token: a mode with no
        // mapped code context can't be edited at all. When a mode IS mapped, a
        // token that isn't redefined in that context still has an effective value
        // — the default `:root` value cascades (CSS semantics) — so it stays
        // editable/pushable rather than flipping to read-only.
        const mapped = !!ctx && parse.contexts.includes(ctx);
        const figmaVal = match ? variableValueInMode(match, m, defMode ?? undefined) : undefined;
        if (!mapped) {
          modes[m] = {
            rawValue: figmaVal ?? t.rawValue,
            resolvedValue: figmaVal ?? t.resolvedValue,
            figmaValue: figmaVal,
            readOnly: true,
          };
        } else {
          const byCtx = parse.raw.get(t.name);
          const codeRaw = byCtx?.get(ctx) ?? byCtx?.get(DEFAULT_CONTEXT) ?? t.rawValue;
          const resolved = resolveInContext(codeRaw, ctx, parse);
          modes[m] = {
            rawValue: codeRaw,
            resolvedValue: resolved,
            figmaValue: figmaVal,
            drift: driftOf(resolved, figmaVal),
            readOnly: false,
          };
        }
      }
    }

    // Top-level fields mirror the default mode (back-compat for the flat view).
    const defEntry = multiMode && defMode ? modes?.[defMode] : undefined;
    const figmaValue = defEntry
      ? defEntry.figmaValue
      : match
        ? variableValueInMode(match, defMode, defMode ?? undefined)
        : undefined;
    const drift = defEntry ? defEntry.drift : driftOf(t.resolvedValue, figmaValue);

    return {
      ...t,
      source,
      uses: usage[t.name]?.length ?? 0,
      figmaValue,
      drift,
      matchSignal: match ? matchSignal : undefined,
      figmaPath,
      group,
      modes,
    };
  });

  // Persist any new durable-key joins (guarded — writes only when the map changed).
  await mergeTokenKeys(projectPath, keyJoins);

  // Figma variables with no matching code token (designed, not yet in code).
  const figmaOnly: FigmaVariable[] = [];
  const seenOnly = new Set<string>();
  if (model) {
    for (const v of model.variables) {
      const k = normName(v.name);
      if (seenOnly.has(k)) continue;
      seenOnly.add(k);
      // Excluded when a code token claimed it by ANY resolver signal (not just name).
      if (!codeNorms.has(k) && !matchedFigma.has(k)) figmaOnly.push(v);
    }
  }

  return {
    tokenFile,
    tokens,
    usage,
    figmaOnly,
    figmaSynced: model !== null,
    collections: model?.collections ?? [],
    activeCollection: activeCollection?.name ?? null,
    activeMode,
    modeMap,
  };
}

/**
 * Gated value edit: write a new value for `--name` into the token file. Only the
 * value of an existing declaration is changed (the property name is untouched —
 * renames that also rewrite code go through the Claude Code modify loop). When a
 * `context` (a selector such as `.dark`) is given, the edit is scoped to that
 * block so a per-mode value is written without touching the default mode; VortSpec
 * never creates a context that doesn't already exist. Returns the refreshed set.
 */
export async function setInspectorTokenValue(
  projectPath: string,
  name: string,
  value: string,
  context?: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile;
  if (tokenFile) {
    const path = join(projectPath, tokenFile);
    const css = await readFile(path, "utf8").catch(() => null);
    if (css) {
      const next =
        context && context !== DEFAULT_CONTEXT
          ? replaceDeclInContext(css, name, value, context)
          : replaceDecl(css, name, value);
      if (next !== null) {
        await writeFile(path, next, "utf8");
        // Record the hand-edit so its provenance shows as "hand-edited" on reload.
        await markOverridden(projectPath, name);
      }
    }
  }
  return getInspectorTokens(projectPath);
}

/** Replace the first `--name: <value>;` anywhere, preserving indentation. null if not found. */
function replaceDecl(css: string, name: string, value: string): string | null {
  const re = new RegExp(`(--${escapeRe(name)}\\s*:\\s*)([^;]*)(;)`);
  return re.test(css) ? css.replace(re, `$1${value.trim()}$3`) : null;
}

/**
 * Replace `--name: value;` only within the block whose prelude matches `context`
 * (e.g. `.dark`), so a per-mode edit leaves other modes untouched. Returns null
 * when the context block or the declaration inside it isn't found.
 */
function replaceDeclInContext(
  css: string,
  name: string,
  value: string,
  context: string,
): string | null {
  // Find a block prelude that, normalized, equals the target context selector.
  const target = context.trim();
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) return null;
    const prelude = css.slice(i, open).split(/[{}]/).pop()?.trim() ?? "";
    // Match the last selector prelude ending at this brace.
    const preludeStart = Math.max(css.lastIndexOf("}", open), css.lastIndexOf("{", open - 1)) + 1;
    const rawPrelude = css.slice(preludeStart, open).trim();
    const sel = rawPrelude.split(",")[0].trim().replace(/\s+/g, " ");
    // Determine the block extent (brace-matched).
    let depth = 0;
    let close = -1;
    for (let j = open; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close === -1) return null;
    if (sel === target || rawPrelude === target || prelude === target) {
      const block = css.slice(open, close);
      const re = new RegExp(`(--${escapeRe(name)}\\s*:\\s*)([^;]*)(;)`);
      if (re.test(block)) {
        return css.slice(0, open) + block.replace(re, `$1${value.trim()}$3`) + css.slice(close);
      }
    }
    i = close + 1;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index just before the closing `}` of the first `@theme` block, or -1 if none. */
export function themeBlockInsertIndex(css: string): number {
  const at = css.search(/@theme\b/);
  if (at === -1) return -1;
  const open = css.indexOf("{", at);
  if (open === -1) return -1;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i; // the block's closing brace
    }
  }
  return -1;
}

/**
 * Insert a new `--name: value;` declaration into the token file. Returns the new
 * CSS, or null when a token with the same normalized name already exists (caller
 * surfaces a human-readable rejection). Prefers the `@theme` block; falls back to
 * a `:root` block, else prepends a fresh `:root` block. Pure + exported for tests.
 */
export function insertTokenDeclaration(
  css: string,
  name: string,
  value: string,
): string | null {
  const existing = new Set(parseTokensFromCss(css).map((t) => normName(t.name)));
  if (existing.has(normName(name))) return null;
  const decl = `  --${name}: ${value.trim()};\n`;
  const themeIdx = themeBlockInsertIndex(css);
  if (themeIdx !== -1) return css.slice(0, themeIdx) + decl + css.slice(themeIdx);
  const rootIdx = css.search(/:root\b[^{]*\{/);
  if (rootIdx !== -1) {
    const open = css.indexOf("{", rootIdx);
    const close = css.indexOf("}", open);
    if (close !== -1) return css.slice(0, close) + decl + css.slice(close);
  }
  return `:root {\n${decl}}\n\n${css}`;
}

/**
 * Create a new design token: validate the name, reject a normalized-name
 * duplicate, write the declaration into the token file, and mark it hand-edited
 * so its provenance is correct on reload. A newly created token is immediately
 * pushable (change: add-code-to-figma-token-push). Throws with a human-readable
 * message on a bad name, missing token file, or duplicate.
 */
export async function createInspectorToken(
  projectPath: string,
  name: string,
  value: string,
  allowDuplicate = false,
): Promise<InspectorTokensResult> {
  const clean = name.trim().replace(/^--/, "");
  if (!/^[a-zA-Z][\w-]*$/.test(clean)) {
    throw new Error(`"${name}" isn't a valid token name. Use letters, numbers, and hyphens (e.g. color-brand).`);
  }
  if (!value.trim()) throw new Error("A token needs a value.");
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile;
  if (!tokenFile) throw new Error("This project has no configured token file to write to.");
  const path = join(projectPath, tokenFile);
  const css = await readFile(path, "utf8").catch(() => null);
  if (css === null) throw new Error(`Couldn't read the token file at ${tokenFile}.`);

  // Dedup-before-create (change: token-fidelity-sanitation): refuse to mint a
  // token whose name or value already exists in Figma — reuse it instead. The
  // user can override with `allowDuplicate` after seeing what it collides with.
  if (!allowDuplicate) {
    const model = await readFigmaVariableModel(projectPath);
    if (model) {
      const links = await readTokenLinks(projectPath);
      const idx = model.variables.map((v) => ({ name: v.name, value: v.resolvedValue }));
      const res = resolveToken({ name: clean, value: value.trim() }, idx, { links });
      const existing = res.match ? [res.match.name] : (res.suggestions ?? []).map((s) => s.name);
      if (existing.length > 0) {
        throw new Error(
          `That ${res.match?.name === clean ? "name" : "value"} already exists in Figma as ${existing
            .slice(0, 3)
            .join(", ")}${existing.length > 3 ? ", …" : ""}. Reuse it instead of creating a duplicate — name your token to match it, or link it.`,
        );
      }
    }
  }

  const next = insertTokenDeclaration(css, clean, value);
  if (next === null) throw new Error(`A token named --${clean} already exists.`);
  await writeFile(path, next, "utf8");
  await markOverridden(projectPath, clean);
  return getInspectorTokens(projectPath);
}

/**
 * Sanitation collapse (change: token-fidelity-sanitation): rewrite a token's raw
 * value to a `var(--canonical)` reference, reclaiming a flattened alias /
 * duplicate. Only the value of the existing declaration changes; the token keeps
 * its name and every usage. Gated — the UI previews this before calling. Returns
 * the refreshed token set (a no-op when either token is missing).
 */
export async function collapseTokenToAlias(
  projectPath: string,
  tokenName: string,
  canonicalName: string,
): Promise<InspectorTokensResult> {
  const name = tokenName.replace(/^--/, "");
  const canonical = canonicalName.replace(/^--/, "");
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile;
  if (tokenFile && name !== canonical) {
    const path = join(projectPath, tokenFile);
    const css = await readFile(path, "utf8").catch(() => null);
    if (css) {
      const next = replaceDecl(css, name, `var(--${canonical})`);
      if (next !== null) {
        await writeFile(path, next, "utf8");
        await markOverridden(projectPath, name);
      }
    }
  }
  return getInspectorTokens(projectPath);
}

/**
 * Capture the files a token rename/delete would touch — the token file plus every
 * component source under `component_dir` — before a gated Claude Code modify run,
 * so the change can be reverted verbatim if the user rejects it.
 */
export async function snapshotTokenScope(projectPath: string): Promise<FileSnapshot[]> {
  const config = await readProjectConfig(projectPath);
  const snaps: FileSnapshot[] = [];
  const seen = new Set<string>();
  async function capture(rel: string): Promise<void> {
    if (seen.has(rel)) return;
    seen.add(rel);
    const content = await readFile(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) snaps.push({ path: rel, content });
  }
  if (config?.tokenFile) await capture(config.tokenFile);
  if (config?.componentDir) {
    const root = join(projectPath, config.componentDir);
    async function walk(d: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (SOURCE_EXTS.has(extname(entry.name))) await capture(full.slice(projectPath.length + 1));
      }
    }
    await walk(root);
  }
  return snaps;
}

/** Directories a broad source snapshot never descends into (deps, build output, VCS, our own state). */
const SNAPSHOT_SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo", ".cache", "coverage", ".vortspec", ".sdd-de",
]);
/** Upper bound on files a single move snapshots — a backstop against a pathological repo. */
const MAX_SOURCE_SNAPSHOT = 2000;

/**
 * A broad source snapshot for a drag-move (change: canvas-drag-move, Decision 6).
 *
 * The token scope covers only the token file + `component_dir`, but a relocation's
 * origin or destination is often a SCREEN file outside that (e.g. `src/App.tsx`).
 * Since the host cannot pre-resolve which files a move will touch (no fingerprint→
 * file resolver), it falls back to snapshotting the whole source tree so a discard
 * can always restore exactly. Bounded to `src/` when present (else the project root),
 * skipping dependencies and build output, and capped so a huge repo can't stall a move.
 */
export async function snapshotSourceScope(projectPath: string): Promise<FileSnapshot[]> {
  const config = await readProjectConfig(projectPath);
  const snaps: FileSnapshot[] = [];
  const seen = new Set<string>();
  async function capture(rel: string): Promise<void> {
    if (seen.has(rel) || snaps.length >= MAX_SOURCE_SNAPSHOT) return;
    seen.add(rel);
    const content = await readFile(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) snaps.push({ path: rel, content });
  }
  // Prefer a conventional `src/` root; otherwise walk from the project root.
  const hasSrc = await readdir(join(projectPath, "src")).then(
    () => true,
    () => false,
  );
  const root = hasSrc ? join(projectPath, "src") : projectPath;
  async function walk(d: string): Promise<void> {
    if (snaps.length >= MAX_SOURCE_SNAPSHOT) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (snaps.length >= MAX_SOURCE_SNAPSHOT) return;
      if (entry.name.startsWith(".") && entry.isDirectory() && !SNAPSHOT_SKIP_DIRS.has(entry.name)) continue;
      if (SNAPSHOT_SKIP_DIRS.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(extname(entry.name))) await capture(full.slice(projectPath.length + 1));
    }
  }
  await walk(root);
  // Always include the token file even if it lives outside the walked root.
  if (config?.tokenFile) await capture(config.tokenFile);
  return snaps;
}
