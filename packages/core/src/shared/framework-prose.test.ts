import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A source-text check over PROSE — the thing the other suites structurally cannot reach.
 *
 * Every other assertion in this package reads a value: `idioms.variants`, a built doc, a prompt.
 * That protects what ships and leaves comments and JSDoc to human review — which is exactly where
 * both of Thor's catches on 2026-08-04 landed (my `FrameworkIdioms.variants` JSDoc, and Bumble's
 * `P4-mechanism` block comment in the Svelte fixture). Two reviewers, one round, same blind spot.
 *
 * A comment is not emitted, but it IS text on disk, so it can be read. This asserts the weaker
 * property that is still worth having: a claim we have refuted may appear only where it is
 * explicitly labelled WRONG. Restating one as if it were current fails the suite.
 *
 * SCOPE — deliberately these two production modules only. The test files state the refuted wording
 * on purpose (negative assertions that forbid it from the emitted profile), and the RESEARCH notes
 * record it as history; scanning either would flag correct prose.
 */
const SOURCES = ["./framework-profiles.ts", "./framework-docs.ts"] as const;

/**
 * The two mechanisms this package asserted about Svelte 5 and got wrong. Refuted by
 * RESEARCH/VORTSPEC_SVELTE_FIXTURE_2026-08-04.md (v1) and
 * RESEARCH/VORTSPEC_SVELTE_CSS_SCOPE_CONTROL_2026-08-04.md (v2), and pinned by the executable
 * `P4-scope-*` cases in `.scratch/svelte-fixture`.
 */
const REFUTED: readonly { id: string; re: RegExp }[] = [
  // v1 — helper-built classes are stripped and the component ships unstyled.
  { id: "v1-stripped", re: /(?<!nothing )(?<!not )(?:is|are) stripped/i },
  { id: "v1-unstyled", re: /ships? unstyled/i },
  // v2 — a dynamic class makes every selector unprovable and turns the analysis off.
  { id: "v2-every-selector", re: /every selector/i },
  { id: "v2-analysis-off", re: /analysis (?:is )?off/i },
  { id: "v2-pruning-disabled", re: /disabl\w*\s+(?:the\s+)?prun|prun\w*\s+is\s+disabled/i },
];

type Occurrence = { file: string; line: number; claim: string; text: string };

/**
 * Occurrences of a refuted claim that are NOT inside an explicit `WRONG` label.
 *
 * A `WRONG` on a line opens a labelled region that runs to the end of that comment paragraph —
 * so a wrapped bullet stays covered — and closes at `ACTUAL`, at a blank comment line, or at the
 * first line that is not a comment.
 *
 * ONE predicate, asserted in both polarities below. Bumble's mutant found that an always-true
 * detector survived a 10-case matrix where every case expected the same answer; per-case detectors
 * or one-sided expectations do not catch that.
 */
function unlabelledRefutedClaims(source: string, file: string): Occurrence[] {
  const found: Occurrence[] = [];
  let labelled = false;
  source.split("\n").forEach((text, i) => {
    if (/\bWRONG\b/.test(text)) labelled = true;
    else if (
      /\bACTUAL\b/.test(text) ||
      /^\s*(?:\/\/|\*)\s*$/.test(text) ||
      !/^\s*(?:\/\/|\/\*|\*)/.test(text)
    ) {
      labelled = false;
    }
    if (labelled) return;
    for (const { id, re } of REFUTED) {
      if (re.test(text)) found.push({ file, line: i + 1, claim: id, text: text.trim() });
    }
  });
  return found;
}

const readSource = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("refuted claims may only appear under a WRONG label", () => {
  it("finds none in the production sources", () => {
    for (const rel of SOURCES) {
      // toEqual([]) rather than a length check: a failure prints the offending lines verbatim,
      // which is the fix for my own near-miss — I believed a boolean computed from output I
      // never looked at, and it was reporting the opposite of the truth.
      expect(unlabelledRefutedClaims(readSource(rel), rel)).toEqual([]);
    }
  });

  it("flags a refuted claim stated as current", () => {
    // The other polarity of the same predicate. Without this, an always-empty detector passes
    // the suite above and proves nothing.
    const drifted = [
      "const SVELTE = {",
      "  // A helper-built class means every selector is unprovable, so the analysis is off.",
      "  variants: 'use class: directives',",
      "};",
    ].join("\n");
    const found = unlabelledRefutedClaims(drifted, "drifted.ts");
    expect(found.map((f) => f.claim)).toContain("v2-every-selector");
    expect(found.map((f) => f.claim)).toContain("v2-analysis-off");
    expect(found[0]?.line).toBe(2);
  });

  it("allows the same sentence inside a WRONG label", () => {
    const labelled = [
      "const SVELTE = {",
      "  //   WRONG v2: a dynamic class makes every selector unprovable and switches",
      "  //             the analysis off. Refuted: it is far narrower than that.",
      "  //",
      "  //   ACTUAL: the compiler still does structural reachability.",
      "  variants: 'use class: directives',",
      "};",
    ].join("\n");
    expect(unlabelledRefutedClaims(labelled, "labelled.ts")).toEqual([]);
  });

  it("closes the label at ACTUAL, so the correction itself cannot restate the claim", () => {
    // The specific defect fixed at a47e611c: a correction block whose reader-facing conclusion
    // WAS the refuted rule. Anything after ACTUAL is unlabelled again.
    const restated = [
      "  //   WRONG v1: the rules are stripped.",
      "  //   ACTUAL: nothing is stripped —",
      "  //   the analysis is off for that element.",
    ].join("\n");
    expect(unlabelledRefutedClaims(restated, "restated.ts").map((f) => f.claim)).toEqual([
      "v2-analysis-off",
    ]);
  });

  it("has a live pattern for every refuted claim", () => {
    // A pattern that matches nothing is a silent hole; this is the same both-polarity property
    // applied per pattern rather than to the predicate as a whole.
    const samples: Record<string, string> = {
      "v1-stripped": "its style rules are stripped by the compiler",
      "v1-unstyled": "the component ships unstyled",
      "v2-every-selector": "makes every selector unprovable",
      "v2-analysis-off": "switches the unused-selector analysis off",
      "v2-pruning-disabled": "a dynamic class disables pruning",
    };
    for (const { id } of REFUTED) {
      const sample = samples[id];
      expect(sample, `no positive sample for ${id}`).toBeTruthy();
      expect(
        unlabelledRefutedClaims(sample, "sample.ts").map((f) => f.claim),
        `${id} matched nothing`,
      ).toContain(id);
    }
  });

  it("does not fire on the corrected wording the profile actually ships", () => {
    // Guards the other direction: a check that flags the correct text would get deleted.
    const shipped = [
      "  variants: 'A class string built by a helper works and nothing is stripped — for the'",
      "    + ' element CARRYING the dynamic class the compiler cannot rule out any selector that'",
      "    + ' could match it. Selectors it can exclude structurally are reported either way.',",
    ].join("\n");
    expect(unlabelledRefutedClaims(shipped, "shipped.ts")).toEqual([]);
  });
});
