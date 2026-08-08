import {
  DTCG_EXTENSION_NS,
  dtcgSegmentFromSourceName,
  toDtcgAlias,
  type DesignTokenDocument,
  type DesignTokenLeaf,
  type DtcgTypeName,
  type DtcgValue,
  type TokenCollection,
  type TokenModeValue,
} from "./design-tokens";
import { z } from "zod";
import { insertLeaf, type CanonicalBuildMeta, type CanonicalBuildResult } from "./canonical-tokens";
import { DEFAULT_CONTEXT, cssVarReference, parseCssContexts, resolveInContext } from "./css-tokens";
import { tokenEmitSummarySchema } from "./token-emit-ledger";

/**
 * Ingest paths for design sources that are NOT a design tool — OpenSpec change:
 * agentic-design-system, task 7.10.
 *
 * A stylesheet's custom properties, a JS/TS/JSON theme object, and a consumed library's token file
 * are all legitimate sources of a design system, and every one of them must produce the SAME
 * canonical artifact as a Figma read. That is the whole point of the canonical layer: downstream —
 * the emitters (7.5–7.7), the light manifest (7.11), the Inspector's projection (7.3) — nothing
 * should be able to tell which source it came from. If these paths produced a different shape, every
 * consumer would grow a second branch and the artifact would stop being canonical.
 *
 * What a code source CANNOT supply is a design tool's identity structure: there are no durable
 * variable keys and no collection registry, because the file never had them. Those fields are
 * OMITTED rather than faked — the contract's "absent ≠ empty" rule — so a reader sees "this source
 * has no keys", not "every key is the empty string". Modes are the one piece of that structure a
 * stylesheet genuinely does carry, as selector scopes, so they are ingested properly.
 *
 * PURE — no fs. The fs half lives in `main/inspector/token-ingest.ts`.
 */

// ── Type inference for a code-authored token ─────────────────────────

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix|light-dark)\(/i;
const NAMED_COLORS = new Set(["white", "black", "transparent", "currentcolor", "inherit"]);
/** A CSS length/percentage — the shapes DTCG calls a `dimension`. */
const DIMENSION = /^-?(?:\d*\.)?\d+(?:px|rem|em|ch|vh|vw|vmin|vmax|%)$/i;
/** A CSS time — the shapes DTCG calls a `duration`. */
const DURATION = /^-?(?:\d*\.)?\d+m?s$/i;
const NUMBER = /^-?(?:\d*\.)?\d+$/;
const CUBIC_BEZIER = /^cubic-bezier\(/i;

/**
 * Infer a DTCG `$type` for a token that was authored as code.
 *
 * Best-effort, and honest about it: a stylesheet declares no types at all, so the VALUE is the
 * primary signal and the NAME breaks the ties the value cannot. The distinctions that matter are the
 * ones an emitter switches on — `formatTokenLiteral` writes `ms` for a duration and `px` for a bare
 * dimension — so a wrong guess here changes the emitted unit, which is why the value is trusted over
 * the name wherever it is unambiguous. Where nothing is conclusive the type is left UNDEFINED rather
 * than guessed: an absent `$type` makes an emitter pass the literal through untouched, which is
 * exactly right for a value that came from code and needs no unit added.
 */
export function dtcgTypeForCodeToken(name: string, value: string): DtcgTypeName | undefined {
  const v = value.trim();
  const n = name.toLowerCase();
  if (HEX.test(v) || COLOR_FN.test(v) || NAMED_COLORS.has(v.toLowerCase())) return "color";
  if (DURATION.test(v)) return "duration";
  if (DIMENSION.test(v)) return "dimension";
  if (CUBIC_BEZIER.test(v)) return "cubicBezier";
  // A bare number's meaning is entirely in the name: `--font-weight-bold: 700` and
  // `--leading-none: 1` are a fontWeight and a number, and nothing about "700" says which.
  if (NUMBER.test(v)) {
    if (/font-?weight|weight/.test(n)) return "fontWeight";
    return "number";
  }
  // Multi-value literals a stylesheet writes as one string. Checked after the scalar shapes so a
  // plain `#fff` is never mistaken for a shadow.
  if (/(^|[-/])(shadow|elevation)([-/]|$)/.test(n)) return "shadow";
  if (/font-?family|typeface/.test(n)) return "fontFamily";
  if (/font-?weight/.test(n)) return "fontWeight";
  return undefined;
}

// ── CSS custom properties ────────────────────────────────────────────

export interface CssIngestOptions {
  /**
   * The collection name to record on every token. A stylesheet has no collection registry of its
   * own, so this is the caller's label for "where these came from" (e.g. the vendor package name for
   * a consumed library). Omitted ⇒ no `collection` field is written at all.
   */
  collection?: string;
  /** Override the mode name derived for a context key, e.g. `{".theme-brand": "Brand"}`. */
  modeNames?: Record<string, string>;
}

/**
 * A CSS context key → the mode name it represents.
 *
 * The default context is called `Default` rather than `:root` because the name lands in the
 * artifact's collection registry and in every mode switcher; a selector is an implementation detail
 * of the stylesheet, not a name a person picked. Dark and light are recognised by convention because
 * they are the modes that actually exist in practice; anything else keeps its selector, minus the
 * punctuation, since inventing a friendly name for `[data-brand="acme"]` would be a guess.
 */
export function modeNameForContext(context: string): string {
  if (context === DEFAULT_CONTEXT) return "Default";
  if (/prefers-color-scheme\s*:\s*dark/i.test(context)) return "Dark";
  if (/dark/i.test(context)) return "Dark";
  if (/light/i.test(context)) return "Light";
  const cleaned = context
    .replace(/^[.#]/, "")
    .replace(/[[\]"']/g, " ")
    .replace(/[=:]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned || context;
}

/**
 * Build the canonical artifact from a stylesheet's custom properties.
 *
 * Each `--name` becomes ONE token whose path is a single segment — the property name as written.
 * Splitting on hyphens to synthesise a group tree is tempting and wrong: `--color-primary` and
 * `--color-primary-hover` are both ordinary CSS, and under a hyphen split the second would be a
 * child of a node that is already a token, which DTCG forbids — so it would land in `dropped` and
 * silently vanish from the design system. CSS custom properties genuinely are a flat namespace, and
 * the artifact says so. Nothing downstream is worse off for it: every emitter names a token with
 * `cssVarName(path)`, which round-trips a single segment exactly, and the theme-object ingest below
 * DOES produce a tree, because there the nesting is real rather than inferred from punctuation.
 *
 * Selector scopes become modes. A `var(--other)` value becomes a DTCG alias when `--other` is a
 * token in this same stylesheet, and stays a literal when it is not — an unresolvable reference
 * recorded as an alias would be a dangling one, which `validateCanonicalTokens` reports as a defect.
 */
export function canonicalFromCssCustomProperties(
  css: string,
  meta: CanonicalBuildMeta = {},
  options: CssIngestOptions = {},
): CanonicalBuildResult {
  const parse = parseCssContexts(css);
  const known = new Set(parse.order);

  // Context → mode name, deduped: two different selectors CAN derive the same name (`.dark` and
  // `[data-theme="dark"]` in one file), and two modes sharing a name would silently overwrite each
  // other in the per-token modes map.
  const modeOf = new Map<string, string>();
  const used = new Set<string>();
  for (const context of parse.contexts) {
    const base = options.modeNames?.[context] ?? modeNameForContext(context);
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base} ${i}`;
    used.add(name);
    modeOf.set(context, name);
  }
  const modeNames = [...modeOf.values()];
  const defaultMode = modeOf.get(DEFAULT_CONTEXT) ?? modeNames[0];
  const multiMode = modeNames.length > 1;

  const root: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const name of parse.order) {
    const byCtx = parse.raw.get(name);
    if (!byCtx) continue;

    const modes: Record<string, TokenModeValue> = {};
    for (const [context, rawValue] of byCtx) {
      const mode = modeOf.get(context);
      if (!mode) continue;
      const reference = cssVarReference(rawValue);
      // A reference to a property this stylesheet does not declare cannot be an alias — see above.
      const alias = reference && known.has(reference) ? toDtcgAlias([reference]) : undefined;
      modes[mode] = { ...(alias ? { alias } : { value: rawValue.trim() }) };
    }

    // The default context's declaration when there is one; else the first — mirroring how
    // `parseTokensFromCss` picks a token's headline value, so both readers agree.
    const defaultContext = byCtx.has(DEFAULT_CONTEXT) ? DEFAULT_CONTEXT : [...byCtx.keys()][0];
    const defaultRaw = byCtx.get(defaultContext) ?? "";
    const defaultEntry = modes[modeOf.get(defaultContext) ?? ""];
    const $value: DtcgValue = defaultEntry?.alias ?? defaultRaw.trim();

    // Only carry the modes map when it says something `$value` cannot: several modes, or an alias.
    const hasAlias = Object.values(modes).some((entry) => entry.alias);
    const keepModes = Object.keys(modes).length > 1 || hasAlias;
    const payload = {
      ...(options.collection ? { collection: options.collection } : {}),
      ...(keepModes && defaultMode ? { defaultMode } : {}),
      ...(keepModes ? { modes } : {}),
    };

    // Type off the RESOLVED value, following `var()` references. An aliased token has no literal of
    // its own, and typing it from its name alone would leave `--color-primary: var(--color-blue-500)`
    // untyped — so the emitters would stop treating it as a colour even though the thing it points
    // at plainly is one.
    const $type = dtcgTypeForCodeToken(name, resolveInContext(defaultRaw, defaultContext, parse));
    const leaf: DesignTokenLeaf = {
      ...($type ? { $type } : {}),
      $value,
      ...(Object.keys(payload).length ? { $extensions: { [DTCG_EXTENSION_NS]: payload } } : {}),
    };
    // A property name is one segment, but it can still be unrepresentable — `--$x` is legal CSS and
    // reserved in DTCG — so the insert is checked like every other.
    if (!insertLeaf(root, [dtcgSegmentFromSourceName(name)], leaf)) dropped.push(name);
  }

  return {
    document: stampDocument(root, meta, [
      { name: options.collection ?? "Stylesheet", modes: modeNames, defaultMode },
    ], multiMode),
    dropped,
  };
}

// ── SCSS variables ───────────────────────────────────────────────────

/** `$name: value;` — SCSS's flat variable namespace, at any indentation, `!default` tolerated. */
const SCSS_DECL = /^\s*\$([\w-]+)\s*:\s*([^;]+?)\s*(?:!default\s*)?;/gm;

/**
 * Build the canonical artifact from an SCSS variable file.
 *
 * Flat like the CSS path and for the same reason. SCSS has no selector-scoped variables to read as
 * modes — a `$name` is file-scoped — so the result is single-mode, which the artifact expresses by
 * simply having no modes map at all rather than one mode named "Default".
 */
export function canonicalFromScssVariables(
  scss: string,
  meta: CanonicalBuildMeta = {},
  options: CssIngestOptions = {},
): CanonicalBuildResult {
  const src = scss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\w])\/\/[^\n]*/g, "$1");
  const declarations = new Map<string, string>();
  for (const m of src.matchAll(SCSS_DECL)) declarations.set(m[1], m[2].trim()); // last wins
  const known = new Set(declarations.keys());

  const root: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [name, rawValue] of declarations) {
    const reference = rawValue.startsWith("$") ? rawValue.slice(1).trim() : undefined;
    const alias = reference && known.has(reference) ? toDtcgAlias([reference]) : undefined;
    // Typed off the resolved value, for the same reason the CSS path is: an aliased variable has no
    // literal of its own, and the target's does describe it.
    const $type = dtcgTypeForCodeToken(name, resolveScssValue(rawValue, declarations));
    const payload = options.collection ? { collection: options.collection } : {};
    const leaf: DesignTokenLeaf = {
      ...($type ? { $type } : {}),
      $value: alias ?? rawValue,
      ...(Object.keys(payload).length ? { $extensions: { [DTCG_EXTENSION_NS]: payload } } : {}),
    };
    if (!insertLeaf(root, [dtcgSegmentFromSourceName(name)], leaf)) dropped.push(name);
  }
  return { document: stampDocument(root, meta, [], false), dropped };
}

/** Follow a `$other` reference chain to its literal, bounded against a cycle. */
function resolveScssValue(value: string, declarations: Map<string, string>, depth = 0): string {
  if (depth > 10 || !value.startsWith("$")) return value;
  const target = declarations.get(value.slice(1).trim());
  return target === undefined ? value : resolveScssValue(target, declarations, depth + 1);
}

// ── Theme objects (JS / TS / JSON) ───────────────────────────────────

/**
 * The key a nested theme object uses for "the value of the group itself" — Tailwind's convention,
 * and shadcn's. `colors.primary.DEFAULT` is the token `colors.primary`.
 */
const GROUP_DEFAULT_KEYS = new Set(["DEFAULT", "default"]);

/**
 * Whether a group's `DEFAULT` may collapse onto the group's own path.
 *
 * Only when it is the group's ONLY key. `{ primary: { DEFAULT: "#1d4ed8", hover: "#1e40af" } }` is
 * ordinary Tailwind and has no DTCG representation that keeps both: collapsing makes `color.primary`
 * a token, and `color.primary.hover` is then a child of a token, which the format forbids — so the
 * sibling would be DROPPED. Keeping `DEFAULT` as a child costs a name (`color-primary-default`
 * instead of `color-primary`) and keeps every token; collapsing costs tokens. Losing a name that a
 * reader can still see in the artifact beats losing a token that no reader ever hears about again.
 */
function canCollapseDefault(group: Record<string, unknown>): boolean {
  return Object.keys(group).length === 1;
}

/**
 * Build the canonical artifact from a nested theme object — a `theme.ts` export, a JSON token file,
 * or the plain object a JS config holds.
 *
 * UNLIKE the stylesheet paths this preserves the tree, because here the nesting is a real authoring
 * decision rather than an inference from hyphens: `{ color: { blue: { 500: "#1d4ed8" } } }` says
 * three levels, so the artifact has three levels. A leaf is any non-object; the DTCG-ish wrappers
 * real token files use (`{ value: … }`, `{ $value: … }`) are unwrapped, keeping their `$type` and
 * `$description` when they carry one, so a JSON file that is ALREADY close to DTCG round-trips
 * rather than being re-nested under a spurious `value` group.
 */
export function canonicalFromThemeObject(
  value: unknown,
  meta: CanonicalBuildMeta = {},
  options: CssIngestOptions = {},
): CanonicalBuildResult {
  const root: Record<string, unknown> = {};
  const dropped: string[] = [];
  if (!isPlainObject(value)) return { document: stampDocument(root, meta, [], false), dropped };

  const walk = (node: Record<string, unknown>, path: string[]): void => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$") && path.length === 0) continue; // document meta, not a token group
      const segment = dtcgSegmentFromSourceName(key);
      const collapses = GROUP_DEFAULT_KEYS.has(key) && canCollapseDefault(node);
      const here = collapses ? path : [...path, segment];
      const leafValue = unwrapLeaf(child);
      if (leafValue) {
        if (!here.length || !insertLeaf(root, here, buildThemeLeaf(here, leafValue, options)))
          dropped.push([...path, key].join("."));
        continue;
      }
      if (isPlainObject(child)) walk(child, here);
      // Anything else (a function, undefined) is not a token and not a group — nothing to record.
    }
  };
  walk(value, []);
  return { document: stampDocument(root, meta, [], false), dropped };
}

interface UnwrappedLeaf {
  value: DtcgValue;
  $type?: DtcgTypeName;
  $description?: string;
}

/**
 * A theme-object node → the token it holds, or null when it is a group.
 *
 * The `{ value: … }` / `{ $value: … }` wrappers are recognised because token files in the wild use
 * both, and reading one as a group would produce a token literally named `…​.value`.
 */
function unwrapLeaf(node: unknown): UnwrappedLeaf | null {
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean")
    return { value: node };
  if (Array.isArray(node)) return { value: node as DtcgValue };
  if (!isPlainObject(node)) return null;
  const raw = node as Record<string, unknown>;
  const wrapper = "$value" in raw ? "$value" : "value" in raw ? "value" : null;
  if (!wrapper) return null;
  const type = raw.$type ?? raw.type;
  const description = raw.$description ?? raw.description;
  return {
    value: raw[wrapper] as DtcgValue,
    ...(typeof type === "string" ? { $type: type as DtcgTypeName } : {}),
    ...(typeof description === "string" ? { $description: description } : {}),
  };
}

function buildThemeLeaf(
  path: string[],
  leaf: UnwrappedLeaf,
  options: CssIngestOptions,
): DesignTokenLeaf {
  // A `var(--x)` value is how a theme object references a stylesheet's token (the Tailwind v3
  // pattern this repo's own emitter writes). It is left VERBATIM rather than turned into an alias:
  // the target lives in a different file that this artifact does not contain, so an alias would
  // dangle. The reference still works — it is a literal CSS value that resolves at runtime.
  const alias = typeof leaf.value === "string" ? parseThemeAlias(leaf.value) : undefined;
  const $type =
    leaf.$type ??
    (typeof leaf.value === "string" || typeof leaf.value === "number"
      ? dtcgTypeForCodeToken(path.join("-"), alias ? "" : String(leaf.value))
      : undefined);
  const payload = options.collection ? { collection: options.collection } : {};
  return {
    ...($type ? { $type } : {}),
    $value: alias ?? leaf.value,
    ...(leaf.$description ? { $description: leaf.$description } : {}),
    ...(Object.keys(payload).length ? { $extensions: { [DTCG_EXTENSION_NS]: payload } } : {}),
  };
}

/** A `{group.token}` reference already written in DTCG's own alias syntax, kept as an alias. */
function parseThemeAlias(value: string): string | undefined {
  return /^\{[^{}]+\}$/.test(value.trim()) ? value.trim() : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ── Shared document stamping ─────────────────────────────────────────

/**
 * Stamp the document-level provenance block onto a built tree.
 *
 * The collection registry is written only when there is genuinely more than one mode. A code source
 * with a single mode has no registry to report, and emitting `[{name: "Stylesheet", modes:
 * ["Default"]}]` would invent a collection the file never had — a reader enumerating collections
 * would show it in a mode switcher with exactly one entry.
 */
function stampDocument(
  root: Record<string, unknown>,
  meta: CanonicalBuildMeta,
  collections: TokenCollection[],
  multiMode: boolean,
): DesignTokenDocument {
  const document = root as DesignTokenDocument;
  document.$extensions = {
    [DTCG_EXTENSION_NS]: {
      ...(meta.source ? { source: meta.source } : {}),
      ...(meta.generatedAt ? { generatedAt: meta.generatedAt } : {}),
      collections: multiMode ? collections : [],
    },
  };
  return document;
}

// ── IPC-visible ingest result (task 7.14) ────────────────────────────

/** Which reader produced the artifact — reported so a caller can say where the tokens came from. */
export const tokenIngestFormatSchema = z.enum(["css", "scss", "ts", "json", "dtcg"]);
export type TokenIngestFormat = z.infer<typeof tokenIngestFormatSchema>;

/**
 * What `ingestTokensFromProject` returns. In zod, and here rather than in `main/`, because the
 * ingest is reachable over IPC and every channel response is validated — same reasoning as
 * `tokenEmitResultSchema`.
 */
export const tokenIngestResultSchema = z.object({
  ok: z.boolean(),
  /** Project-relative token file read, or null when the project configures none. */
  tokenFile: z.string().nullable(),
  format: tokenIngestFormatSchema.nullable(),
  /** Tokens that landed in the canonical artifact. */
  count: z.number(),
  /** Names that could not be represented as DTCG — reported, never silently dropped. */
  dropped: z.array(z.string()).default([]),
  /** Every project-relative file actually read (a CSS entry plus its `@import` chain). */
  files: z.array(z.string()).default([]),
  /** True when the source is CONSUMED: a projection of someone else's design system. */
  readOnly: z.boolean(),
  message: z.string(),
  /** What the emit that followed the read did. Absent when there was nothing to emit from. */
  emit: tokenEmitSummarySchema.optional(),
});
export type TokenIngestResult = z.infer<typeof tokenIngestResultSchema>;
