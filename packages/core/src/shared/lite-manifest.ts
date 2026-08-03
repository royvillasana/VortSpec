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

/** Token groups shown in the manifest + the visual-reference "design system" section. */
export type TokenGroup = "colors" | "typography" | "spacing" | "shadows" | "radius";
export const TOKEN_GROUPS: readonly TokenGroup[] = ["colors", "typography", "spacing", "shadows", "radius"];

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

export interface LiteComponent {
  name: string;
  tier: ComponentTier;
  variants: string[];
  props?: { name: string; type: string; default?: string }[];
  readiness: Readiness;
  standIns: StandIn[];
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
  }[];
  /** Stand-ins keyed by component name (harvested real renders or placeholders). */
  standIns?: Record<string, StandIn[]>;
}

/** Build the manifest object from parsed sources. Pure — no fs, no re-derivation of values. */
export function deriveLiteManifest(input: DeriveInput): LiteManifest {
  const tokens = emptyGroups();
  for (const t of input.tokens) tokens[t.group].push({ name: t.name, value: t.value });

  // Foundations: spacing drives margins AND padding (one scale) — the visual-reference section.
  const spacing = tokens.spacing;
  const usedGroups = TOKEN_GROUPS.filter((g) => tokens[g].length > 0);

  const components: LiteComponent[] = input.components.map((c) => {
    const standIns = input.standIns?.[c.name] ?? placeholderStandIns(c.variants);
    // A component is framework-ready only when explicitly marked AND its stand-ins are harvested.
    const harvested = standIns.length > 0 && standIns.every((s) => s.source === "harvested");
    const readiness: Readiness = c.readiness === "framework-ready" && harvested ? "framework-ready" : "light-only";
    return { name: c.name, tier: c.tier, variants: c.variants, props: c.props, readiness, standIns };
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
  return { colors: [], typography: [], spacing: [], shadows: [], radius: [] };
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
  // `.astro` was missing, so an Astro path leaking into designer.md passed the guard —
  // exactly the framework coupling this list exists to catch.
  { label: "framework source file", re: /\.(tsx|jsx|vue|svelte|astro)\b/ },
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
