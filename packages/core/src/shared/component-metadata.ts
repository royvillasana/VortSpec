import {
  componentMetadataSchema,
  type ComponentMetadata,
} from "./inspector";

/**
 * Reading a component metadata record: the legacy migration and the completeness derivation —
 * OpenSpec change: agentic-design-system, task 1.2.
 *
 * PURE — no fs. The fs half lives in `main/inspector/component-metadata.ts`.
 *
 * Two rules govern everything here:
 *
 * 1. **Migration happens on READ, and only in memory.** A legacy four-field record is widened every
 *    time it is read and is never written back in that state. Rewriting it on disk would be worse
 *    than leaving it: the file would then look like an authored nine-section record while carrying
 *    anti-patterns whose `reason` and `alternative` are empty strings nobody wrote.
 * 2. **A migrated record is INCOMPLETE by declaration.** Not because a field count says so, but
 *    because the information genuinely is not there. Reporting it as complete would hide the
 *    regeneration that is the actual fix.
 */

/** The four-field record this schema replaced. Recognised structurally, never by a version field. */
interface LegacyComponentMetadata {
  name?: unknown;
  summary?: unknown;
  usage?: unknown;
  patterns?: unknown;
  antiPatterns?: unknown;
}

/**
 * Whether a raw record is the LEGACY shape.
 *
 * Keyed on `summary` being a string, or `usage` being an array — the two fields that changed
 * TYPE rather than merely moving. The new schema has no `summary` at all and its `usage` is an
 * object, so neither can appear on a current record; a file carrying either is legacy no matter
 * what else it holds. Structural detection rather than a version stamp because the records already
 * on disk have no version to read.
 */
export function isLegacyMetadata(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as LegacyComponentMetadata;
  return typeof record.summary === "string" || Array.isArray(record.usage);
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * Widen a legacy record into the nine-section shape.
 *
 * The mappings are the ones task 1.2 fixes: `summary` → `identity.description`, `usage[]` →
 * `usage.useCases`, `patterns[]` → `usage.commonPatterns`, and `antiPatterns[]` → triplets whose
 * `reason` and `alternative` are EMPTY. That last one is the lossy step and it is deliberate: the
 * legacy sentence says what not to do and never said why or what instead, so inventing either would
 * put words in the record that no one wrote. The emptiness is the signal `isMetadataComplete` reads.
 */
export function migrateComponentMetadata(raw: unknown): ComponentMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as LegacyComponentMetadata;
  const name = typeof record.name === "string" ? record.name : "";
  if (!name) return null;

  const parsed = componentMetadataSchema.safeParse({
    name,
    identity: {
      name,
      description: typeof record.summary === "string" ? record.summary : "",
    },
    usage: {
      useCases: strings(record.usage),
      // A legacy "pattern" is a sentence, so it becomes a NAMED pattern with no code. `code` is what
      // makes a pattern copy-pasteable, and there was never any to carry over.
      commonPatterns: strings(record.patterns).map((pattern) => ({
        name: pattern,
        description: "",
        code: "",
      })),
      antiPatterns: strings(record.antiPatterns).map((scenario) => ({
        scenario,
        reason: "",
        alternative: "",
      })),
    },
    origin: "migrated",
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Parse a raw record, migrating a legacy one on the way through. Null when it is neither.
 *
 * The single read boundary, so no caller has to know which shape is on disk.
 */
export function parseComponentMetadata(raw: unknown): ComponentMetadata | null {
  if (isLegacyMetadata(raw)) return migrateComponentMetadata(raw);
  const parsed = componentMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Why a record is not complete, in the order a person would fix them. */
export type MetadataGap =
  | "migrated"
  | "no-description"
  | "no-use-cases"
  | "no-selection-criteria"
  | "no-anti-pattern-alternatives";

/**
 * The gaps that make a record incomplete, empty when it is complete.
 *
 * Returned rather than a bare boolean because "incomplete" on its own is not actionable — the UI
 * and the generation prompt both need to say WHICH part is missing. The bar is deliberately about
 * what changes a model's output:
 *
 *  - a description, or the record identifies nothing;
 *  - use cases, or there is no signal for WHEN to reach for it;
 *  - selection criteria, the field a composer reads first;
 *  - an `alternative` on every anti-pattern — an anti-pattern without one is a warning, not a
 *    correction, and correcting is the entire purpose.
 *
 * Variants, props, tokens and accessibility are NOT required. A component can legitimately have no
 * variants and no object props, and demanding them would report a perfectly good record as broken.
 */
export function metadataGaps(metadata: ComponentMetadata): MetadataGap[] {
  const gaps: MetadataGap[] = [];
  if (metadata.origin === "migrated") gaps.push("migrated");
  if (!metadata.identity.description.trim()) gaps.push("no-description");
  if (metadata.usage.useCases.length === 0) gaps.push("no-use-cases");
  if ((metadata.aiHints?.selectionCriteria.length ?? 0) === 0) gaps.push("no-selection-criteria");
  if (metadata.usage.antiPatterns.some((pattern) => !pattern.alternative.trim()))
    gaps.push("no-anti-pattern-alternatives");
  return gaps;
}

/** Whether a record carries everything that actually changes an agent's output. */
export function isMetadataComplete(metadata: ComponentMetadata): boolean {
  return metadataGaps(metadata).length === 0;
}

/** A gap → the sentence shown to a person. */
export function describeMetadataGap(gap: MetadataGap): string {
  switch (gap) {
    case "migrated":
      return "migrated from the legacy four-field record — regenerate to fill the new sections";
    case "no-description":
      return "no description — the record identifies nothing";
    case "no-use-cases":
      return "no use cases — nothing says when to reach for this component";
    case "no-selection-criteria":
      return "no AI selection criteria — a composer has no signal for choosing this over a sibling";
    case "no-anti-pattern-alternatives":
      return "an anti-pattern has no alternative — it warns without correcting";
  }
}
