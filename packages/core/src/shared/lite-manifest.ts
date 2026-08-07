/**
 * Lite design manifest (`designer.md`) — VortSpec's light-first authoring twin of `DESIGN.md`
 * (OpenSpec change: light-design-system). This is a VortSpec product capability, NOT an SDD-DE
 * toolkit skill: it lives in tracked core.
 *
 * `DESIGN.md` is a living index into real code (JSX imports, `.variants.ts`, `localhost:6006`) meant
 * for the framework build. `designer.md` is the ONLY design context handed to the light-authoring
 * agent — a coherent light-only world with NO framework pointers, dual-keyed tokens (name + resolved
 * value), and a framework-free stand-in per component. It is a DERIVED projection: regenerated from
 * `DESIGN.md` + `components.json` + the token file, never hand-forked.
 *
 * This module is PURE + framework-free so the whole derivation is unit-testable without the fs. The
 * main-process orchestrator reads the sources (manifest-reader, token-parser, component-reader) and
 * feeds the parsed shapes in here; `deriveLiteManifest` builds the object and `serializeLiteManifest`
 * emits the `designer.md` text.
 */
import { FRAMEWORK_PROFILES } from "./framework-profiles";

/**
 * The framework-exclusive source extensions, as an alternation. Built from the profile table
 * so a framework added there is guarded here automatically. `.ts`/`.js`/`.html` are filtered
 * out deliberately — they are shared with plain web content, so their presence in a light
 * stand-in is not by itself evidence of framework coupling.
 */
const SHARED_WITH_PLAIN_WEB = new Set([".ts", ".js", ".html"]);
function frameworkSourceFileRe(): RegExp {
  const exts = [...new Set(Object.values(FRAMEWORK_PROFILES).flatMap((p) => p.sourceExts))]
    .filter((e) => !SHARED_WITH_PLAIN_WEB.has(e))
    .map((e) => e.slice(1))
    .sort();
  return new RegExp(`\\.(${exts.join("|")})\\b`);
}

/**
 * Token groups shown in the manifest + the visual-reference "design system" section.
 *
 * `motion` and `other` exist because the manifest must not DROP a token whose type it has no swatch
 * for (OpenSpec change: agentic-design-system, task 7.11). The previous five groups were the ones
 * the palette can draw, and anything else — a duration, a z-index, a `border` composite — mapped to
 * null and vanished, so a light page could not reference a motion token the design system genuinely
 * defines. `motion` is named rather than swallowed into `other` because durations and easings are a
 * real, authorable axis of a design system; `other` is the honest catch-all that guarantees the
 * manifest lists every token it was given.
 */
export type TokenGroup =
  | "colors"
  | "typography"
  | "spacing"
  | "shadows"
  | "radius"
  | "motion"
  | "other";
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  "colors",
  "typography",
  "spacing",
  "shadows",
  "radius",
  "motion",
  "other",
];

/**
 * The groups the palette draws a meaningful swatch for. `foundations.groups` is the VISUAL reference
 * index, so it stays the drawable five — a "motion" card of static bars would be a worse answer than
 * no card. The tokens themselves are still listed in full under `tokens:`, which is what a light page
 * author references.
 */
export const VISUAL_TOKEN_GROUPS: readonly TokenGroup[] = [
  "colors",
  "typography",
  "spacing",
  "shadows",
  "radius",
];

/** A dual-keyed token: the NAME keeps discipline + drives compile-back; the VALUE renders light HTML. */
export interface LiteToken {
  name: string;
  value: string;
}

/** One element's token→CSS-property mapping (the name half of the dual key, for compile restore). */
export interface TokenUse {
  token: string; // token name, e.g. "color/brand/primary"
  property: string; // CSS property, e.g. "background-color"
}

/** A framework-free stand-in for one component variant. */
export interface StandIn {
  variant: string;
  /** Framework-free HTML; element styles use RESOLVED token values so it renders with no framework. */
  html: string;
  /** Where the structure came from — the real render (preferred) or a pre-framework placeholder. */
  source: "harvested" | "placeholder";
  /** token name → CSS property for the styled elements (drives deterministic compile-back). */
  tokensUsed?: TokenUse[];
}

export type ComponentTier = "atom" | "molecule" | "organism" | "template";
export type Readiness = "light-only" | "framework-ready";

/**
 * The framework-free slice of a component's metadata that a light-authoring run needs
 * (OpenSpec change: agentic-design-system, task 3.4).
 *
 * Deliberately NOT the whole record. `usage.commonPatterns[].code` is real JSX and
 * `identity.importPath` is a module path — either one in `designer.md` is precisely the framework
 * coupling the manifest exists to keep out, and `serializeLiteManifest` would (correctly) throw. What
 * survives the trip is the reasoning: when to reach for this, why a variant exists, what not to do.
 */
export interface LiteHints {
  /** `aiHints.selectionCriteria` — when this component is the right choice over its siblings. */
  selectionCriteria?: string[];
  /** `variants[].purpose` — why to pick a value, which the value name never says. */
  variantPurpose?: { variant: string; purpose: string }[];
  /**
   * `usage.antiPatterns`, reduced to the two fields that change what gets generated. The `reason` is
   * dropped on purpose: it explains the rule to a person, and this block is read by a composer that
   * needs to know what to do instead.
   */
  avoid?: { scenario: string; instead: string }[];
}

export interface LiteComponent {
  name: string;
  tier: ComponentTier;
  variants: string[];
  props?: { name: string; type: string; default?: string }[];
  readiness: Readiness;
  standIns: StandIn[];
  /** Optional — a component with no metadata record still belongs in the manifest (task 3.6). */
  hints?: LiteHints;
}

export interface LiteManifest {
  name: string;
  derivedFrom: string; // provenance, always "DESIGN.md"
  tokens: Record<TokenGroup, LiteToken[]>;
  foundations: {
    spacing: LiteToken[];
    margins: LiteToken[];
    padding: LiteToken[];
    groups: TokenGroup[];
  };
  components: LiteComponent[];
}

/** Inputs to the derivation — already parsed by the caller from the real sources. */
export interface DeriveInput {
  projectName: string;
  /** All design tokens, resolved, tagged with the group they belong to. */
  tokens: { name: string; value: string; group: TokenGroup }[];
  /** The component contract (from `components.json` + specs). */
  components: {
    name: string;
    tier: ComponentTier;
    variants: string[];
    props?: { name: string; type: string; default?: string }[];
    readiness?: Readiness;
    hints?: LiteHints;
  }[];
  /** Stand-ins keyed by component name (harvested real renders or placeholders). */
  standIns?: Record<string, StandIn[]>;
}

/**
 * A canonical `$type` (+ the token's name as a tiebreak) → the manifest group it belongs in.
 *
 * NEVER returns null, which is the whole change here (task 7.11). The old `mapTokenGroup` read
 * VortSpec's coarse five-value `TokenType` — itself already a lossy projection, where `duration`
 * had been folded into `spacing` on the way in — and returned null for anything left over, silently
 * discarding the token. Reading the DTCG `$type` instead means the distinctions the design source
 * actually made survive: a duration is motion, a dimension is spacing (or radius, when the name says
 * so), and an unrecognised type lands in `other` rather than nowhere.
 */
export function mapCanonicalTokenGroup(type: string | undefined, name: string): TokenGroup {
  const t = (type ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (t === "color" || t === "gradient") return "colors";
  if (t === "shadow" || t === "boxshadow") return "shadows";
  if (t === "duration" || t === "cubicbezier" || t === "transition") return "motion";
  if (
    t === "fontfamily" ||
    t === "fontweight" ||
    t === "fontsize" ||
    t === "lineheight" ||
    t === "letterspacing" ||
    t === "typography"
  )
    return "typography";
  if (t === "dimension") return /radius|corner|rounded/.test(n) ? "radius" : "spacing";
  // An untyped token — every token from a plain stylesheet whose value settled nothing — still has
  // its name, which is how a design system that never declared types is nonetheless organised.
  if (!t) {
    if (/(^|[-/])(radius|corner|rounded)/.test(n)) return "radius";
    if (/(^|[-/])(shadow|elevation)/.test(n)) return "shadows";
    if (/(^|[-/])(duration|transition|delay|ease|animation)/.test(n)) return "motion";
    if (/(font|leading|tracking|text|type)/.test(n)) return "typography";
    if (/(^|[-/])(spacing|space|gap|size)/.test(n)) return "spacing";
    if (/(color|colour|bg|background|foreground|border|fill|stroke)/.test(n)) return "colors";
  }
  return "other";
}

/** Build the manifest object from parsed sources. Pure — no fs, no re-derivation of values. */
export function deriveLiteManifest(input: DeriveInput): LiteManifest {
  const tokens = emptyGroups();
  for (const t of input.tokens) tokens[t.group].push({ name: t.name, value: t.value });

  // Foundations: spacing drives margins AND padding (one scale) — the visual-reference section.
  const spacing = tokens.spacing;
  const usedGroups = VISUAL_TOKEN_GROUPS.filter((g) => tokens[g].length > 0);

  const components: LiteComponent[] = input.components.map((c) => {
    const standIns = input.standIns?.[c.name] ?? placeholderStandIns(c.variants);
    // A component is framework-ready only when explicitly marked AND its stand-ins are harvested.
    const harvested = standIns.length > 0 && standIns.every((s) => s.source === "harvested");
    const readiness: Readiness = c.readiness === "framework-ready" && harvested ? "framework-ready" : "light-only";
    return {
      name: c.name,
      tier: c.tier,
      variants: c.variants,
      props: c.props,
      readiness,
      standIns,
      // Spread rather than assigned, so a component with no metadata record carries no `hints` key
      // at all instead of an empty one (task 3.6) — the manifest never implies a gap is a green light.
      ...(c.hints ? { hints: c.hints } : {}),
    };
  });

  return {
    name: `${input.projectName} Lite Design System`,
    derivedFrom: "DESIGN.md",
    tokens,
    foundations: { spacing, margins: spacing, padding: spacing, groups: usedGroups },
    components,
  };
}

function emptyGroups(): Record<TokenGroup, LiteToken[]> {
  return { colors: [], typography: [], spacing: [], shadows: [], radius: [], motion: [], other: [] };
}

/** Minimal placeholder stand-in per variant when no framework render exists yet. */
function placeholderStandIns(variants: string[]): StandIn[] {
  const vs = variants.length > 0 ? variants : ["default"];
  return vs.map((variant) => ({
    variant,
    html: `<div data-standin-placeholder="${escapeAttr(variant)}"></div>`,
    source: "placeholder" as const,
  }));
}

/**
 * Patterns that betray framework/Storybook coupling. `designer.md` must contain NONE of these — a
 * single stray `@/components/...` import is the exact "confuses the light LLM" failure the manifest
 * exists to prevent. Used both to guard serialization and as the verify gate.
 */
const FRAMEWORK_POINTER_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "import statement", re: /\bimport\s+[\w{*]/ },
  { label: "variants file", re: /\.variants\.[tj]s\b/ },
  { label: "module alias @/", re: /(^|[^\w])@\/[\w-]/ },
  { label: "storybook url", re: /localhost:6006/ },
  // Derived from the shared profile table rather than a hand-kept list: `.astro` was missing,
  // so an Astro path leaking into designer.md passed the guard — exactly the framework
  // coupling this list exists to catch. `.ts`/`.js`/`.html` are excluded on purpose: a light
  // stand-in may legitimately mention them, so they are not evidence of framework coupling.
  { label: "framework source file", re: frameworkSourceFileRe() },
  { label: "cva()/cn() call", re: /\b(cva|cn)\s*\(/ },
];

/** Return the framework pointers found in `text` (empty ⇒ clean, light-only). */
export function findFrameworkPointers(text: string): string[] {
  return FRAMEWORK_POINTER_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/**
 * Serialize the manifest to `designer.md` text: YAML frontmatter (dual-keyed tokens, foundations,
 * component index) + a Markdown body of HTML stand-in sections. Throws if any framework pointer would
 * leak (e.g. a harvested stand-in carrying a real import), so a bad manifest never reaches the LLM.
 */
/**
 * Serialize a component's hints into the frontmatter, omitting anything empty.
 *
 * An empty `hints: {}` would be worse than absent: a composer reading it cannot tell "this component
 * has no selection criteria recorded" from "this component may be used anywhere".
 */
function pushHints(lines: string[], hints: LiteHints | undefined): void {
  if (!hints) return;
  const criteria = hints.selectionCriteria?.filter((c) => c.trim()) ?? [];
  const purposes = hints.variantPurpose?.filter((v) => v.variant.trim() && v.purpose.trim()) ?? [];
  const avoid = hints.avoid?.filter((a) => a.scenario.trim() && a.instead.trim()) ?? [];
  if (!criteria.length && !purposes.length && !avoid.length) return;
  lines.push("    hints:");
  if (criteria.length) {
    lines.push("      selectionCriteria:");
    for (const c of criteria) lines.push(`        - ${yamlStr(c)}`);
  }
  if (purposes.length) {
    lines.push("      variantPurpose:");
    for (const v of purposes)
      lines.push(`        - { variant: ${yamlStr(v.variant)}, purpose: ${yamlStr(v.purpose)} }`);
  }
  if (avoid.length) {
    lines.push("      avoid:");
    for (const a of avoid)
      lines.push(`        - { scenario: ${yamlStr(a.scenario)}, instead: ${yamlStr(a.instead)} }`);
  }
}

export function serializeLiteManifest(m: LiteManifest): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${yamlStr(m.name)}`);
  lines.push(`derivedFrom: ${m.derivedFrom}`);
  lines.push("tokens:");
  for (const g of TOKEN_GROUPS) {
    if (m.tokens[g].length === 0) continue;
    lines.push(`  ${g}:`);
    for (const t of m.tokens[g]) lines.push(`    - { name: ${yamlStr(t.name)}, value: ${yamlStr(t.value)} }`);
  }
  lines.push("foundations:");
  pushTokenList(lines, "spacing", m.foundations.spacing);
  pushTokenList(lines, "margins", m.foundations.margins);
  pushTokenList(lines, "padding", m.foundations.padding);
  lines.push(`  groups: [${m.foundations.groups.join(", ")}]`);
  lines.push("components:");
  for (const c of m.components) {
    lines.push(`  - name: ${yamlStr(c.name)}`);
    lines.push(`    tier: ${c.tier}`);
    lines.push(`    variants: [${c.variants.join(", ")}]`);
    lines.push(`    readiness: ${c.readiness}`);
    lines.push(`    standInSource: ${standInSource(c)}`);
    if (c.props && c.props.length > 0) {
      lines.push("    props:");
      for (const p of c.props) {
        const def = p.default !== undefined ? `, default: ${yamlStr(p.default)}` : "";
        lines.push(`      - { name: ${yamlStr(p.name)}, type: ${yamlStr(p.type)}${def} }`);
      }
    }
    pushHints(lines, c.hints);
  }
  lines.push("---");
  lines.push("");
  for (const c of m.components) {
    lines.push(`## ${c.name}  ·  ${c.tier}  ·  variants: ${c.variants.join(" · ")}`);
    lines.push("");
    for (const s of c.standIns) {
      lines.push(`<!-- stand-in: ${s.variant} (${s.source}) -->`);
      lines.push("```html");
      lines.push(s.html.trim());
      lines.push("```");
      if (s.tokensUsed && s.tokensUsed.length > 0) {
        const map = s.tokensUsed.map((u) => `${u.token}→${u.property}`).join(" · ");
        lines.push(`<!-- tokens-used: ${map} -->`);
      }
      lines.push("");
    }
  }
  const text = lines.join("\n");

  const leaks = findFrameworkPointers(text);
  if (leaks.length > 0) {
    throw new Error(`designer.md would leak framework pointers (${leaks.join(", ")}); a stand-in must be framework-free`);
  }
  return text;
}

function standInSource(c: LiteComponent): "harvested" | "placeholder" {
  return c.standIns.length > 0 && c.standIns.every((s) => s.source === "harvested") ? "harvested" : "placeholder";
}

function pushTokenList(lines: string[], key: string, tokens: LiteToken[]): void {
  if (tokens.length === 0) {
    lines.push(`  ${key}: []`);
    return;
  }
  lines.push(`  ${key}:`);
  for (const t of tokens) lines.push(`    - { name: ${yamlStr(t.name)}, value: ${yamlStr(t.value)} }`);
}

/** Quote a YAML scalar defensively (values contain `#`, `:`, commas). */
function yamlStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
