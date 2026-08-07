import {
  isTokenLeaf,
  parseDtcgAlias,
  tokenValueForMode,
  type DesignTokenDocument,
  type DesignTokenLeaf,
  type DesignTokenNode,
  type DtcgTypeName,
  type DtcgValue,
} from "./design-tokens";

/**
 * Whole-file token emitters over the canonical artifact — OpenSpec change: agentic-design-system,
 * tasks 7.5–7.7.
 *
 * The pipeline `canonical-tokens.ts` opened ends here:
 *
 *   design source ──build──▶ canonical DTCG ──emit──▶ the project's own token file
 *
 * One scan of the design source, many emits: switching a project from CSS variables to Tailwind
 * re-runs an emitter over `.vortspec/tokens.json` and never touches Figma again.
 *
 * These are NOT the per-value writers in `token-writers.ts` — those patch ONE token inside a file a
 * human owns (the token editor's write path) and must leave everything around it alone. These
 * generate the WHOLE file from canonical. Both survive because they answer different questions:
 * "the designer changed this one value" vs "re-derive the token file from the design source".
 *
 * PURE — no fs, no process, no clock. That last one is load-bearing, not incidental: the spec
 * requires re-emission with no canonical change to be byte-identical, so nothing here may stamp a
 * timestamp into its output. The fs write belongs to the caller in `main/`.
 */

// ── Flattening: canonical tree → the rows an emitter writes ──────────

/**
 * One token, as an emitter sees it. `value` is what the token SAYS (an alias string when it is a
 * reference) and `resolved` is what it MEANS (the alias followed to a literal) — both, because the
 * targets disagree about which they want: CSS and SCSS keep the reference so the emitted file has
 * the same alias graph the designer authored, while a TS theme object has no way to express one and
 * takes the literal.
 */
export interface FlatCanonicalToken {
  /** The group path, e.g. `["primitive", "color", "primary"]`. */
  path: string[];
  /** The variable name the CSS/SCSS emitters use, without a sigil: `primitive-color-primary`. */
  name: string;
  /** The nearest declared `$type`, inherited from an ancestor group when the leaf declares none. */
  type?: DtcgTypeName;
  /** The token's own `$value` for the requested mode — an alias string when it is a reference. */
  value: DtcgValue;
  /** The alias target's path, when `value` is a reference. */
  aliasOf?: string[];
  /** `value` with aliases followed through the document; equal to `value` when it is a literal. */
  resolved: DtcgValue;
  $description?: string;
}

export interface FlattenOptions {
  /**
   * Which mode to read. Omitted → each token's `$value`, which the artifact guarantees mirrors its
   * collection's default mode.
   */
  mode?: string;
}

/**
 * Flatten the canonical artifact into emitter rows — the read-time flattening the spec asks for
 * ("flattening SHALL happen on read, at the point of use").
 *
 * Distinct from `projectCanonicalToVariables`, which produces the design-source-shaped
 * `FigmaVariable` rows the Inspector and the reconciler speak. This produces EMITTER rows: a
 * file-safe name, the alias target as a path, and the literal behind it. Sharing one row type would
 * force each side to carry the other's concerns.
 */
export function flattenCanonicalTokens(
  doc: DesignTokenDocument,
  options: FlattenOptions = {},
): FlatCanonicalToken[] {
  const leaves = indexLeaves(doc);
  const out: FlatCanonicalToken[] = [];
  for (const [key, { leaf, path, type }] of leaves) {
    const value = options.mode ? (tokenValueForMode(leaf, options.mode) ?? leaf.$value) : leaf.$value;
    const aliasOf = parseDtcgAlias(value) ?? undefined;
    out.push({
      path,
      name: cssVarName(path),
      type,
      value,
      ...(aliasOf ? { aliasOf } : {}),
      resolved: resolveAlias(value, leaves, key, options.mode),
      ...(leaf.$description ? { $description: leaf.$description } : {}),
    });
  }
  return out;
}

interface IndexedLeaf {
  leaf: DesignTokenLeaf;
  path: string[];
  type?: DtcgTypeName;
}

/** Index every token by its dot path, in document order, carrying the inherited `$type` down. */
function indexLeaves(doc: DesignTokenDocument): Map<string, IndexedLeaf> {
  const out = new Map<string, IndexedLeaf>();
  const walk = (node: unknown, path: string[], inherited: DtcgTypeName | undefined): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    const type = typeof obj.$type === "string" ? (obj.$type as DtcgTypeName) : inherited;
    if (isTokenLeaf(node as DesignTokenNode) && path.length) {
      out.set(path.join("."), { leaf: node as DesignTokenLeaf, path, type });
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith("$")) continue;
      walk(child, [...path, key], type);
    }
  };
  walk(doc, [], undefined);
  return out;
}

/**
 * Follow an alias chain to the literal behind it.
 *
 * A cycle (`a → b → a`) and a dangling target both stop the walk and return the last value seen
 * rather than throwing: emission is not the place that adjudicates a broken artifact —
 * `validateCanonicalTokens` reports both as violations — and refusing to emit any token because one
 * is broken would be the silent-total-loss failure this pipeline exists to remove.
 */
function resolveAlias(
  value: DtcgValue,
  leaves: Map<string, IndexedLeaf>,
  from: string,
  mode: string | undefined,
): DtcgValue {
  const seen = new Set<string>([from]);
  let current = value;
  for (;;) {
    const target = parseDtcgAlias(current);
    if (!target) return current;
    const key = target.join(".");
    if (seen.has(key)) return current;
    seen.add(key);
    const next = leaves.get(key);
    if (!next) return current;
    current = mode ? (tokenValueForMode(next.leaf, mode) ?? next.leaf.$value) : next.leaf.$value;
  }
}

/**
 * A group path → a CSS custom property name (no `--`). Segments are kebab-cased and joined, so
 * `["Primitive","Color","primary500"]` → `primitive-color-primary-500`.
 *
 * Two source paths CAN kebab to the same name (`color/Primary` and `color/primary`). They are not
 * de-duplicated here: the last one wins in every target's own cascade, which is exactly what the
 * emitted file would do anyway, and inventing a disambiguating suffix would put a name in the
 * project's code that exists in neither the design source nor the artifact.
 */
export function cssVarName(path: readonly string[]): string {
  return path.map(kebab).filter(Boolean).join("-");
}

function kebab(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

// ── Value formatting ─────────────────────────────────────────────────

/**
 * A DTCG `$value` → the literal a stylesheet can hold.
 *
 * The unit rules are where the `$type` earns its keep: DTCG carries a bare number for a dimension
 * and for a duration alike, and `4` is a broken CSS length while `4px` is not. `dtcgTypeForVariable`
 * on the ingest side is what makes the type reliable enough to switch on here.
 */
export function formatTokenLiteral(value: DtcgValue, type: DtcgTypeName | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return formatNumber(value, type);
  if (Array.isArray(value)) {
    if (type === "cubicBezier" && value.length === 4)
      return `cubic-bezier(${value.map((n) => String(n)).join(", ")})`;
    if (type === "shadow") return value.map((v) => formatTokenLiteral(v, "shadow")).join(", ");
    if (type === "fontFamily") return value.map((v) => quoteFamily(String(v))).join(", ");
    return value.map((v) => formatTokenLiteral(v, type)).join(", ");
  }
  const obj = value as Record<string, DtcgValue>;
  // DTCG's own dimension object: `{ "value": 16, "unit": "px" }`.
  if ("unit" in obj && "value" in obj) return `${String(obj.value)}${String(obj.unit)}`;
  if (type === "shadow") return formatShadow(obj);
  if (type === "typography") return formatTypography(obj);
  return JSON.stringify(value);
}

function formatNumber(n: number, type: DtcgTypeName | undefined): string {
  if (type === "duration") return `${n}ms`;
  if (type === "dimension") return n === 0 ? "0" : `${n}px`;
  return String(n);
}

/** Quote a family name that carries whitespace, as CSS requires. */
function quoteFamily(family: string): string {
  return /[\s]/.test(family) && !/^["']/.test(family) ? `"${family}"` : family;
}

/** A DTCG shadow object → the CSS `box-shadow` longhand. */
function formatShadow(shadow: Record<string, DtcgValue>): string {
  const part = (key: string): string | undefined => {
    const v = shadow[key];
    return v == null ? undefined : formatTokenLiteral(v, "dimension");
  };
  const parts = [
    shadow.inset === true ? "inset" : undefined,
    part("offsetX") ?? "0",
    part("offsetY") ?? "0",
    part("blur") ?? "0",
    part("spread"),
    shadow.color == null ? undefined : formatTokenLiteral(shadow.color, "color"),
  ];
  return parts.filter((p): p is string => !!p).join(" ");
}

/** A DTCG typography composite → the CSS `font` shorthand. */
function formatTypography(typography: Record<string, DtcgValue>): string {
  const weight = typography.fontWeight == null ? "" : `${formatTokenLiteral(typography.fontWeight, "fontWeight")} `;
  const size = formatTokenLiteral(typography.fontSize ?? 0, "dimension");
  const leading = typography.lineHeight == null ? "" : `/${formatTokenLiteral(typography.lineHeight, "number")}`;
  const family = typography.fontFamily == null ? "" : ` ${formatTokenLiteral(typography.fontFamily, "fontFamily")}`;
  return `${weight}${size}${leading}${family}`.trim();
}

/** The value an emitter writes: the reference when the token aliases, else the literal. */
function referenceOrLiteral(token: FlatCanonicalToken, reference: (name: string) => string): string {
  if (token.aliasOf) return reference(cssVarName(token.aliasOf));
  return formatTokenLiteral(token.value, token.type);
}

// ── The emitters ─────────────────────────────────────────────────────

/** The output shapes an emitter can produce. One per file a project can actually consume. */
export type TokenEmitFormat = "css" | "scss" | "tailwind-v3" | "tailwind-v4" | "ts";

export interface EmitOptions extends FlattenOptions {
  /** CSS/SCSS: the selector the custom properties are declared on. */
  rootSelector?: string;
  /** Tailwind v3: the `content` globs written into the config. */
  content?: string[];
  /** The TS emitter's exported binding name. */
  exportName?: string;
}

const HEADER = "VortSpec design tokens — generated from .vortspec/tokens.json. Do not edit by hand.";

/** Emit the whole token file in one format. Pure: same document in, same bytes out. */
export function emitTokens(
  format: TokenEmitFormat,
  doc: DesignTokenDocument,
  options: EmitOptions = {},
): string {
  const tokens = flattenCanonicalTokens(doc, options);
  switch (format) {
    case "css":
      return emitCssVars(tokens, options);
    case "scss":
      return emitScssVars(tokens);
    case "tailwind-v3":
      return emitTailwindV3Config(tokens, options);
    case "tailwind-v4":
      return emitTailwindV4Theme(tokens, options);
    case "ts":
      return emitTsTheme(tokens, options);
  }
}

/** CSS custom properties on one selector. Aliases stay `var(--target)`, as the designer authored. */
export function emitCssVars(tokens: FlatCanonicalToken[], options: EmitOptions = {}): string {
  const selector = options.rootSelector ?? ":root";
  return `/* ${HEADER} */\n${selector} {\n${cssDeclarations(tokens).join("\n")}\n}\n`;
}

/**
 * The `--name: value;` lines of the raw token layer, with every DECLARED name and every alias
 * TARGET passed through `rename`.
 *
 * The rename hook exists for the Tailwind v4 emitter, which has to move a token out of the way when
 * its name collides with a `@theme` name. Renaming only the declaration would leave every alias
 * pointing at a property that no longer exists, so the two must happen in one pass — which is why
 * this is one function and not a `.map()` at each call site.
 */
function cssDeclarations(
  tokens: FlatCanonicalToken[],
  rename: (name: string) => string = (name) => name,
): string[] {
  return tokens.map(
    (t) => `  --${rename(t.name)}: ${referenceOrLiteral(t, (n) => `var(--${rename(n)})`)};`,
  );
}

/** SCSS variables. Aliases become `$target`, which is SCSS's own reference. */
export function emitScssVars(tokens: FlatCanonicalToken[]): string {
  const decls = tokens.map((t) => `$${t.name}: ${referenceOrLiteral(t, (n) => `$${n}`)};`);
  return `// ${HEADER}\n${decls.join("\n")}\n`;
}

/**
 * A TS theme object mirroring the token tree.
 *
 * The one emitter that takes `resolved` rather than the alias: a plain object literal cannot
 * reference a sibling it is still being built from, so a `{a.b}` alias would have to become a
 * `theme.a.b` expression the object cannot yet evaluate. The literal behind the alias is the same
 * value, and the alias graph itself is not lost — it lives in the canonical artifact, which is the
 * artifact that answers "what references what".
 */
export function emitTsTheme(tokens: FlatCanonicalToken[], options: EmitOptions = {}): string {
  const name = options.exportName ?? "tokens";
  const tree: NestedTree = {};
  for (const token of tokens) insertNested(tree, token.path, formatTokenLiteral(token.resolved, token.type));
  const body = renderTree(tree, 1);
  return `// ${HEADER}\nexport const ${name} = ${body} as const;\n\nexport type ${pascal(name)} = typeof ${name};\n`;
}

type NestedTree = { [key: string]: NestedTree | string };

function insertNested(tree: NestedTree, path: string[], value: string): void {
  let cursor = tree;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (typeof next !== "object" || next === null) cursor[segment] = {};
    cursor = cursor[segment] as NestedTree;
  }
  cursor[path[path.length - 1]] = value;
}

function renderTree(tree: NestedTree, depth: number): string {
  const pad = "  ".repeat(depth);
  const entries = Object.entries(tree).map(([key, value]) => {
    const rendered = typeof value === "string" ? JSON.stringify(value) : renderTree(value, depth + 1);
    return `${pad}${tsKey(key)}: ${rendered},`;
  });
  return entries.length ? `{\n${entries.join("\n")}\n${"  ".repeat(depth - 1)}}` : "{}";
}

/** A bare identifier where the key is one, a quoted string otherwise (`"0.5"`, `"brand-primary"`). */
function tsKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function pascal(name: string): string {
  return name.replace(/(^|[^A-Za-z0-9])([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

// ── Tailwind: the curated semantic mapping (task 7.6) ────────────────

/**
 * The `theme.extend` shape both Tailwind emitters render — idiomatic scale names mapped to tokens.
 *
 * The curation is the whole point (spec: "an emitter SHALL NOT emit a raw per-token
 * arbitrary-value mapping as its primary output"). A raw dump — one Tailwind key per token — reads
 * back as `bg-[var(--brand-primary-100)]` in component code and, worse, leaves the STANDARD
 * utilities (`p-4`, `rounded`, `shadow-md`, `border`) resolving to Tailwind's own hardcoded
 * defaults. Every one of those is then a value the design system does not own, in code that looks
 * perfectly idiomatic — the single largest source of component infidelity, which is why the
 * `extract-design-system` skill calls this out at Step 2A.
 */
export interface TailwindThemeExtension {
  colors?: Record<string, string | Record<string, string>>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
  boxShadow?: Record<string, string>;
  borderWidth?: Record<string, string>;
  fontFamily?: Record<string, string>;
  fontSize?: Record<string, string>;
  fontWeight?: Record<string, string>;
  lineHeight?: Record<string, string>;
  letterSpacing?: Record<string, string>;
  opacity?: Record<string, string>;
  zIndex?: Record<string, string>;
  transitionDuration?: Record<string, string>;
}

/** Which Tailwind scale a token belongs on. `null` = no scale claims it. */
type TailwindScale = Exclude<keyof TailwindThemeExtension, "colors">;

/**
 * Semantic color families that mean the same thing under more than one name. Normalising them is
 * what makes `bg-danger` work on a system that spells it `error` — the alternative is component
 * code that has to know which synonym this particular design system chose.
 */
const COLOR_FAMILY_ALIASES: Record<string, string> = {
  error: "danger",
  destructive: "danger",
  negative: "danger",
  positive: "success",
  fg: "foreground",
  bg: "background",
  surface: "background",
  brand: "primary",
};

/**
 * Path segments that describe where a color lives in the FILE rather than what it MEANS, and so
 * carry no information a utility name should keep. They are stripped from the front of a color's
 * path — `primitive/color/blue/500` is the `blue` ramp, not the `primitive-color-blue` one.
 *
 * Leading only, and never the last meaningful segment: a system that genuinely calls a family
 * `theme` keeps it.
 */
const COLOR_PATH_PREFIXES = new Set([
  "primitive",
  "primitives",
  "semantic",
  "theme",
  "themes",
  "token",
  "tokens",
  "color",
  "colors",
  "colour",
  "colours",
  "palette",
  "global",
  "core",
  "ref",
  "sys",
]);

/** Ladder names a token can claim by NAME, before any value-based assignment. */
const LADDER_HINTS = new Set(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "full", "base", "default"]);

/**
 * The scales whose Tailwind key `DEFAULT` is a real utility (`rounded`, `shadow`, `border`), and so
 * the only ones where a token named `base`/`default` should become `DEFAULT`.
 *
 * Elsewhere it must not: `fontFamily.DEFAULT` would generate a `font` class that collides with
 * Tailwind's own `font-*` shorthand, and the token is far more useful under the name the design
 * system gave it.
 */
const DEFAULT_KEY_SCALES = new Set<TailwindScale>(["borderRadius", "boxShadow", "borderWidth"]);

/** Tailwind's own `borderRadius` scale, in px — a project radius snaps to the nearest of these. */
const RADIUS_BUCKETS: Array<[string, number]> = [
  ["none", 0],
  ["sm", 2],
  ["DEFAULT", 4],
  ["md", 6],
  ["lg", 8],
  ["xl", 12],
  ["2xl", 16],
  ["3xl", 24],
  ["full", 9999],
];

/** Ascending ladder for the composite scales, where there is no number to snap. */
const SHADOW_LADDER = ["sm", "DEFAULT", "md", "lg", "xl", "2xl"];

/**
 * Build the curated `theme.extend` from the canonical artifact.
 *
 * Every emitted value is a `var(--token)` reference rather than a literal, so the Tailwind config
 * and the CSS custom property file stay one source of truth: re-emitting the CSS moves every
 * utility with it, and a mode switch that swaps the custom properties needs no Tailwind rebuild.
 */
export function curateTailwindTheme(tokens: FlatCanonicalToken[]): TailwindThemeExtension {
  const colors: Record<string, string | Record<string, string>> = {};
  const colorClaims = new Map<string, ColorClaim>();
  const scales = new Map<TailwindScale, Record<string, string>>();
  const claimed = new Map<TailwindScale, Set<string>>();
  // The px behind each claimed key, for the backfills that must pick a token by its VALUE
  // (`border` means 1px, so the DEFAULT border width is whichever token sits nearest it).
  const pixels = new Map<TailwindScale, Map<string, number>>();
  const pending = new Map<TailwindScale, FlatCanonicalToken[]>();

  for (const token of tokens) {
    if (isColor(token)) {
      addColor(colors, colorClaims, token);
      continue;
    }
    const scale = scaleFor(token);
    if (!scale) continue;
    const hint = ladderHint(scale, token);
    if (hint) {
      claim(scales, claimed, pixels, scale, hint, token);
      continue;
    }
    const key = numericKey(scale, token);
    if (key) {
      claim(scales, claimed, pixels, scale, key, token);
      continue;
    }
    // No name hint and no number to key on (a composite shadow, say) — it takes a ladder slot in
    // ascending order once every token that CAN name itself has had its pick.
    (pending.get(scale) ?? pending.set(scale, []).get(scale)!).push(token);
  }

  for (const [scale, list] of pending) {
    const ladder = SHADOW_LADDER;
    let cursor = 0;
    for (const token of list.sort((a, b) => weightOf(a) - weightOf(b))) {
      while (cursor < ladder.length && claimed.get(scale)?.has(ladder[cursor])) cursor += 1;
      const key = cursor < ladder.length ? ladder[cursor] : lastSegment(token);
      claim(scales, claimed, pixels, scale, key, token);
      cursor += 1;
    }
  }

  const out: TailwindThemeExtension = {};
  if (Object.keys(colors).length) out.colors = collapseSingletons(colors);
  for (const [scale, bag] of scales) {
    // `rounded`, `shadow` and `border` — the DEFAULT key — and `rounded-md`/`shadow-md` are the
    // utilities component code reaches for first. A design system that names neither still gets
    // both, aliased onto its own nearest token — otherwise those utilities fall back to Tailwind's
    // defaults (4px, its own shadow, 1px), which is precisely the infidelity this curation exists
    // to prevent.
    if (scale === "borderRadius" || scale === "boxShadow") backfillDefaults(bag);
    if (scale === "borderWidth") backfillBorderWidth(bag, pixels.get(scale));
    if (scale === "fontFamily") backfillSans(bag);
    out[scale] = sortKeys(bag);
  }
  return out;
}

function claim(
  scales: Map<TailwindScale, Record<string, string>>,
  claimed: Map<TailwindScale, Set<string>>,
  pixels: Map<TailwindScale, Map<string, number>>,
  scale: TailwindScale,
  key: string,
  token: FlatCanonicalToken,
): void {
  const bag = scales.get(scale) ?? scales.set(scale, {}).get(scale)!;
  const taken = claimed.get(scale) ?? claimed.set(scale, new Set()).get(scale)!;
  // First claim wins: document order puts the design system's own primitives first, and a later
  // token overwriting `spacing.4` would silently move every `p-4` in the codebase.
  if (taken.has(key)) return;
  taken.add(key);
  bag[key] = `var(--${token.name})`;
  const px = pixelValue(token);
  if (px !== null) (pixels.get(scale) ?? pixels.set(scale, new Map()).get(scale)!).set(key, px);
}

/** Fill `DEFAULT` and `md` from each other, or from the first entry, so both utilities resolve. */
function backfillDefaults(bag: Record<string, string>): void {
  const entries = Object.entries(bag);
  if (!entries.length) return;
  if (!bag.DEFAULT) bag.DEFAULT = bag.md ?? entries.find(([key]) => key !== "none")?.[1] ?? entries[0][1];
  if (!bag.md) bag.md = bag.DEFAULT;
}

/**
 * Give `border` — `borderWidth`'s DEFAULT key — the project's own hairline.
 *
 * Tailwind hardcodes `border` to 1px, and a design system that ships `stroke/width/{1,2,4}` without
 * ever naming one `default` would keep that 1px: the single most-written border utility in a
 * codebase, resolving to a value the design system never said. The token NEAREST 1px is the honest
 * stand-in, since 1px is what the utility already meant; with no measurable width to compare, the
 * first non-`none` entry stands in instead — a zero-width default would erase every `border`.
 */
function backfillBorderWidth(bag: Record<string, string>, pixels?: Map<string, number>): void {
  if (bag.DEFAULT) return;
  const keys = Object.keys(bag).filter((key) => key !== "none");
  if (!keys.length) return;
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const px = pixels?.get(key);
    if (px === undefined) continue;
    const distance = Math.abs(px - 1);
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  bag.DEFAULT = bag[best ?? keys[0]];
}

/**
 * Point `sans` at the system's own body family when it names one — `font-sans` is the utility
 * Tailwind's own preflight and most scaffolds already apply, so leaving it on Tailwind's default
 * stack is the typographic version of `rounded` falling back to 4px.
 */
function backfillSans(bag: Record<string, string>): void {
  if (bag.sans) return;
  const body = bag.base ?? bag.body ?? bag.DEFAULT ?? Object.values(bag)[0];
  if (body) bag.sans = body;
}

function isColor(token: FlatCanonicalToken): boolean {
  return token.type === "color" || token.type === "gradient";
}

/**
 * Which scale a non-color token belongs on.
 *
 * `$type` decides where it can (a shadow is a `boxShadow`, full stop). For `dimension` and `number`
 * — where Figma's FLOAT collapses spacing, radius, border width and line height into one type — the
 * NAME is the only remaining signal, so the name hints below are ordered most-specific first.
 */
function scaleFor(token: FlatCanonicalToken): TailwindScale | null {
  switch (token.type) {
    case "shadow":
      return "boxShadow";
    case "fontFamily":
      return "fontFamily";
    case "fontWeight":
      return "fontWeight";
    case "duration":
      return "transitionDuration";
    default:
      break;
  }
  const name = token.path.join("/");
  if (/radius|corner|rounded/i.test(name)) return "borderRadius";
  if (/(border|stroke)[-_/ ]?width|width[-_/ ]?(border|stroke)/i.test(name)) return "borderWidth";
  if (/font[-_/ ]?weight/i.test(name)) return "fontWeight";
  if (/font[-_/ ]?famil|typeface/i.test(name)) return "fontFamily";
  if (/font[-_/ ]?size|text[-_/ ]?size/i.test(name)) return "fontSize";
  if (/line[-_/ ]?height|leading/i.test(name)) return "lineHeight";
  if (/letter[-_/ ]?spacing|tracking/i.test(name)) return "letterSpacing";
  if (/shadow|elevation/i.test(name)) return "boxShadow";
  if (/opacity|alpha/i.test(name)) return "opacity";
  if (/z[-_/ ]?index|layer/i.test(name)) return "zIndex";
  if (/spacing|space|gap|padding|margin|inset/i.test(name)) return "spacing";
  if (/duration|transition|delay/i.test(name)) return "transitionDuration";
  // A dimension nothing claims is deliberately left off every scale: putting an icon size on
  // `spacing` would make `p-<n>` mean something the design system never said.
  return null;
}

function lastSegment(token: FlatCanonicalToken): string {
  return kebab(token.path[token.path.length - 1] ?? "");
}

/** A ladder name the token spells for itself (`radius/md`, `shadow/lg`), normalised to Tailwind's. */
function ladderHint(scale: TailwindScale, token: FlatCanonicalToken): string | null {
  const last = lastSegment(token);
  if (!LADDER_HINTS.has(last)) return null;
  if (last !== "base" && last !== "default") return last;
  return DEFAULT_KEY_SCALES.has(scale) ? "DEFAULT" : last;
}

/**
 * The scale key a token's own NUMBER earns it.
 *
 * `spacing` is the one that matters most: Tailwind's spacing step is 4px, so a 16px token is step
 * `4` and `p-4` then means the design system's 16px — the exact claim the spec's "standard utilities
 * SHALL resolve to project tokens" scenario makes.
 */
function numericKey(scale: TailwindScale, token: FlatCanonicalToken): string | null {
  const px = pixelValue(token);
  if (px === null) return scale === "borderRadius" ? null : lastSegment(token) || null;
  switch (scale) {
    case "spacing":
      return spacingStep(px);
    case "borderRadius":
      return nearestBucket(px);
    default:
      return lastSegment(token) || null;
  }
}

/** 16 → "4", 2 → "0.5", 1 → "px", 0 → "0"; a step off the 4px grid keeps its own px key. */
function spacingStep(px: number): string {
  if (px === 0) return "0";
  if (px === 1) return "px";
  const step = px / 4;
  if (Number.isInteger(step)) return String(step);
  if (Number.isInteger(step * 2)) return step.toFixed(1);
  return `${px}px`;
}

/** Snap a radius to the nearest Tailwind `borderRadius` name. */
function nearestBucket(px: number): string {
  let best = RADIUS_BUCKETS[0];
  for (const bucket of RADIUS_BUCKETS)
    if (Math.abs(bucket[1] - px) < Math.abs(best[1] - px)) best = bucket;
  return best[0];
}

/** The token's value in px, when it has one. Aliases are followed, so a semantic token still keys. */
function pixelValue(token: FlatCanonicalToken): number | null {
  const value = token.resolved;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(value.trim());
    if (m) return Number(m[1]);
    const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(value.trim());
    if (rem) return Number(rem[1]) * 16;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value)
    return Number((value as Record<string, DtcgValue>).value);
  return null;
}

/** How "big" a composite is, for ladder ordering: a shadow's blur, else 0. */
function weightOf(token: FlatCanonicalToken): number {
  const value = token.resolved;
  const first = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const blur = (first as Record<string, DtcgValue>).blur;
    if (typeof blur === "number") return blur;
    if (typeof blur === "string") return Number.parseFloat(blur) || 0;
  }
  if (typeof value === "string") {
    // "0 1px 3px rgba(…)" — the third length is the blur.
    const lengths = value.match(/-?\d+(?:\.\d+)?px/g);
    if (lengths?.[2]) return Number.parseFloat(lengths[2]);
  }
  return 0;
}

/** Who currently holds a `family.step` slot, so a contender can be judged against it. */
interface ColorClaim {
  /** The token's full kebab path — its length is how semantic the claim is, shorter being more. */
  segments: string[];
  /** The name it would be reached by if it loses the slot it wanted. */
  name: string;
}

/**
 * Place a color token on the `colors` map.
 *
 * The family is the token's MEANING, which is the whole path minus the bookkeeping: strip the
 * leading structural segments (`primitive`, `theme`, `color`, …) and join what is left.
 * `theme/color/primary` → `primary`, `primitive/color/blue/500` → `blue.500`, and — the convention
 * that makes this more than cosmetic — `color/text/primary` → `text-primary` while
 * `color/background/primary` → `background-primary`.
 *
 * Keying on the LAST segment alone cannot express that: every role-nested system spells its roles
 * `text/primary`, `background/primary`, `border/primary`, so all three would claim `primary` and
 * two of them would reach no utility at all — leaving component code to write
 * `bg-[var(--color-background-primary)]`, the arbitrary-value output this curation exists to avoid.
 *
 * A shorter path still wins a genuine collision, because the shorter path is the more semantic one
 * and `bg-primary` should mean the system's semantic primary rather than a primitive that happens
 * to share a name. The LOSER is not dropped, though: it keeps a key of its own, spelled out from
 * its full path. Every token stays reachable by some utility.
 */
function addColor(
  colors: Record<string, string | Record<string, string>>,
  claims: Map<string, ColorClaim>,
  token: FlatCanonicalToken,
): void {
  const segments = token.path.map(kebab).filter(Boolean);
  if (!segments.length) return;
  const meaningful = meaningfulColorSegments(segments);
  const last = meaningful[meaningful.length - 1];
  // A lone numeric segment is a family in its own right — there is nothing left for it to step.
  const isStep = meaningful.length > 1 && /^\d+$/.test(last);
  const step = isStep ? last : "DEFAULT";
  const family = colorFamily(isStep ? meaningful.slice(0, -1) : meaningful);
  const claim: ColorClaim = { segments, name: token.name };

  const held = claims.get(`${family}.${step}`);
  if (!held) {
    setColor(colors, claims, family, step, claim);
    return;
  }
  const incumbentWins = held.segments.length <= segments.length;
  if (!incumbentWins) setColor(colors, claims, family, step, claim);
  const loser = incumbentWins ? claim : held;
  setColor(colors, claims, freeColorFamily(claims, loser.segments.join("-"), step), step, loser);
}

/** Drop the leading segments that say where the token LIVES, keeping at least one that says what it IS. */
function meaningfulColorSegments(segments: string[]): string[] {
  let start = 0;
  while (start < segments.length - 1 && COLOR_PATH_PREFIXES.has(segments[start])) start += 1;
  return segments.slice(start);
}

/**
 * The family key for a run of segments, each normalised through the synonym table so `color/bg/…`
 * and `color/surface/…` both read `background-…` — the same reason `error` becomes `danger`.
 */
function colorFamily(segments: string[]): string {
  return segments.map((segment) => COLOR_FAMILY_ALIASES[segment] ?? segment).join("-");
}

/** A family key for a displaced token that nothing else has claimed at this step. */
function freeColorFamily(claims: Map<string, ColorClaim>, base: string, step: string): string {
  let candidate = base;
  for (let n = 2; claims.has(`${candidate}.${step}`); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

function setColor(
  colors: Record<string, string | Record<string, string>>,
  claims: Map<string, ColorClaim>,
  family: string,
  step: string,
  claim: ColorClaim,
): void {
  claims.set(`${family}.${step}`, claim);
  const bag = colors[family];
  const record = typeof bag === "object" && bag !== null ? bag : {};
  record[step] = `var(--${claim.name})`;
  colors[family] = record;
}

/** A family whose only entry is `DEFAULT` reads better — and generates identically — as a string. */
function collapseSingletons(
  colors: Record<string, string | Record<string, string>>,
): Record<string, string | Record<string, string>> {
  const out: Record<string, string | Record<string, string>> = {};
  for (const key of Object.keys(colors).sort()) {
    const value = colors[key];
    if (typeof value === "object" && Object.keys(value).length === 1 && value.DEFAULT)
      out[key] = value.DEFAULT;
    else if (typeof value === "object") out[key] = sortKeys(value);
    else out[key] = value;
  }
  return out;
}

/** Stable key order — `DEFAULT` first, then numerics ascending, then the rest alphabetically. */
function sortKeys(bag: Record<string, string>): Record<string, string> {
  const keys = Object.keys(bag).sort((a, b) => {
    if (a === "DEFAULT") return -1;
    if (b === "DEFAULT") return 1;
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    if (!Number.isNaN(na)) return -1;
    if (!Number.isNaN(nb)) return 1;
    return a.localeCompare(b);
  });
  return Object.fromEntries(keys.map((key) => [key, bag[key]]));
}

const DEFAULT_CONTENT = ["./src/**/*.{ts,tsx,js,jsx}", "./.storybook/**/*.{ts,tsx,js,jsx}"];

/**
 * Tailwind v3: a `tailwind.config.js` whose `theme.extend` is the curated mapping.
 *
 * NOT self-sufficient on its own. Every value in it is a `var(--token)` reference, and v3 has no
 * `@theme` — nothing in a config file can declare a custom property — so the config only works
 * beside the `:root` layer `emitCssVars` produces. `emitTokensForStyling` is the API that
 * guarantees both land; call this directly only if you are writing the companion yourself.
 */
export function emitTailwindV3Config(tokens: FlatCanonicalToken[], options: EmitOptions = {}): string {
  const extend = curateTailwindTheme(tokens);
  const content = options.content ?? DEFAULT_CONTENT;
  return [
    `/* ${HEADER} */`,
    "/** @type {import('tailwindcss').Config} */",
    "export default {",
    `  content: [${content.map((glob) => JSON.stringify(glob)).join(", ")}],`,
    `  theme: {`,
    `    extend: ${renderJsObject(extend, 2)},`,
    `  },`,
    "  plugins: [],",
    "};",
    "",
  ].join("\n");
}

/**
 * A JS object literal — identifier keys unquoted — rather than `JSON.stringify`. The config is a
 * file a human will open and hand-extend, and `"colors":` in a `.js` module reads as generated
 * output nobody should touch. Quoted only where JS requires it (`"2xl"`, `"100"`).
 */
function renderJsObject(value: unknown, depth: number): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const pad = "  ".repeat(depth + 1);
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, child]) => `${pad}${tsKey(key)}: ${renderJsObject(child, depth + 1)},`,
  );
  return entries.length ? `{\n${entries.join("\n")}\n${"  ".repeat(depth)}}` : "{}";
}

/**
 * The Tailwind v4 `@theme` namespace each curated scale maps onto. Scales v4 gives no namespace
 * (`borderWidth`, `opacity`, `zIndex`) are absent by design: v4 generates those utilities from the
 * value itself, so inventing a namespace for them would emit variables Tailwind never reads.
 *
 * A stated limitation, not an oversight: because v4 has no `--border-width-*` namespace, the
 * curated `borderWidth` map (including the DEFAULT that makes `border` mean the project's hairline
 * under v3) reaches NO v4 utility. Under v4, `border` keeps Tailwind's own 1px and a project width
 * has to be written `border-(length:--stroke-width-2)`. Closing that would take a v4 plugin, which
 * is out of this emitter's scope; the raw tokens are all declared in the file either way.
 */
const V4_NAMESPACES: Partial<Record<keyof TailwindThemeExtension, string>> = {
  colors: "color",
  spacing: "spacing",
  borderRadius: "radius",
  boxShadow: "shadow",
  fontFamily: "font",
  fontSize: "text",
  fontWeight: "font-weight",
  lineHeight: "leading",
  letterSpacing: "tracking",
};

/**
 * Tailwind v4: the raw token layer as custom properties, then the curated `@theme` block on top.
 *
 * Both layers in one file because in v4 the stylesheet IS the config — there is no
 * `tailwind.config.js` to hold the second half — and the `@theme` entries are references into the
 * first layer, so splitting them would leave a file that only works next to its sibling.
 *
 * The two layers share ONE `:root` namespace, which is the trap this handles. Any raw token whose
 * name is also a `@theme` name is a collision, and BOTH shapes it takes are fatal:
 *
 *   - the same target — a system that already calls a token `shadow/md` yields the raw property
 *     `--shadow-md`, which is also the name v4's shadow namespace wants, so `--shadow-md:
 *     var(--shadow-md)` self-references and resolves to nothing;
 *   - DIFFERENT targets — a px-named spacing scale (`spacing/4`, `spacing/8`, `spacing/16`) yields
 *     raw `--spacing-4: 4px` while the curated 4px grid wants `--spacing-4: var(--spacing-16)`.
 *     Two live declarations of one name, and Tailwind hoists its `@theme` output ABOVE the raw
 *     layer, so the raw 4px wins the cascade and `p-4` silently means 4px, not the project's 16px.
 *
 * So the collision is decided on the NAME alone, never on what the reference points at, and it is
 * resolved by moving the raw token aside to a free `--token-*` name that every reference — the
 * `@theme` entries and the raw layer's own aliases — is rewritten to follow. One declaration per
 * name, both values still reachable, and no dependence on whether Tailwind chooses to re-emit a
 * given theme variable into `:root`.
 *
 * Only colliding tokens move. Prefixing the whole raw layer would also close the hole, but it would
 * rename every token in the file the moment a project switched from `css` to `tailwind` styling,
 * breaking every hand-written `var(--…)` that names one.
 */
export function emitTailwindV4Theme(tokens: FlatCanonicalToken[], options: EmitOptions = {}): string {
  const extend = curateTailwindTheme(tokens);
  const entries = v4ThemeEntries(extend);

  const rawNames = new Set(tokens.map((token) => token.name));
  const taken = new Set([...rawNames, ...entries.map(([name]) => name)]);
  const renames = new Map<string, string>();
  for (const [name] of entries)
    if (rawNames.has(name) && !renames.has(name)) renames.set(name, freeTokenName(name, taken));
  const rename = (name: string): string => renames.get(name) ?? name;

  const selector = options.rootSelector ?? ":root";
  const raw = cssDeclarations(tokens, rename).join("\n");
  const themeLines = entries.map(([name, ref]) => `  --${name}: ${rewriteVarRefs(ref, rename)};`);
  return `/* ${HEADER} */\n${selector} {\n${raw}\n}\n\n@theme {\n${themeLines.join("\n")}\n}\n`;
}

/** The curated theme, flattened to the `[--name, value]` pairs the `@theme` block declares. */
function v4ThemeEntries(extend: TailwindThemeExtension): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [scale, namespace] of Object.entries(V4_NAMESPACES)) {
    const bag = extend[scale as keyof TailwindThemeExtension];
    if (!bag) continue;
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === "string") {
        entries.push([v4Name(namespace, key), value]);
        continue;
      }
      for (const [step, ref] of Object.entries(value))
        entries.push([v4Name(namespace, key === step ? key : `${key}-${step}`), ref]);
    }
  }
  return entries;
}

/**
 * A name nothing else in the file claims, for a raw token displaced by a `@theme` name.
 *
 * `token-` reads as "the design system's own token, under its own name" next to v4's namespaced
 * `--spacing-4`. The counter is not paranoia about `token-token-…`: a system that literally has a
 * `token/spacing/4` variable would otherwise be displaced onto a name it already occupies.
 */
function freeTokenName(name: string, taken: Set<string>): string {
  let candidate = `token-${name}`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `token-${n}-${name}`;
  taken.add(candidate);
  return candidate;
}

/** Point every `var(--x)` inside an emitted value at `x`'s post-rename name. */
function rewriteVarRefs(value: string, rename: (name: string) => string): string {
  return value.replace(/var\(--([A-Za-z0-9_-]+)\)/g, (_, name: string) => `var(--${rename(name)})`);
}

/** `("radius", "DEFAULT")` → `radius`; `("color", "primary-500")` → `color-primary-500`. */
function v4Name(namespace: string, key: string): string {
  const suffix = key
    .split("-")
    .filter((part) => part !== "DEFAULT")
    .join("-");
  return suffix ? `${namespace}-${suffix}` : namespace;
}

// ── Styling approach → emitter, or a loud failure (task 7.7) ─────────

/** One file of an emit: its bytes, what it must be called, and what it is FOR. */
export interface EmittedFile {
  /**
   * `token-file` is the artifact `project.yaml → token_file` names. `custom-properties` is the
   * `:root` layer whose declarations the token file's values reference — a companion, not an
   * optional extra.
   */
  role: "token-file" | "custom-properties";
  /** The extension this file must carry — `main/` composes the path from it. */
  extension: string;
  content: string;
}

/**
 * What `emitTokensForStyling` produces: every file the emit must write, the `token_file` first.
 *
 * A list rather than one `content`/`extension` pair because a Tailwind v3 emit is genuinely two
 * files — a config of `var(--token)` references and the `:root` layer declaring them — and a caller
 * that could write only the first would produce a project where every utility silently computes to
 * nothing. Making the second file unmissable is the point of the shape; a caller cannot read
 * `content` and stop.
 */
export interface EmittedTokenFile {
  format: TokenEmitFormat;
  files: EmittedFile[];
}

const EXTENSIONS: Record<TokenEmitFormat, string> = {
  css: ".css",
  scss: ".scss",
  "tailwind-v3": ".js",
  "tailwind-v4": ".css",
  ts: ".ts",
};

/**
 * Which emitter a `project.yaml → styling` value routes to.
 *
 * `styled-components` and `emotion` take the TS theme object because that is what a CSS-in-JS
 * `ThemeProvider` consumes; `css-modules` takes plain custom properties, which a module can
 * reference like any other stylesheet.
 */
const STYLING_FORMATS: Record<string, TokenEmitFormat> = {
  css: "css",
  "css-modules": "css",
  scss: "scss",
  "styled-components": "ts",
  emotion: "ts",
};

export interface StylingEmitOptions extends EmitOptions {
  /** Which Tailwind major the project has installed. Defaults to 4 — v4 is the current release. */
  tailwindVersion?: 3 | 4;
}

/**
 * The emit format for a styling approach, or `null` when nothing emits it.
 *
 * The non-throwing half of the pair: a caller that wants to ASK — a setup flow deciding whether to
 * offer token emission at all — must be able to, without catching.
 */
export function resolveEmitFormat(
  styling: string | undefined,
  options: StylingEmitOptions = {},
): TokenEmitFormat | null {
  if (!styling) return null;
  const key = styling.trim().toLowerCase();
  if (key === "tailwind" || key === "tailwindcss")
    return options.tailwindVersion === 3 ? "tailwind-v3" : "tailwind-v4";
  return STYLING_FORMATS[key] ?? null;
}

/** Every styling approach this module can emit for — for an error message, and for a setup prompt. */
export const SUPPORTED_STYLING_APPROACHES: readonly string[] = [
  ...Object.keys(STYLING_FORMATS),
  "tailwind",
].sort();

/**
 * Emit the project's token file for its configured styling approach.
 *
 * THROWS, naming the approach, when nothing emits it (task 7.7). Falling back to CSS variables
 * would be the worse failure by far: the emit would report success, the file would land, and a
 * vanilla-extract or a Panda project would carry a `tokens.css` nothing in it imports — a design
 * system that silently stopped reaching the components. A loud failure is a five-minute
 * conversation; a silent one is a week of "why doesn't the brand color apply".
 */
export function emitTokensForStyling(
  styling: string | undefined,
  doc: DesignTokenDocument,
  options: StylingEmitOptions = {},
): EmittedTokenFile {
  const format = resolveEmitFormat(styling, options);
  if (!format)
    throw new Error(
      `No token emitter for the styling approach "${styling ?? "(unset)"}". ` +
        `Supported: ${SUPPORTED_STYLING_APPROACHES.join(", ")}. ` +
        `Set project.yaml → styling to one of those, or add an emitter — VortSpec will not write a ` +
        `token file in a format this project cannot consume.`,
    );
  return { format, files: emitFilesFor(format, doc, options) };
}

/**
 * The file set a format needs to actually work in a project.
 *
 * Only `tailwind-v3` is more than one file: v4 carries its `@theme` in the same stylesheet as the
 * raw layer, and css/scss/ts each declare what they reference.
 */
function emitFilesFor(
  format: TokenEmitFormat,
  doc: DesignTokenDocument,
  options: StylingEmitOptions,
): EmittedFile[] {
  const tokenFile: EmittedFile = {
    role: "token-file",
    extension: EXTENSIONS[format],
    content: emitTokens(format, doc, options),
  };
  if (format !== "tailwind-v3") return [tokenFile];
  return [
    tokenFile,
    {
      role: "custom-properties",
      extension: ".css",
      content: emitCssVars(flattenCanonicalTokens(doc, options), options),
    },
  ];
}
