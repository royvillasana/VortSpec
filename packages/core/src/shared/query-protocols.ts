import { componentMetadataSchema } from "./inspector";
import { INDEX_PATH, USAGE_PATH, TOKENS_PATH } from "./artifact-paths";

/**
 * The query-protocol layer — OpenSpec change: agentic-design-system, task 3.1.
 *
 * Four rule documents written next to the index, teaching an agent to NAVIGATE the artifacts from
 * group 2 instead of exploring the repository. Layer 3 of the reference architecture: the index says
 * what exists, the metadata says what it means, and these say how to read them.
 *
 * PURE — no fs. `main/inspector/query-protocols.ts` writes them.
 *
 * Three constraints shape every document here:
 *
 * 1. **Generated, not vendored.** Each one names this project's real framework, component directory,
 *    artifact paths and the tiers actually present. A rule document that instructs an agent to select
 *    "organism → molecule → atom" on a roster with no organisms teaches a hierarchy that does not
 *    exist, and the agent will go looking for one.
 * 2. **Bounded.** These are read on EVERY grounded run. The index earns its keep by costing less than
 *    the exploration it replaces, and rules that cost 2,000 tokens spend the savings before the run
 *    starts. `PROTOCOL_BUDGET` is asserted by a test, not merely hoped for.
 * 3. **Derived where drift is possible.** `metadata-schema.md` enumerates its sections from
 *    `componentMetadataSchema` itself, so a section added to the schema cannot silently go
 *    undocumented — the doc gains the name automatically and the test demands the prose.
 */

/** What the rules need to know about the project they describe. */
export interface ProtocolContext {
  /** The configured framework, or null when unconfigured — the docs say so rather than guessing. */
  framework: string | null;
  /** Project-relative component root, e.g. `src/components`. */
  componentDir: string;
  /** The atomic tiers ACTUALLY present in this roster, most complex first. */
  tiers: string[];
  /** How many design-system components the index recorded. */
  componentCount: number;
  generatedAt: string;
}

/**
 * Rough token ceiling for the whole bundle, asserted in tests.
 *
 * **Raised from 1,400 to 1,800 when `arc-phases.md` was added (task 9b.2), and the old number's
 * stated reason was wrong.** It claimed to be "a third of the digest" against a ~1,591-token digest;
 * 1,400 is 88% of that, so the constant never matched its own justification. Recording the error
 * rather than quietly re-deriving a ratio that fits.
 *
 * What the ceiling actually guards is unchecked GROWTH — five documents that each grow a paragraph
 * per change is how a rules bundle reaches 5,000 tokens without anyone deciding to spend them. The
 * size is justified by measurement instead of by ratio: the 10-trial re-run put the grounded arm at
 * 36.3k tokens against the control's 33.8k, with 3.0 tool calls versus 6.6 and 25.0s versus 52.6s,
 * and 100% accuracy versus 75%. At this size the bundle is paying for itself.
 *
 * Adding a sixth document should mean deleting or merging something, not raising this again — the
 * arc-phases addition removed deep-tracing's duplicate routing table for exactly that reason.
 */
export const PROTOCOL_BUDGET = 1800;

/** Cheap 4-chars-per-token estimate — the same one the benchmark uses, for comparable numbers. */
export function approxProtocolTokens(documents: Record<string, string>): number {
  return Math.ceil(Object.values(documents).join("").length / 4);
}

/**
 * One paragraph per metadata section, keyed by the schema's own field names.
 *
 * Keyed rather than inlined so `metadataSchemaRules` can iterate `componentMetadataSchema.shape` and
 * a new section shows up as a missing key — a test failure — instead of an undocumented field.
 */
const SECTION_RULES: Record<string, string> = {
  name: "The roster key. Join on this, not on the display name.",
  identity:
    "Name, description, tier. Read first: if the description rules the component out, no other " +
    "section needs loading.",
  usage:
    "`useCases`, `commonPatterns`, `antiPatterns`. Each anti-pattern carries a `reason` and an " +
    "`alternative`; when one matches what you are about to build, follow the alternative.",
  variants:
    "Each axis/value carries a `purpose`. Choose by purpose, never by name — `secondary` does not " +
    "say when to use it.",
  props: "The declared API. Prefer a documented prop over `className` for anything the prop covers.",
  composition: "`slots`, `itemShape`, `worksWith` — a composition answer without tracing the graph.",
  behavior: "States and interactions it already handles — do not reimplement them outside it.",
  accessibility: "Requirements, not suggestions. Generated usage that drops them is incomplete.",
  designTokens:
    "Token groups consumed. Check `" + TOKENS_PATH + "` for other consumers before changing one.",
  aiHints:
    "`selectionCriteria` answers *when do I reach for this*, `keywords` match a brief's wording, " +
    "`generationRules` constrain generated usage.",
  origin:
    "`migrated` is a legacy record widened on read: anti-pattern reasons and alternatives are EMPTY " +
    "because nobody wrote them. Treat the gaps as unknown, never as 'no constraint'.",
};

/** `metadata-schema.md` — the contract of group 1, enumerated from the schema itself. */
export function metadataSchemaRules(context: ProtocolContext): string {
  const sections = Object.keys(componentMetadataSchema.shape)
    .map((key) => `- **\`${key}\`** — ${SECTION_RULES[key] ?? "(undocumented section)"}`)
    .join("\n");
  return `# Metadata schema

A component metadata record describes one component in sections. Load one when you have narrowed to
a candidate — not while surveying.

${sections}

## Reading rules

- **A missing section is unknown, not permission.** No \`accessibility\` notes does not mean the
  component has no accessibility requirements; it means the record does not say.
- **Do not infer a section from the source.** Opening the component file to answer what a section
  should have answered hides the gap. Say the record is incomplete instead, so it gets regenerated.
${footer(context)}`;
}

/** `atomic-hierarchy.md` — dependency direction and selection order, over the tiers really present. */
export function atomicHierarchyRules(context: ProtocolContext): string {
  const tiers = context.tiers.length ? context.tiers : [];
  const order = tiers.length
    ? tiers.map((tier) => `\`${tier}\``).join(" → ")
    : "(no tiers recorded — select by name and description, and do not assume a hierarchy)";

  const selection = tiers.length
    ? `Select in this order: ${order}.

Start at the most composed tier that could satisfy the requirement and work down. A ${tiers[0]} that
already does the job is one decision; rebuilding it from ${tiers[tiers.length - 1]}s is many, and each
is a chance to diverge.`
    : `This roster records no atomic tiers, so there is no order to follow. Select by description and by
\`aiHints.selectionCriteria\`, and do NOT invent a hierarchy — treating a component as a "primitive"
because its name sounds small is how shadow implementations start.`;

  return `# Atomic hierarchy

${selection}

## Dependency direction

Dependencies point DOWN the hierarchy${tiers.length > 1 ? ` (${order})` : ""} and never back up. A
component must not import something more composed than itself; if it needs to, the composition belongs
in the caller.

- Building something not in \`${context.componentDir}\`? Compose it from what IS, in the caller.
- Reaching for a raw element where a design-system component exists is a **shadow implementation**.
  \`${USAGE_PATH}\` records the ones already found; do not add another.
${footer(context)}`;
}

/**
 * `arc-phases.md` — the vocabulary that decides WHICH layer answers a question (task 9b.2).
 *
 * Adopted from the reference board, and it is the frame the benchmark scores against: each of the
 * four questions belongs to a phase. Naming the phase is what turns "should I read the index or
 * explore the repository" from a judgement call into a lookup — a run that can classify its own
 * question stops re-deriving what an artifact already states.
 */
export function arcPhaseRules(context: ProtocolContext): string {
  return `# ARC phases

Every question about the design system is one of three. Classify it FIRST — the phase decides which
artifact answers it, and reaching for the filesystem is only correct in the last case.

| Phase | The question | Answered by |
|---|---|---|
| **Audit** | What EXISTS? counts, inventory, coverage | \`${INDEX_PATH}\` |
| **Report** | How does it RELATE? what uses what, what a page renders | \`${USAGE_PATH}\`, \`${TOKENS_PATH}\` |
| **Compose** | What should I BUILD with? selection, variants, reuse | metadata records + the two above |

## Why the phase matters

- **Audit answers are already computed.** Counting components by listing files gives a different
  number from the index, more slowly.
- **Report answers are bidirectional**, so "what depends on this" needs no search. Grepping a name
  finds mentions, not renders — which is where reuse gets undercounted.
- **Compose is the only phase that reads a metadata record.** Load one for a candidate, never for
  the roster.

A question fitting no phase is about SOURCE CODE, not the design system — read the file. That is the
one case where exploring is right.
${footer(context)}`;
}

/** \`deep-tracing.md\` — how to answer relationship questions from the index rather than by reading. */
export function deepTracingRules(context: ProtocolContext): string {
  return `# Deep tracing

\`${USAGE_PATH}\` records, per component, \`uses\` (what it renders), \`usedBy\` (what renders it) and
\`importedBy\`. Both directions are already computed. Trace them; do not grep. (Which artifact answers
which question is in \`arc-phases.md\`.)

## Recursive traversal

For the full subtree beneath a component, follow \`uses\` transitively and **keep a visited set**.
The graph can contain cycles; a traversal without one does not terminate.

Stop as soon as the question is answered. "Does X depend on Y at all" ends at the first hit.

## Reading the counts

- \`importCount\` counts FILES importing the component. \`instanceCount\` counts renders. They differ,
  and the difference is meaningful.
- \`imported-never-rendered\` means an import exists with no render: usually a leftover import, not adoption.
- \`unimported\` on a design-system component means nothing uses it — a finding, not an index error.
${footer(context)}`;
}

/** `load-once.md` — the discipline that makes the rest of the layer pay off. */
export function loadOnceRules(context: ProtocolContext): string {
  return `# Load once

Everything you read stays in context for the whole run. Re-reading costs full price for text you have.

- **Never re-read \`${INDEX_PATH}\`, \`${USAGE_PATH}\` or \`${TOKENS_PATH}\`.** They do not change while
  the run is executing.
- **A grounded run is handed a digest before it starts.** Check it first — the roster and token map
  are usually already there.
- **Load a metadata record once, when the component is a real candidate** — not for every name on a
  ${context.componentCount}-component roster.
- **Do not re-derive what the index states.** Counting usages by opening sources is a worse answer
  than \`${USAGE_PATH}\` at many times the cost.

The one exception: if you have EDITED a file, re-read that file. The index is not rebuilt mid-run, so
after an edit it describes the code as it was — stale for the paths you touched, current elsewhere.
${footer(context)}`;
}

function footer(context: ProtocolContext): string {
  const framework = context.framework ?? "unconfigured";
  return `
---
Generated by VortSpec for this project (${framework}, ${context.componentCount} components in
\`${context.componentDir}\`) at ${context.generatedAt}. Do not hand-edit — rewritten on each build.`;
}

/** The four documents, keyed by their file name under `.vortspec/ai/rules/`. */
export function queryProtocolDocuments(context: ProtocolContext): Record<string, string> {
  return {
    "metadata-schema.md": metadataSchemaRules(context),
    "atomic-hierarchy.md": atomicHierarchyRules(context),
    "arc-phases.md": arcPhaseRules(context),
    "deep-tracing.md": deepTracingRules(context),
    "load-once.md": loadOnceRules(context),
  };
}
