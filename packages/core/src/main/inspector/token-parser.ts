import { join, basename, dirname, extname } from "node:path";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { readProjectConfig } from "../workspace/config-manager";
import { readFigmaVariables, reconcile, normName } from "./figma-reconcile";
import type {
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

export function parseTokensFromCss(
  css: string,
): Omit<InspectorToken, "source" | "uses">[] {
  const raw = new Map<string, string>();
  for (const m of css.matchAll(CSS_VAR)) {
    // Last declaration wins, matching CSS cascade within a single :root block.
    raw.set(m[1], m[2].trim());
  }
  const tokens: Omit<InspectorToken, "source" | "uses">[] = [];
  for (const [name, rawValue] of raw) {
    const resolvedValue = resolve(rawValue, raw);
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

export async function getInspectorTokens(
  projectPath: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  if (!tokenFile) return { tokenFile: null, tokens: [], usage: {}, figmaOnly: [], figmaSynced: false };
  let css: string;
  try {
    css = await readFile(join(projectPath, tokenFile), "utf8");
  } catch {
    return { tokenFile, tokens: [], usage: {}, figmaOnly: [], figmaSynced: false };
  }
  const parsed = parseTokensFromCss(css);
  const sources = config?.componentDir
    ? await collectSources(join(projectPath, config.componentDir))
    : [];
  const usage = buildUsage(
    parsed.map((t) => t.name),
    sources,
  );
  const edited = await readOverrides(projectPath);
  // Figma-authoritative overlay: match by normalized name, flag drift. Absent
  // export → figmaVars is null and every token stays generated-code/hand-edited.
  const figmaVars = await readFigmaVariables(projectPath);
  const recon = figmaVars ? reconcile(parsed, figmaVars) : null;
  const tokens: InspectorToken[] = parsed.map((t) => {
    const match = recon?.byName.get(normName(t.name));
    // Provenance: a local hand-edit is what the user did last, so it wins the
    // badge; otherwise a Figma match is the authoritative origin.
    const source = edited.has(t.name) ? "hand-edited" : match ? "figma-variable" : "generated-code";
    return {
      ...t,
      source,
      uses: usage[t.name]?.length ?? 0,
      figmaValue: match?.figmaValue,
      drift: match?.drift,
    };
  });
  return {
    tokenFile,
    tokens,
    usage,
    figmaOnly: recon?.figmaOnly ?? [],
    figmaSynced: figmaVars !== null,
  };
}

/**
 * Gated value edit: write a new value for `--name` into the token file. Only the
 * value of an existing declaration is changed (the property name is untouched —
 * renames that also rewrite code go through the Claude Code modify loop). Returns
 * the refreshed token set.
 */
export async function setInspectorTokenValue(
  projectPath: string,
  name: string,
  value: string,
): Promise<InspectorTokensResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile;
  if (tokenFile) {
    const path = join(projectPath, tokenFile);
    const css = await readFile(path, "utf8").catch(() => null);
    if (css) {
      // Replace the value of `--name: <value>;`, preserving indentation + comment.
      const re = new RegExp(`(--${name}\\s*:\\s*)([^;]*)(;)`);
      if (re.test(css)) {
        await writeFile(path, css.replace(re, `$1${value.trim()}$3`), "utf8");
        // Record the hand-edit so its provenance shows as "hand-edited" on reload.
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
