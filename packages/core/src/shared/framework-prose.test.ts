import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REFUTED, unlabelledRefutedClaims } from "./refuted-prose";

/**
 * The prose lint, applied to this package's own sources.
 *
 * The parser lives in `refuted-prose.ts` so the same implementation the tests pin is the one a
 * teammate runs over their own files — `node packages/core/src/shared/refuted-prose.ts <path>`.
 * A second copy for the CLI would be a parser that drifts from the one under test, which is the
 * defect class this whole check exists for.
 *
 * SCOPE — deliberately these two production modules only. The test files state the refuted
 * wording on purpose (negative assertions that forbid it from the emitted profile), so scanning
 * them would flag correct prose.
 */
const SOURCES = ["./framework-profiles.ts", "./framework-docs.ts"] as const;

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
    expect(found.map((f) => f.claim)).toContain("svelte-v2-every-selector");
    expect(found.map((f) => f.claim)).toContain("svelte-v2-analysis-off");
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
      "svelte-v2-analysis-off",
    ]);
  });

  it("does not let an unrelated line containing the word WRONG open the exemption", () => {
    // Thor's first false negative on 888ab35f. `\bWRONG\b` matched an identifier, so the claim in
    // the comment below it was skipped. A label is comment syntax, not a substring.
    const source = ["const WRONG = false;", "// A dynamic class makes every selector unprovable."].join("\n");
    expect(unlabelledRefutedClaims(source, "identifier.ts")).toEqual([
      {
        file: "identifier.ts",
        line: 2,
        claim: "svelte-v2-every-selector",
        text: "// A dynamic class makes every selector unprovable.",
      },
    ]);
  });

  it("closes a labelled block comment at its terminator", () => {
    // Thor's second false negative: the closing line still looked like a comment, so the label
    // leaked into the NEXT comment. The one-line block stays exempt; what follows does not.
    const source = [
      "/** WRONG v2: historical claim about every selector. */",
      "// A dynamic class makes every selector unprovable.",
    ].join("\n");
    const found = unlabelledRefutedClaims(source, "block.ts");
    expect(found.map((f) => f.line)).toEqual([2]);
    expect(found[0]?.claim).toBe("svelte-v2-every-selector");
  });

  it("reads markdown as prose, where there are no comment markers to find", () => {
    // Bumble asked to run this over the fixture reports. In `.md` every line carries prose, so
    // the label has to survive list and quote markers — otherwise a RESEARCH note recording
    // history correctly would be a wall of false positives and the tool would get ignored.
    const note = [
      "## Corrections",
      "",
      "- **WRONG v2:** a dynamic class makes every selector unprovable.",
      "  ACTUAL: the compiler still proves structural impossibility.",
      "",
      "The analysis is off for that element.",
    ].join("\n");
    const found = unlabelledRefutedClaims(note, "NOTE.md");
    expect(found.map((f) => f.line)).toEqual([6]);
    expect(found[0]?.claim).toBe("svelte-v2-analysis-off");
  });

  it("closes a markdown label at a fenced block rather than reaching past it", () => {
    // A fence is usually captured tool output; letting a label span it would exempt more than
    // the paragraph it was written for. Fail-closed, so this reports rather than skips.
    const note = [
      "**WRONG:** the old claim.",
      "```",
      "some captured output",
      "```",
      "A dynamic class makes every selector unprovable.",
    ].join("\n");
    expect(unlabelledRefutedClaims(note, "NOTE.md").map((f) => f.line)).toEqual([5]);
  });

  it("does not fire on 'stripped' with an unrelated subject", () => {
    // Bumble hit this: "ANSI is stripped" matched the pattern for CSS RULES being stripped —
    // same verb, unrelated subject. It matters more than an ordinary false positive, because the
    // obvious fix under time pressure is to label it `WRONG:` — which would put a fake refutation
    // into a file whose whole purpose is recording real ones.
    const unrelated = [
      "// ANSI is stripped HERE rather than at the call site",
      "// escape bytes are stripped before matching",
    ].join("\n");
    expect(unlabelledRefutedClaims(unrelated, "x.ts")).toEqual([]);
    // The real claim still fires — narrowing must not have disarmed it.
    const real = "// its `<style>` rules are stripped and the component ships unstyled";
    expect(unlabelledRefutedClaims(real, "x.ts").map((f) => f.claim)).toContain("svelte-v1-stripped");
  });

  it("has a live pattern for every refuted claim", () => {
    // A pattern that matches nothing is a silent hole; this is the same both-polarity property
    // applied per pattern rather than to the predicate as a whole.
    const samples: Record<string, string> = {
      "svelte-v1-stripped": "its style rules are stripped by the compiler",
      "svelte-v1-unstyled": "the component ships unstyled",
      "svelte-v2-every-selector": "makes every selector unprovable",
      "svelte-v2-analysis-off": "switches the unused-selector analysis off",
      "svelte-v2-pruning-disabled": "a dynamic class disables pruning",
      "angular-build-covers-both": "a build covers both the class and the template",
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
