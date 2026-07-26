import { describe, it, expect } from "vitest";
import {
  SCAFFOLD_SENTINEL,
  isRunId,
  scaffoldBegin,
  scaffoldEnd,
  wrapOption,
  hasScaffold,
  stripScaffold,
} from "./compose-scaffold";

// A file with two option blocks from one run, as the composition scaffold writes it.
function scaffolded(runId = "r1"): string {
  return [
    `export function Row() {`,
    `  return (`,
    `    <div className="row">`,
    `      <Existing />`,
    wrapOption(runId, 0, `      <Card variant="a" />`),
    wrapOption(runId, 1, `      <Card variant="b" />`),
    `    </div>`,
    `  );`,
    `}`,
    ``,
  ].join("\n");
}

describe("scaffold markers", () => {
  it("emit markers carrying the run id and option index", () => {
    expect(scaffoldBegin("r1", 0)).toContain(`${SCAFFOLD_SENTINEL}:BEGIN run=r1 option=0`);
    expect(scaffoldEnd("r1", 2)).toContain(`${SCAFFOLD_SENTINEL}:END run=r1 option=2`);
    // JSX comment expressions so they are inert in the rendered output.
    expect(scaffoldBegin("r1", 0).startsWith("{/*")).toBe(true);
  });

  it("validates run ids are marker-safe", () => {
    expect(isRunId("run-2026_07")).toBe(true);
    expect(isRunId("bad id")).toBe(false);
    expect(isRunId("bad*/}")).toBe(false);
  });

  it("detects a scaffold in a file (what the commit guard greps)", () => {
    expect(hasScaffold(scaffolded())).toBe(true);
    expect(hasScaffold("const x = 1;\n")).toBe(false);
  });
});

describe("stripScaffold", () => {
  it("removes every option block on discard, leaving valid source", () => {
    const cleaned = stripScaffold(scaffolded());
    expect(hasScaffold(cleaned)).toBe(false);
    expect(cleaned).toContain("<Existing />");
    expect(cleaned).not.toContain("<Card");
  });

  it("is idempotent on an already-clean file", () => {
    const clean = "const x = 1;\n\n\n\nconst y = 2;\n";
    // Only the blank-line collapse applies; no markers to strip.
    expect(stripScaffold(stripScaffold(clean))).toBe(stripScaffold(clean));
    expect(hasScaffold(stripScaffold(clean))).toBe(false);
  });

  it("accept keeps one option's content and deletes the rest", () => {
    const accepted = stripScaffold(scaffolded(), { runId: "r1", keepOption: 1 });
    expect(hasScaffold(accepted)).toBe(false);
    expect(accepted).toContain(`<Card variant="b" />`);
    expect(accepted).not.toContain(`<Card variant="a" />`);
    expect(accepted).toContain("<Existing />");
  });

  it("scopes a strip to one run, leaving another run's block intact", () => {
    const twoRuns = scaffolded("r1") + "\n" + wrapOption("r2", 0, "<Other />");
    const stripped = stripScaffold(twoRuns, { runId: "r1" });
    expect(stripped).toContain(`${SCAFFOLD_SENTINEL}:BEGIN run=r2`);
    expect(stripped).not.toContain(`${SCAFFOLD_SENTINEL}:BEGIN run=r1`);
  });

  it("does not let one option's markers pair with another's", () => {
    // BEGIN option=0 must close on END option=0, not the nearer END option=1.
    const cleaned = stripScaffold(scaffolded(), { runId: "r1", keepOption: 0 });
    expect(cleaned).toContain(`<Card variant="a" />`);
    expect(cleaned).not.toContain(`<Card variant="b" />`);
    expect(hasScaffold(cleaned)).toBe(false);
  });

  it("strips the data-vs-option preview marker from a move's re-inserted element (no block)", () => {
    // A move adds a BARE `data-vs-option="0"` to the moved element — no scaffold block wraps it.
    const moved = `<main>\n  <h1 className="title" data-vs-option="0">Hi</h1>\n</main>`;
    const cleaned = stripScaffold(moved, { runId: "mv", keepOption: 0 });
    expect(cleaned).toBe(`<main>\n  <h1 className="title">Hi</h1>\n</main>`);
    expect(cleaned).not.toContain("data-vs-option");
  });

  it("strips data-vs-option from a KEPT compose option's content", () => {
    const src = wrapOption("r1", 0, `<Card variant="a" data-vs-option="0" />`);
    const cleaned = stripScaffold(src, { runId: "r1", keepOption: 0 });
    expect(cleaned).toContain(`<Card variant="a" />`);
    expect(cleaned).not.toContain("data-vs-option");
  });
});
