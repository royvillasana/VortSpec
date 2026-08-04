import { describe, expect, it } from "vitest";
import {
  COMPONENT_TOKEN_PREFIX,
  auditComponentTokenCoverage,
  COMPONENT_TOKEN_DOC_PATH,
  buildComponentTokenNamingDoc,
  componentTokenExtractionClause,
  isCanonicalComponentTokenName,
  linkComponentTokenNamingInEntryDoc,
  componentTokenName,
  declaredCustomProperties,
  isComponentScopedPath,
} from "./component-tokens";

describe("isComponentScopedPath", () => {
  it("accepts a component-namespaced path", () => {
    expect(isComponentScopedPath("Components/Accordion/Active Item Header Background")).toBe(true);
  });

  // The negative polarity: the predicate must come back FALSE for real global tokens,
  // otherwise every audit below is measuring nothing.
  it("rejects global tokens and bare group names", () => {
    for (const p of [
      "color/neutral/100",
      "spacing/16",
      "Body/Regular",
      "Components/Accordion", // a group, not a token
      "Components", // just the namespace
      "",
    ]) {
      expect(isComponentScopedPath(p)).toBe(false);
    }
  });

  it("does not match a namespace that merely starts with the word", () => {
    expect(isComponentScopedPath("ComponentStyles/Accordion/Background")).toBe(false);
  });
});

describe("componentTokenName", () => {
  it("maps the real Figma path to the canonical property", () => {
    expect(componentTokenName("Components/Accordion/Active Item Header Background")).toEqual({
      component: "accordion",
      slot: "active-item-header-background",
      name: "--component-accordion-active-item-header-background",
    });
  });

  it("flattens nested slot groups", () => {
    expect(componentTokenName("Components/Button/Border/Hover")?.name).toBe(
      "--component-button-border-hover",
    );
  });

  it("tolerates the punctuation designers actually use", () => {
    const cases: Array<[string, string]> = [
      ["Components/Avatar Group/Overlap XS", "--component-avatar-group-overlap-xs"],
      ["Components/List_Group/font size sm", "--component-list-group-font-size-sm"],
      ["Components/Progress/height (sm)", "--component-progress-height-sm"],
      ["Components/Switch/thumb — diameter", "--component-switch-thumb-diameter"],
    ];
    for (const [path, expected] of cases) {
      expect(componentTokenName(path)?.name).toBe(expected);
    }
  });

  it("returns null rather than inventing a name for a non-component path", () => {
    expect(componentTokenName("color/neutral/100")).toBeNull();
    expect(componentTokenName("Components/Accordion")).toBeNull();
  });

  it("returns null when a segment slugifies to nothing", () => {
    expect(componentTokenName("Components/???/!!!")).toBeNull();
  });

  // Thor asked for Avatar Group / List Group round-trips. They CANNOT round-trip, and this
  // records why so nobody reintroduces an inverse: the join uses the same `-` that appears
  // inside each half, so the boundary is destroyed at emit time and two different Figma paths
  // produce one identical property. Any splitting rule is wrong for some input.
  it("is NOT injective — two distinct Figma paths emit the same property", () => {
    const a = componentTokenName("Components/Avatar Group/Overlap XS")!;
    const b = componentTokenName("Components/Avatar/Group Overlap XS")!;
    expect(a.name).toBe(b.name);
    // The forward mapping still reports the TRUE component for each path; only the emitted
    // string is lossy. That is why forward is safe to depend on and reverse is not.
    expect(a.component).toBe("avatar-group");
    expect(b.component).toBe("avatar");
  });

  it("multi-word components map forward correctly", () => {
    expect(componentTokenName("Components/Avatar Group/Overlap XS")!.component).toBe("avatar-group");
    expect(componentTokenName("Components/List Group/Font Size SM")!.component).toBe("list-group");
  });
});

describe("isCanonicalComponentTokenName", () => {
  it("is false for the real off-convention properties in that token file", () => {
    for (const p of [
      "--switch-width",
      "--progress-height-sm",
      "--popover-arrow-size",
      "--font-size-list-group-sm",
      "--spacing-overlap-xs",
      "--shimmer-animation-offset",
      "--color-neutral-100",
    ]) {
      expect(isCanonicalComponentTokenName(p)).toBe(false);
    }
  });

  it("is false for a prefix with no slot", () => {
    expect(isCanonicalComponentTokenName("--component-accordion")).toBe(false);
    expect(isCanonicalComponentTokenName("--component-accordion-")).toBe(false);
    expect(isCanonicalComponentTokenName("--component--slot")).toBe(false);
  });

  it("is true for canonical names, including multi-word components", () => {
    expect(isCanonicalComponentTokenName("--component-button-primary-background-hover")).toBe(true);
    expect(isCanonicalComponentTokenName(componentTokenName("Components/Avatar Group/Overlap XS")!.name)).toBe(true);
  });
});

describe("declaredCustomProperties", () => {
  it("finds declarations and ignores usages", () => {
    const css = `:root {
      --a: 1px;
      --b: var(--a);
    }
    .x { color: var(--never-declared); }`;
    const found = declaredCustomProperties(css);
    expect(found).toContain("--a");
    expect(found).toContain("--b");
    // The measurement must come back FALSE for a property that is only ever read.
    expect(found).not.toContain("--never-declared");
  });

  it("dedupes a property declared in several contexts", () => {
    const css = `:root { --c: #fff; } [data-theme="dark"] { --c: #000; }`;
    expect(declaredCustomProperties(css).filter((p) => p === "--c")).toHaveLength(1);
  });
});

describe("auditComponentTokenCoverage — measured against the real TokenUpdate file", () => {
  /** Figma paths confirmed live on file ojko9pGfsDAvmUf2DA38d2 (node 1:4917). */
  const FIGMA_PATHS = [
    "Components/Accordion/Active Item Header Background",
    "Components/Accordion/Active Item Header Text Color",
    "Components/Accordion/Active Header Text",
    "Components/Button/primary background hover",
    // Globals, which must be ignored rather than counted.
    "color/neutral/100",
    "spacing/16",
    "Body/Regular",
  ];

  /** Properties verbatim from TokenUpdate/src/styles/tokens.css. */
  const CSS = `:root {
    --color-neutral-100: var(--primitive-neutral-100);
    --color-brand-primary: var(--brand-primary-500);
    --component-button-primary-background-hover: #066173;
    --switch-width: 36px;
    --progress-height-sm: 4px;
    --popover-arrow-size: 8px;
  }`;

  it("reports the accordion tokens as missing, by canonical name", () => {
    const r = auditComponentTokenCoverage(FIGMA_PATHS, CSS);
    expect(r.missing.map((m) => m.name)).toEqual([
      "--component-accordion-active-item-header-background",
      "--component-accordion-active-item-header-text-color",
      "--component-accordion-active-header-text",
    ]);
  });

  it("reports the button token as covered — the audit is not just always-missing", () => {
    const r = auditComponentTokenCoverage(FIGMA_PATHS, CSS);
    expect(r.covered.map((c) => c.name)).toEqual(["--component-button-primary-background-hover"]);
  });

  it("ignores global Figma paths entirely", () => {
    const r = auditComponentTokenCoverage(FIGMA_PATHS, CSS);
    const all = [...r.missing, ...r.covered].map((t) => t.name);
    for (const name of all) expect(name.startsWith(COMPONENT_TOKEN_PREFIX)).toBe(true);
    expect(all).toHaveLength(4); // 3 accordion + 1 button, not 7
  });

  it("comes back completely clean when the file is complete", () => {
    const complete = `:root {
      --component-accordion-active-item-header-background: #CEE4E9;
      --component-accordion-active-item-header-text-color: #076D82;
      --component-accordion-active-header-text: #03303A;
      --component-button-primary-background-hover: #066173;
    }`;
    const r = auditComponentTokenCoverage(FIGMA_PATHS, complete);
    expect(r.missing).toEqual([]);
    expect(r.covered).toHaveLength(4);
    expect(r.offConventionCandidates).toEqual([]);
  });

  it("dedupes a Figma path that appears on several nodes", () => {
    const dupes = [
      "Components/Accordion/Active Item Header Background",
      "Components/Accordion/Active Item Header Background",
    ];
    expect(auditComponentTokenCoverage(dupes, CSS).missing).toHaveLength(1);
  });

  it("surfaces a real off-convention scheme as a CANDIDATE", () => {
    const paths = ["Components/Switch/width"];
    const r = auditComponentTokenCoverage(paths, CSS);
    expect(r.missing.map((m) => m.name)).toEqual(["--component-switch-width"]);
    expect(r.offConventionCandidates).toEqual([
      { component: "switch", properties: ["--switch-width"] },
    ]);
  });

  // Thor's finding 2, both directions. The field is a LEAD, not evidence, and the tests must
  // say so in both polarities rather than only disclosing the false negatives.
  it("false POSITIVE direction: an unrelated property sharing the slug is still returned", () => {
    const css = `:root { --transition-switch-duration: 200ms; }`;
    const r = auditComponentTokenCoverage(["Components/Switch/width"], css);
    // Bounded matching does not make this a finding — it is a candidate, and the test records
    // that a caller must not treat it as proof Switch declares tokens another way.
    expect(r.offConventionCandidates).toEqual([
      { component: "switch", properties: ["--transition-switch-duration"] },
    ]);
  });

  it("bounded matching keeps a merely-prefixed word out", () => {
    const css = `:root { --progressive-disclosure-gap: 4px; }`;
    const r = auditComponentTokenCoverage(["Components/Progress/height sm"], css);
    expect(r.offConventionCandidates).toEqual([]);
  });

  it("false NEGATIVE direction: a scheme naming no component is invisible", () => {
    // Avatar Group's real tokens are `--spacing-overlap-*` — no slug, so nothing can find them.
    const css = `:root { --spacing-overlap-xs: 2px; }`;
    const r = auditComponentTokenCoverage(["Components/Avatar Group/Overlap XS"], css);
    expect(r.offConventionCandidates).toEqual([]);
    expect(r.missing.map((m) => m.name)).toEqual(["--component-avatar-group-overlap-xs"]);
  });

  it("does not flag off-convention when the canonical name is the only one present", () => {
    const r = auditComponentTokenCoverage(["Components/Button/primary background hover"], CSS);
    expect(r.offConventionCandidates).toEqual([]);
  });

  it("empty inputs produce an empty report, not a crash", () => {
    expect(auditComponentTokenCoverage([], "")).toEqual({
      missing: [],
      covered: [],
      offConventionCandidates: [],
    });
  });
});

describe("componentTokenExtractionClause", () => {
  const clause = componentTokenExtractionClause();

  // The whole point of rendering the clause from the mapping: the examples an agent reads
  // must BE the function's output, not a hand-copied restatement that can rot beside it.
  it("carries the mapping function's real output, not a restatement", () => {
    const ex = componentTokenName("Components/Accordion/Active Item Header Background")!;
    const nested = componentTokenName("Components/Button/Border/Hover")!;
    expect(clause).toContain(ex.name);
    expect(clause).toContain(nested.name);
    // The exact defect that produced this work.
    expect(clause).toContain("--component-accordion-active-item-header-background");
  });

  it("names the canonical prefix and the namespace it reads from", () => {
    expect(clause).toContain(COMPONENT_TOKEN_PREFIX);
    expect(clause).toContain("Components/");
  });

  it("names the real off-convention schemes as the thing not to do", () => {
    // These are verbatim from the measured token file — the clause must warn using real
    // examples, so an agent recognises the shape rather than an invented one.
    for (const bad of ["--switch-width", "--progress-height-sm", "--spacing-overlap-xs"]) {
      expect(clause).toContain(bad);
    }
  });

  it("requires additive naming rather than renaming an existing token in place", () => {
    expect(clause).toContain("ADD the canonical name alongside");
  });

  it("requires per-component completeness to be reported, not assumed", () => {
    expect(clause).toContain("Completeness is per component");
    expect(clause).toContain("never let a partial extraction read as a complete one");
  });

  it("does not restate the build-side near-colour rule that lives in sdd-prompts", () => {
    // Composition, not duplication: two copies of one rule is how they drift.
    expect(clause).not.toContain("TOKEN-BLOCKED");
    expect(clause).not.toContain("four match rules");
  });
});

describe("buildComponentTokenNamingDoc", () => {
  const doc = buildComponentTokenNamingDoc();

  it("renders its examples from the mapping, not from a copy", () => {
    expect(doc).toContain(componentTokenName("Components/Accordion/Active Item Header Background")!.name);
    expect(doc).toContain(componentTokenName("Components/Button/Border/Hover")!.name);
  });

  it("marks itself generated so a hand edit is not mistaken for the contract", () => {
    expect(doc).toContain("GENERATED by VortSpec");
  });

  it("says to add the canonical name alongside rather than rename in place", () => {
    expect(doc).toContain("ADD the canonical name alongside");
  });
});

describe("linkComponentTokenNamingInEntryDoc", () => {
  it("inserts the link above Component Standards so it is read first", () => {
    const md = "## Standards\n\n- [Component Standards](.sdd-de/docs/component-standards.md)\n";
    const out = linkComponentTokenNamingInEntryDoc(md);
    expect(out).toContain(COMPONENT_TOKEN_DOC_PATH);
    expect(out.indexOf(COMPONENT_TOKEN_DOC_PATH)).toBeLessThan(out.indexOf("- [Component Standards]"));
  });

  it("is idempotent — resync must not duplicate the line", () => {
    const md = "## Standards\n\n- [Component Standards](x)\n";
    const once = linkComponentTokenNamingInEntryDoc(md);
    expect(linkComponentTokenNamingInEntryDoc(once)).toBe(once);
    expect(once.split(COMPONENT_TOKEN_DOC_PATH)).toHaveLength(2);
  });

  it("falls back to appending a Standards section when the list is absent", () => {
    const out = linkComponentTokenNamingInEntryDoc("# Some Toolkit Readme\n");
    expect(out).toContain("## Standards");
    expect(out).toContain(COMPONENT_TOKEN_DOC_PATH);
  });
});
