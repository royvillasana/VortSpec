import { profileFor } from "./framework-profiles";
import type { ComponentTier } from "./relationship-graph";

/**
 * The generated validation page — OpenSpec change: agentic-design-system, group 2b.
 *
 * The audit, the token check and the §1.6 benchmark all need a PAGE: something that renders
 * components so there are instances to count, tokens to resolve and reuse to measure. All three
 * were implicitly blocked on the user having authored a screen, which inverts the order the work
 * happens in — components are built before screens, and that is exactly when their token discipline
 * is cheapest to fix. Waiting also makes coverage accidental: a component nobody has used yet is
 * simply unaudited, silently.
 *
 * ONE PAGE PER TIER, not one page total. With a single page, benchmark Q4 ("how many of these are
 * used on other pages") is zero by construction — a degenerate answer that looks like a measurement.
 * Per-tier mirrors how the system is actually composed: a molecule renders atoms, so an atom
 * legitimately appears both on its own page and inside the molecule's, and the reuse signal is real.
 *
 * PURE — no fs.
 */

/** Where generated pages live: clearly marked, obviously disposable, never mistaken for a screen. */
export const VALIDATION_DIR = "src/__vortspec_validation__";

export interface ValidationComponent {
  name: string;
  /** Project-relative path of the component's source, for the import specifier. */
  file: string;
  tier?: ComponentTier;
  /** Variant axis values to render, e.g. `["primary","secondary"]`. Empty renders once, bare. */
  variants?: string[];
}

export interface ValidationPage {
  /** Project-relative path to write. */
  path: string;
  tier: ComponentTier;
  contents: string;
  /** Components this page renders — the expected instances, for asserting the page did its job. */
  renders: string[];
}

/** Frameworks whose page can be emitted deterministically: the JSX family. */
const JSX_FRAMEWORKS = new Set(["react", "next", "solid", "astro"]);

/**
 * Whether a validation page can be generated deterministically for this framework.
 *
 * `false` is not a failure — it means the page must be produced by the agent through the idioms
 * prompt, the same way components themselves are. What must never happen is emitting a JSX page
 * into an Angular project because the generator guessed.
 */
export function canGenerateValidationPage(framework: string | undefined): boolean {
  return JSX_FRAMEWORKS.has((framework ?? "").toLowerCase());
}

const TIER_ORDER: ComponentTier[] = ["atom", "molecule", "organism", "template"];

/**
 * Emit one page per tier.
 *
 * THROWS, naming the framework, when it cannot emit — mirroring `emitTokensForStyling` in the token
 * pipeline, and for the same reason: writing a page the project cannot compile is worse than writing
 * none. A broken file in the user's source tree is a support ticket; a clear refusal is a decision.
 */
export function buildValidationPages(
  components: readonly ValidationComponent[],
  framework: string | undefined,
): ValidationPage[] {
  if (!canGenerateValidationPage(framework))
    throw new Error(
      `No deterministic validation-page generator for "${framework ?? "(unset)"}". ` +
        `Supported: ${[...JSX_FRAMEWORKS].sort().join(", ")}. ` +
        `Generate the page through the framework idioms prompt instead — VortSpec will not write a ` +
        `page this project cannot compile.`,
    );

  const byTier = new Map<ComponentTier, ValidationComponent[]>();
  for (const component of components) {
    // A component with no recorded tier still gets validated. Dropping it would make coverage
    // depend on classification, which is the accidental coverage this exists to remove.
    const tier = component.tier ?? "atom";
    byTier.set(tier, [...(byTier.get(tier) ?? []), component]);
  }

  const pages: ValidationPage[] = [];
  for (const tier of TIER_ORDER) {
    const members = (byTier.get(tier) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (members.length === 0) continue;
    pages.push({
      path: `${VALIDATION_DIR}/${capitalize(tier)}s.tsx`,
      tier,
      contents: renderJsxPage(tier, members),
      renders: members.map((member) => member.name),
    });
  }
  return pages;
}

function renderJsxPage(tier: ComponentTier, members: readonly ValidationComponent[]): string {
  const imports = members
    .map((member) => `import { ${member.name} } from "${importSpecifier(member.file)}";`)
    .join("\n");

  const blocks = members
    .map((member) => {
      const variants = member.variants?.length ? member.variants : [];
      const instances = variants.length
        ? variants
            .map((variant) => `      <${member.name} variant="${escapeAttr(variant)}" />`)
            .join("\n")
        : `      <${member.name} />`;
      return [
        `    <section data-validation-component="${escapeAttr(member.name)}">`,
        `      <h2>${escapeText(member.name)}</h2>`,
        instances,
        `    </section>`,
      ].join("\n");
    })
    .join("\n");

  return [
    "/**",
    ` * GENERATED by VortSpec — the ${tier} validation page.`,
    " *",
    " * Renders every component of this tier so the audit has real instances to measure: resolved",
    " * token values, rendered structure, and reuse across tiers. Disposable — VortSpec removes it",
    " * after a validation run unless you chose to keep it.",
    " *",
    " * It is the FLOOR, not the ceiling: it proves a component renders and which tokens it resolves,",
    " * not that the component is used correctly in context. Run the same audit against your own",
    " * screens for that.",
    " */",
    imports,
    "",
    `export default function ${capitalize(tier)}sValidation() {`,
    "  return (",
    `    <main data-validation-tier="${tier}">`,
    blocks,
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/**
 * The import specifier for a component, relative to the validation directory.
 *
 * Relative rather than an alias: an alias depends on a `tsconfig`/bundler mapping this generator
 * cannot verify, and a page that fails to resolve is exactly the uncompilable file the throw above
 * exists to prevent.
 */
export function importSpecifier(file: string): string {
  const from = VALIDATION_DIR.split("/");
  const to = file.replace(/\.[^./]+$/, "").split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;
  const up = from.length - shared;
  const segments = [...Array.from({ length: up }, () => ".."), ...to.slice(shared)];
  const specifier = segments.join("/");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/{/g, "&#123;").replace(/}/g, "&#125;");
}

/**
 * The prompt for a framework the generator cannot emit for.
 *
 * Delegates to the agent using the framework's own idioms, which is how every other framework-shaped
 * artifact in VortSpec is produced. Deliberately asks for the SAME markers the deterministic path
 * emits (`data-validation-component`), so the audit reads one shape regardless of who wrote the page.
 */
export function buildValidationPagePrompt(
  components: readonly ValidationComponent[],
  framework: string | undefined,
): string {
  const profile = profileFor(framework);
  const list = components
    .map((component) => `- ${component.name} (${component.file})${component.variants?.length ? ` — variants: ${component.variants.join(", ")}` : ""}`)
    .join("\n");
  return [
    `Generate design-system VALIDATION pages for this ${framework ?? "project"}, one per atomic tier`,
    `(atoms, molecules, organisms), under \`${VALIDATION_DIR}/\`.`,
    "",
    "Their only job is to render every component so an audit has real instances to measure — resolved",
    "token values, rendered structure, and reuse across tiers. They are disposable and will be removed",
    "after the run unless the user keeps them.",
    "",
    "Rules:",
    `- Follow this framework's own conventions: ${profile ? profile.supportLevel : "unknown"} support; use its`,
    "  normal component import, template and export syntax. Do NOT emit JSX into a framework that isn't JSX.",
    "- Render EVERY component listed, and one instance per variant where variants are given.",
    "- Mark each component's section with `data-validation-component=\"<Name>\"` and each page with",
    '  `data-validation-tier="<tier>"` — the audit reads those markers.',
    "- Pass only props the component actually requires; a page that does not compile is worse than none.",
    "- One page per tier, so a component used by a higher tier shows real reuse.",
    "",
    "Components:",
    list,
  ].join("\n");
}
