/**
 * Component-scoped design tokens — the naming contract, as code rather than prose.
 *
 * WHY. `DESIGN_REFERENCE_CLAUSE` tells a build to use "the component's OWN design tokens
 * (e.g. the `--component-<name>-*` semantic tokens) where the design system defines them",
 * and `verifyPrompt`'s TOKEN layer repeats that naming. Both state the convention in prose
 * and neither can check it, so nothing keeps a token file honest to it.
 *
 * Measured on a real project (`testing project/TokenUpdate`, built from Figma file
 * `ojko9pGfsDAvmUf2DA38d2`), the drift is already severe: its token file carries component-scoped
 * tokens under several different naming schemes — `--switch-width`, `--progress-height-sm`,
 * `--popover-arrow-size`, `--spacing-overlap-xs` — and only Button uses the `--component-<name>-*`
 * form the build and the verifier are both told to look for. No exact census is kept here on
 * purpose: a hand-maintained count in a docblock is the same unchecked prose this module exists
 * to replace, and it would go stale the first time that file changed.
 *
 * And Accordion, whose Figma file defines `Components/Accordion/Active Item Header
 * Background` = #CEE4E9, has NO token in the file at all — so the build silently bound
 * `--color-neutral-100` (#F8F9FA) instead. A visible wrong colour, produced by a missing
 * name rather than a missing value.
 *
 * This module makes the FORWARD mapping deterministic and coverage measurable, so extraction can
 * be checked rather than trusted. There is deliberately NO reverse mapping: the forward map is
 * not injective — `Components/Avatar Group/Overlap XS` and `Components/Avatar/Group Overlap XS`
 * both emit `--component-avatar-group-overlap-xs`, because the join uses the same `-` that
 * appears inside each half. That property has two legitimate preimages, so no splitting rule can
 * be correct for every input, and a vocabulary lookup would only be correct while the vocabulary
 * happened to be complete. Consumers never need it: every caller already holds the Figma paths,
 * so it forward-maps and tests set membership. For "is this name canonical at all?", which needs
 * no vocabulary, use {@link isCanonicalComponentTokenName}. It is pure string work: no Figma
 * calls, no IO, no framework knowledge.
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
 * Does this property follow the canonical convention at all? Needs no vocabulary, so this is
 * the off-convention signal a caller can rely on: false means the token is named some other
 * way, NOT that it is absent.
 */
export function isCanonicalComponentTokenName(cssVar: string): boolean {
  const trimmed = cssVar.trim();
  if (!trimmed.startsWith(COMPONENT_TOKEN_PREFIX)) return false;
  const rest = trimmed.slice(COMPONENT_TOKEN_PREFIX.length);
  const dash = rest.indexOf("-");
  return dash > 0 && dash < rest.length - 1;
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

/** Where the owned naming contract is written inside a project. */
export const COMPONENT_TOKEN_DOC_PATH = ".sdd-de/docs/component-token-naming.md";

/**
 * The project-local naming contract, generated from the mapping for the same reason the prompt
 * clause is: one copy, in code, rendered wherever it is needed.
 *
 * This reaches the skills that consult `.sdd-de/docs` (`sync-tokens`, `storybook`, `setup`,
 * `commit`). It does NOT reach `extract-design-system` — measured against the pinned toolkit,
 * that skill references no doc, no standards index and no entry file; its first instruction is
 * to read `.sdd-de/project.yaml`. So the doc is defence in depth and `project.yaml` carries the
 * rule that extraction actually sees. A file nothing opens is not a contract.
 */
export function buildComponentTokenNamingDoc(): string {
  const ex = componentTokenName("Components/Accordion/Active Item Header Background")!;
  const nested = componentTokenName("Components/Button/Border/Hover")!;
  return [
    "# Component Token Naming",
    "",
    "> GENERATED by VortSpec from the token-naming contract in code. Do not edit by hand — it is",
    "> rewritten on setup and on toolkit update.",
    "",
    `A design source that defines a variable under \`${COMPONENT_NAMESPACE}/<Component>/…\` is naming the`,
    "exact value that component must use. Extract it, and name it by this one rule:",
    "",
    "```",
    `${COMPONENT_NAMESPACE}/Accordion/Active Item Header Background  →  ${ex.name}`,
    `${COMPONENT_NAMESPACE}/Button/Border/Hover                      →  ${nested.name}`,
    "```",
    "",
    `\`${COMPONENT_TOKEN_PREFIX}<component>-<slot>\` — lowercase, each path segment slugified, nested`,
    "slot groups flattened.",
    "",
    "## Why one rule",
    "",
    "The build and the verifier are both instructed to look for this prefix. A per-component scheme",
    "(`--switch-width`, `--progress-height-sm`, `--spacing-overlap-xs`) holds a real token that",
    "neither can find by name — so the build reaches for the nearest global and renders a wrong",
    "value that every syntactic check passes.",
    "",
    "If a token file already carries such names, ADD the canonical name alongside rather than",
    "renaming in place: an existing component may reference the old one.",
  ].join("\n");
}

/** The standards-index line, mirroring how the framework rules are linked. */
export const COMPONENT_TOKEN_INDEX_LINE =
  `- [Component Token Naming](${COMPONENT_TOKEN_DOC_PATH}) — how a \`${COMPONENT_NAMESPACE}/…\` design ` +
  `variable becomes a code token. Extraction and verification both resolve by this name.`;

/**
 * Insert the link into a runtime entry doc's standards list. Idempotent, and falls back to
 * appending a Standards section when the expected list is absent — same contract as the
 * framework-rules link, so a toolkit that reorganizes its own entry file still ends up linking.
 */
export function linkComponentTokenNamingInEntryDoc(markdown: string): string {
  if (markdown.includes(COMPONENT_TOKEN_DOC_PATH)) return markdown;
  const anchor = markdown.indexOf("- [Component Standards]");
  if (anchor !== -1) {
    return markdown.slice(0, anchor) + COMPONENT_TOKEN_INDEX_LINE + "\n" + markdown.slice(anchor);
  }
  return `${markdown.trimEnd()}\n\n## Standards\n\n${COMPONENT_TOKEN_INDEX_LINE}\n`;
}

export interface ComponentTokenCoverage {
  /** Figma component tokens with no declaration in the token file, by canonical name. */
  missing: ComponentTokenId[];
  /** Figma component tokens present under their canonical name. */
  covered: ComponentTokenId[];
  /**
   * CANDIDATES only — properties that MIGHT be the same component's tokens under another
   * naming scheme. Never treat a row here as established evidence; it is a lead to look at.
   *
   * Wrong in BOTH directions, by construction:
   *  - false negatives: a scheme that renames the component entirely is invisible. Avatar
   *    Group's real tokens are `--spacing-overlap-*`, which contain no component slug at all.
   *  - false positives: a property can contain the slug and have nothing to do with the
   *    component. `--switch-width` is Switch's, but a global `--transition-switch-duration`
   *    would match the same way, and so would any unrelated token whose name embeds the word.
   *
   * Matching is on slug BOUNDARIES (`-` or string edge) rather than bare substring, so
   * `progress` does not match `--progressive-disclosure-gap` — but that narrows the false
   * positives, it does not remove them. An empty list is not proof of consistency, and a
   * populated one is not proof of drift.
   */
  offConventionCandidates: Array<{ component: string; properties: string[] }>;
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

  // Candidates: properties mentioning the component's slug as a BOUNDED segment while not
  // carrying the canonical prefix. Bounded rather than bare substring so `progress` does not
  // match `--progressive-disclosure-gap`; still a lead, not evidence (see the type's doc).
  const offConventionCandidates: Array<{ component: string; properties: string[] }> = [];
  for (const component of [...new Set(ids.map((i) => i.component))].sort()) {
    const bounded = new RegExp(`(^|-)${component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-|$)`);
    const hits = [...declared].filter(
      (p) =>
        !p.startsWith(`${COMPONENT_TOKEN_PREFIX}${component}-`) &&
        bounded.test(p.replace(/^--/, "")),
    );
    if (hits.length) offConventionCandidates.push({ component, properties: hits.sort() });
  }

  return { missing, covered, offConventionCandidates };
}
