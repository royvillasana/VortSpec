import { describe, it, expect } from "vitest";
import { componentMetadataSchema } from "./inspector";
import { INDEX_PATH, USAGE_PATH, TOKENS_PATH } from "./artifact-paths";
import {
  approxProtocolTokens,
  atomicHierarchyRules,
  deepTracingRules,
  loadOnceRules,
  metadataSchemaRules,
  queryProtocolDocuments,
  PROTOCOL_BUDGET,
  type ProtocolContext,
} from "./query-protocols";

const context = (over: Partial<ProtocolContext> = {}): ProtocolContext => ({
  framework: "react",
  componentDir: "src/components",
  tiers: ["organism", "molecule", "atom"],
  componentCount: 42,
  generatedAt: "2026-08-07T00:00:00.000Z",
  ...over,
});

describe("metadata-schema.md", () => {
  it("documents EVERY section the schema declares", () => {
    // The drift guard. Adding a section to `componentMetadataSchema` without writing its rule makes
    // this fail — the alternative is a schema doc that silently stops describing the schema.
    const document = metadataSchemaRules(context());
    for (const key of Object.keys(componentMetadataSchema.shape)) {
      expect(document, `section \`${key}\` is missing from the rules`).toContain(`**\`${key}\`**`);
      expect(document, `section \`${key}\` has no prose`).not.toContain(
        `**\`${key}\`** — (undocumented section)`,
      );
    }
  });

  it("says a missing section is unknown rather than permission", () => {
    expect(metadataSchemaRules(context())).toContain("unknown, not permission");
  });

  it("warns that a migrated record's gaps were never authored", () => {
    expect(metadataSchemaRules(context())).toContain("EMPTY because nobody wrote them");
  });
});

describe("atomic-hierarchy.md", () => {
  it("teaches selection in the order of the tiers the roster actually has", () => {
    const document = atomicHierarchyRules(context({ tiers: ["organism", "molecule", "atom"] }));
    expect(document).toContain("`organism` → `molecule` → `atom`");
  });

  it("does NOT invent tiers the roster lacks", () => {
    // A flat roster told to "start at the organism" sends the agent looking for something that is
    // not there — it pays the tokens and finds nothing.
    const document = atomicHierarchyRules(context({ tiers: ["atom"] }));
    expect(document).not.toContain("organism");
    expect(document).not.toContain("molecule");
  });

  it("refuses to imply a hierarchy when no tiers are recorded", () => {
    const document = atomicHierarchyRules(context({ tiers: [] }));
    expect(document).toContain("no atomic tiers");
    expect(document).toContain("do NOT invent a hierarchy");
    expect(document).not.toContain("Select in this order");
  });

  it("names the project's own component directory", () => {
    expect(atomicHierarchyRules(context({ componentDir: "app/ui" }))).toContain("`app/ui`");
  });
});

describe("deep-tracing.md", () => {
  it("routes each question to the artifact that answers it", () => {
    const document = deepTracingRules(context());
    expect(document).toContain(INDEX_PATH);
    expect(document).toContain(USAGE_PATH);
    expect(document).toContain(TOKENS_PATH);
  });

  it("requires a visited set, because the graph can cycle", () => {
    expect(deepTracingRules(context())).toContain("visited set");
  });

  it("explains that import count and instance count are different questions", () => {
    const document = deepTracingRules(context());
    expect(document).toContain("importCount");
    expect(document).toContain("instanceCount");
    expect(document).toContain("imported-never-rendered");
  });
});

describe("load-once.md", () => {
  it("carves out the one case where re-reading is correct", () => {
    // Without this the rule is actively harmful: an agent that edits a file and then trusts the
    // pre-edit index writes its next change against code that no longer exists.
    const document = loadOnceRules(context());
    expect(document).toContain("if you have EDITED a file, re-read that file");
  });

  it("names the roster size so 'do not load every record' has a scale", () => {
    expect(loadOnceRules(context({ componentCount: 42 }))).toContain("42-component roster");
  });
});

describe("the bundle", () => {
  it("writes exactly the four documents the proposal names", () => {
    expect(Object.keys(queryProtocolDocuments(context())).sort()).toEqual([
      "atomic-hierarchy.md",
      "deep-tracing.md",
      "load-once.md",
      "metadata-schema.md",
    ]);
  });

  it("stays inside the token budget it is read against on every run", () => {
    const cost = approxProtocolTokens(queryProtocolDocuments(context()));
    expect(cost).toBeLessThanOrEqual(PROTOCOL_BUDGET);
  });

  it("stamps each document with the project it was generated for", () => {
    for (const document of Object.values(queryProtocolDocuments(context({ framework: "svelte" })))) {
      expect(document).toContain("svelte");
      expect(document).toContain("Do not hand-edit");
    }
  });

  it("says so rather than guessing when no framework is configured", () => {
    const documents = queryProtocolDocuments(context({ framework: null }));
    expect(documents["load-once.md"]).toContain("unconfigured");
  });

  it("is deterministic — the same context produces byte-identical documents", () => {
    expect(queryProtocolDocuments(context())).toEqual(queryProtocolDocuments(context()));
  });
});
