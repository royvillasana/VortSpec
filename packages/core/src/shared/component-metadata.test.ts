import { describe, expect, it } from "vitest";
import { componentMetadataSchema, type ComponentMetadata } from "./inspector";
import {
  describeMetadataGap,
  isLegacyMetadata,
  isMetadataComplete,
  metadataGaps,
  migrateComponentMetadata,
  parseComponentMetadata,
} from "./component-metadata";

/**
 * The widened metadata schema and its legacy migration — OpenSpec change: agentic-design-system,
 * tasks 1.1 and 1.2. Task 1.2 asks for both directions to be tested: a legacy record must widen
 * without loss of what it DID say, and must not gain completeness it never had.
 */

const LEGACY = {
  name: "Button",
  summary: "A clickable action trigger.",
  usage: ["Primary page actions", "Form submission"],
  patterns: ["Pair with an icon for destructive actions"],
  antiPatterns: ["Don't use Button for navigation"],
};

/** A fully authored record — what a regenerated one looks like. */
function authored(over: Partial<ComponentMetadata> = {}): ComponentMetadata {
  return componentMetadataSchema.parse({
    name: "Button",
    identity: { name: "Button", category: "atom", type: "interactive", description: "A clickable action trigger." },
    usage: {
      useCases: ["Primary page actions"],
      commonPatterns: [{ name: "With icon", description: "", code: "<Button icon={<Plus />} />" }],
      antiPatterns: [
        { scenario: "Navigating to another page", reason: "Buttons are not links", alternative: "Use Link" },
      ],
    },
    aiHints: { context: "", selectionCriteria: ["The action mutates state"], keywords: [], generationRules: [] },
    ...over,
  });
}

describe("recognising a legacy record (task 1.2)", () => {
  it("keys on the fields that changed TYPE, not on a version stamp", () => {
    // The records already on disk have no version to read, so detection has to be structural.
    expect(isLegacyMetadata(LEGACY)).toBe(true);
    expect(isLegacyMetadata({ name: "X", summary: "s" })).toBe(true);
    expect(isLegacyMetadata({ name: "X", usage: [] })).toBe(true);
  });

  it("does not mistake a current record for a legacy one", () => {
    // `usage` exists in both shapes — an object in the new one, an array in the old.
    expect(isLegacyMetadata(authored())).toBe(false);
  });

  it("is not fooled by a non-object", () => {
    for (const value of [null, undefined, 42, "x", []]) expect(isLegacyMetadata(value)).toBe(false);
  });
});

describe("migrating a legacy record (task 1.2)", () => {
  const migrated = migrateComponentMetadata(LEGACY)!;

  it("carries every legacy field to its new home", () => {
    expect(migrated.identity.description).toBe("A clickable action trigger.");
    expect(migrated.usage.useCases).toEqual(["Primary page actions", "Form submission"]);
    expect(migrated.usage.commonPatterns.map((p) => p.name)).toEqual([
      "Pair with an icon for destructive actions",
    ]);
    expect(migrated.usage.antiPatterns[0].scenario).toBe("Don't use Button for navigation");
  });

  it("leaves the fields the legacy record never had EMPTY rather than inventing them", () => {
    // The lossy step, on purpose: the old sentence said what not to do and never why or what
    // instead. Filling those in would put words in the record that nobody wrote.
    expect(migrated.usage.antiPatterns[0].reason).toBe("");
    expect(migrated.usage.antiPatterns[0].alternative).toBe("");
    expect(migrated.usage.commonPatterns[0].code).toBe("");
  });

  it("marks the record as migrated, so it can never be mistaken for authored", () => {
    expect(migrated.origin).toBe("migrated");
  });

  it("refuses a record with no name — there is nothing to key it by", () => {
    expect(migrateComponentMetadata({ summary: "no name" })).toBeNull();
  });
});

describe("parseComponentMetadata is the one read boundary", () => {
  it("widens a legacy record and passes a current one through", () => {
    expect(parseComponentMetadata(LEGACY)?.origin).toBe("migrated");
    expect(parseComponentMetadata(authored())?.origin).toBeUndefined();
  });

  it("returns null for something that is neither", () => {
    expect(parseComponentMetadata({ nonsense: true })).toBeNull();
    expect(parseComponentMetadata("not an object")).toBeNull();
  });
});

describe("the schema rejects a bare-string anti-pattern (task 1.1)", () => {
  it("will not accept the legacy sentence in the new field", () => {
    // The rule that makes anti-patterns actionable: a sentence warns, a triplet corrects.
    const parsed = componentMetadataSchema.safeParse({
      name: "Button",
      identity: { name: "Button", description: "x" },
      usage: { antiPatterns: ["Don't use Button for navigation"] },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a triplet", () => {
    const parsed = componentMetadataSchema.safeParse({
      name: "Button",
      identity: { name: "Button", description: "x" },
      usage: { antiPatterns: [{ scenario: "Navigation", reason: "not a link", alternative: "Use Link" }] },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("completeness is about what changes a model's output (task 1.2)", () => {
  it("reports a migrated record as incomplete, whatever it happens to contain", () => {
    const migrated = migrateComponentMetadata(LEGACY)!;
    expect(isMetadataComplete(migrated)).toBe(false);
    expect(metadataGaps(migrated)).toContain("migrated");
    // …and names the substantive gaps too, not just the migration.
    expect(metadataGaps(migrated)).toContain("no-selection-criteria");
    expect(metadataGaps(migrated)).toContain("no-anti-pattern-alternatives");
  });

  it("reports a fully authored record as complete", () => {
    expect(metadataGaps(authored())).toEqual([]);
    expect(isMetadataComplete(authored())).toBe(true);
  });

  it("treats an anti-pattern with no alternative as incomplete — it warns without correcting", () => {
    const record = authored({
      usage: {
        useCases: ["Primary page actions"],
        commonPatterns: [],
        antiPatterns: [{ scenario: "Navigation", reason: "not a link", alternative: "" }],
      },
    });
    expect(metadataGaps(record)).toEqual(["no-anti-pattern-alternatives"]);
  });

  it("does NOT require variants, props, tokens or accessibility", () => {
    // A component can legitimately have no variants and no object props; demanding them would
    // report a perfectly good record as broken.
    const record = authored();
    expect(record.variants).toEqual([]);
    expect(record.props).toEqual([]);
    expect(isMetadataComplete(record)).toBe(true);
  });

  it("every gap has a sentence a person can act on", () => {
    const migrated = migrateComponentMetadata(LEGACY)!;
    for (const gap of metadataGaps(migrated)) {
      expect(describeMetadataGap(gap).length).toBeGreaterThan(10);
    }
  });
});
