/**
 * Component-scoped design tokens — the naming contract, as code rather than prose.
 *
 * WHY. `DESIGN_REFERENCE_CLAUSE` tells a build to use "the component's OWN design tokens
 * (e.g. the `--component-<name>-*` semantic tokens) where the design system defines them",
 * and `verifyPrompt`'s TOKEN layer repeats that naming. Both state the convention in prose
 * and neither can check it, so nothing keeps a token file honest to it.
 *
 * Measured on a real project (`testing project/TokenUpdate`, built from Figma file
 * `ojko9pGfsDAvmUf2DA38d2`), the drift is already severe. Its token file carries 73
 * component-scoped tokens across 8 components, under SEVEN different naming schemes:
 *
 *   --component-button-primary-background-hover   ← the documented convention (Button only)
 *   --switch-width, --switch-thumb-diameter       ← Switch
 *   --progress-height-sm                          ← Progress
 *   --popover-arrow-size                          ← Popover
 *   --font-size-list-group-sm                     ← List Group
 *   --spacing-overlap-xs                          ← Avatar Group
 *   --shimmer-animation-offset                    ← Placeholders
 *
 * Exactly one of the eight matches the convention the build and the verifier are told to
 * look for. The other seven hold real component tokens that neither can find by name.
 *
 * And Accordion, whose Figma file defines `Components/Accordion/Active Item Header
 * Background` = #CEE4E9, has NO token in the file at all — so the build silently bound
 * `--color-neutral-100` (#F8F9FA) instead. A visible wrong colour, produced by a missing
 * name rather than a missing value.
 *
 * This module makes the mapping deterministic in both directions and makes coverage
 * measurable, so extraction can be checked rather than trusted. It is pure string work:
 * no Figma calls, no IO, no framework knowledge.
 */

/** The Figma variable-collection group that marks a variable as component-scoped. */
export const COMPONENT_NAMESPACE = "Components";

/** The one canonical CSS custom-property prefix for a component-scoped token. */
export const COMPONENT_TOKEN_PREFIX = "--component-";

/**
 * Slugify one Figma path segment for use in a CSS custom property: lowercase, every run of
 * non-alphanumerics collapsed to a single hyphen, no leading or trailing hyphen. Figma slot
 * names are free text written by designers ("Active Item Header Background", "Border/Hover",
 * "text_color"), so this has to be tolerant rather than strict.
 */
function slugify(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A Figma component-scoped variable, decomposed. */
export interface ComponentTokenId {
  /** Slugified component name — `accordion` from `Components/Accordion/…`. */
  component: string;
  /** Slugified remainder — `active-item-header-background`. Nested groups are flattened. */
  slot: string;
  /** The canonical CSS custom property, including the leading `--`. */
  name: string;
}

/**
 * True when a Figma variable path sits in the component-scoped namespace.
 *
 * Matching is case-insensitive on the leading group only. A variable must have at least
 * three segments — `Components/Accordion` alone names a group, not a token.
 */
export function isComponentScopedPath(figmaPath: string): boolean {
  const parts = figmaPath.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  return parts[0].toLowerCase() === COMPONENT_NAMESPACE.toLowerCase();
}

/**
 * Map a Figma variable path to its canonical component token.
 *
 * `Components/Accordion/Active Item Header Background`
 *   → `--component-accordion-active-item-header-background`
 *
 * Returns null for anything outside the component namespace — callers must treat that as
 * "this is a global token, not mine to name", never as a failure to be papered over.
 */
export function componentTokenName(figmaPath: string): ComponentTokenId | null {
  if (!isComponentScopedPath(figmaPath)) return null;
  const parts = figmaPath.split("/").map((p) => p.trim()).filter(Boolean);
  const component = slugify(parts[1]);
  const slot = parts.slice(2).map(slugify).filter(Boolean).join("-");
  if (!component || !slot) return null;
  return { component, slot, name: `${COMPONENT_TOKEN_PREFIX}${component}-${slot}` };
}

/**
 * Inverse of {@link componentTokenName}, for reading an existing token file. Returns null
 * for a property that does not follow the convention — which is the signal that a token is
 * off-convention, not that it is absent.
 */
export function parseComponentTokenName(cssVar: string): Omit<ComponentTokenId, "name"> | null {
  const trimmed = cssVar.trim();
  if (!trimmed.startsWith(COMPONENT_TOKEN_PREFIX)) return null;
  const rest = trimmed.slice(COMPONENT_TOKEN_PREFIX.length);
  const dash = rest.indexOf("-");
  if (dash <= 0 || dash === rest.length - 1) return null;
  return { component: rest.slice(0, dash), slot: rest.slice(dash + 1) };
}

/** Every custom property declared in a stylesheet, in source order, deduped. */
export function declaredCustomProperties(css: string): string[] {
  const seen = new Set<string>();
  for (const m of css.matchAll(/(^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g)) seen.add(m[2]);
  return [...seen];
}

/**
 * The extraction instruction, RENDERED FROM the mapping above rather than restated beside it.
 *
 * Every worked example below is produced by calling `componentTokenName` at render time, so the
 * rule an agent is given and the rule `auditComponentTokenCoverage` enforces cannot drift apart —
 * change the mapping and this text changes with it. Prose that merely *describes* a contract is
 * how the seven naming schemes in the measured token file happened; a test asserts these examples
 * are the function's real output.
 *
 * Composes with — and deliberately does not restate — the build-side rule that a near colour is
 * never a match. This clause is about what EXTRACTION must emit so that rule has something to find.
 */
export function componentTokenExtractionClause(): string {
  const example = componentTokenName("Components/Accordion/Active Item Header Background");
  const nested = componentTokenName("Components/Button/Border/Hover");
  // Non-null by construction; both inputs are component-namespaced with a slot.
  const ex = example?.name ?? "";
  const nx = nested?.name ?? "";
  return [
    `COMPONENT-SCOPED TOKENS — extract the \`${COMPONENT_NAMESPACE}/…\` namespace, do not skip it.`,
    "A design system that defines a token FOR a component is telling you the exact value that",
    "component must use. Dropping it does not lose a nicety: the build then finds no token, reaches",
    "for the nearest global, and renders a visibly wrong colour that every syntactic check passes.",
    "",
    `Name every such variable by ONE rule — \`${COMPONENT_TOKEN_PREFIX}<component>-<slot>\`, lowercase,`,
    "each path segment slugified, nested slot groups flattened:",
    `  ${COMPONENT_NAMESPACE}/Accordion/Active Item Header Background  →  ${ex}`,
    `  ${COMPONENT_NAMESPACE}/Button/Border/Hover                      →  ${nx}`,
    "",
    "Do NOT invent a per-component scheme. Names like `--switch-width`, `--progress-height-sm` or",
    "`--spacing-overlap-xs` hold real component tokens that neither the build nor the token audit can",
    "find, because both are instructed to look for the one prefix above. If a token file already",
    "carries such names, ADD the canonical name alongside rather than renaming in place — an existing",
    "component may reference the old one.",
    "",
    "Completeness is per component, not per file: report how many components in the source define",
    "component-scoped variables and how many you emitted. If those two numbers differ, say so and name",
    "the components you could not read — never let a partial extraction read as a complete one.",
  ].join("\n");
}

export interface ComponentTokenCoverage {
  /** Figma component tokens with no declaration in the token file, by canonical name. */
  missing: ComponentTokenId[];
  /** Figma component tokens present under their canonical name. */
  covered: ComponentTokenId[];
  /**
   * Components that declare tokens in the file under some OTHER naming scheme — real
   * component tokens the build and verifier cannot find by the documented name.
   *
   * This is a HEURISTIC and is reported separately for that reason: it flags a property
   * that embeds the component's slug but does not use the canonical prefix. It can miss a
   * scheme that renames the component (Avatar Group's `--spacing-overlap-*` names no
   * component at all), so an empty list is not proof of consistency.
   */
  offConvention: Array<{ component: string; properties: string[] }>;
}

/**
 * Compare what Figma defines against what the token file declares.
 *
 * `figmaPaths` is the full variable path list from the design source; non-component paths
 * are ignored rather than rejected, so a caller can pass the whole collection.
 */
export function auditComponentTokenCoverage(
  figmaPaths: readonly string[],
  css: string,
): ComponentTokenCoverage {
  const declared = new Set(declaredCustomProperties(css));
  const ids: ComponentTokenId[] = [];
  const seenNames = new Set<string>();
  for (const p of figmaPaths) {
    const id = componentTokenName(p);
    if (id && !seenNames.has(id.name)) {
      seenNames.add(id.name);
      ids.push(id);
    }
  }

  const missing = ids.filter((id) => !declared.has(id.name));
  const covered = ids.filter((id) => declared.has(id.name));

  // Off-convention: for each component Figma knows about, properties that mention its slug
  // but do not carry the canonical prefix.
  const offConvention: Array<{ component: string; properties: string[] }> = [];
  for (const component of [...new Set(ids.map((i) => i.component))].sort()) {
    const hits = [...declared].filter(
      (p) => !p.startsWith(`${COMPONENT_TOKEN_PREFIX}${component}-`) && p.includes(component),
    );
    if (hits.length) offConvention.push({ component, properties: hits.sort() });
  }

  return { missing, covered, offConvention };
}
