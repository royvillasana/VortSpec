import { describe, expect, it } from "vitest";
import { selectionProtocol } from "./selection-protocol";
import { buildComposePrompt, type ComposePromptInput } from "./compose-run";
import type { InspectorComponent } from "./inspector";
import { buildLightPagePrompt } from "./light-page";

describe("the selection method (task 3.3)", () => {
  it("selects on criteria and purpose rather than on names", () => {
    const protocol = selectionProtocol({ gapPolicy: "report", source: "metadata" });
    expect(protocol).toContain("aiHints.selectionCriteria");
    expect(protocol).toContain("NEVER on the name");
    expect(protocol).toContain("variants[].purpose");
  });

  it("names the fields the run can actually see, per source", () => {
    // A light-first run never opens `.vortspec/metadata/`. Telling it to consult
    // `aiHints.selectionCriteria` is an instruction it cannot follow — designer.md calls the same
    // thing `hints.selectionCriteria`.
    const designer = selectionProtocol({ gapPolicy: "build-and-name", source: "designer" });
    expect(designer).toContain("hints.selectionCriteria");
    expect(designer).toContain("hints.avoid");
    expect(designer).toContain("designer.md");
    expect(designer).not.toContain("aiHints");
    expect(designer).not.toContain("usage.antiPatterns");
  });

  it("treats an unrecorded component as unknown rather than unconstrained", () => {
    expect(selectionProtocol({ gapPolicy: "report", source: "metadata" })).toContain(
      "not a free choice",
    );
  });

  it("treats an anti-pattern as a rule with a replacement, not a warning", () => {
    // A warning changes nothing about generated code. The `alternative` is the whole point.
    const protocol = selectionProtocol({ gapPolicy: "report", source: "metadata" });
    expect(protocol).toContain("usage.antiPatterns");
    expect(protocol).toContain("`alternative`");
    expect(protocol).toContain("a rule, not a caution");
  });

  it("differs on the one step where the two paths genuinely differ", () => {
    const framework = selectionProtocol({ gapPolicy: "report", source: "metadata" });
    const light = selectionProtocol({ gapPolicy: "build-and-name", source: "designer" });
    expect(framework).toContain("do not hand-write a substitute");
    expect(framework).toContain("shadow implementation");
    expect(light).toContain("Do not stop");
    expect(light).not.toContain("do not hand-write a substitute");
  });

  it("stays short enough to ride on every compose run", () => {
    // A ceiling, not a target. The block sits next to a roster and token list many times its size;
    // what it must never become is a cost comparable to the composition it guides.
    for (const source of ["metadata", "designer"] as const)
      expect(Math.ceil(selectionProtocol({ gapPolicy: "report", source }).length / 4)).toBeLessThan(360);
  });
});

const card = (file: string | null): InspectorComponent => ({
  name: "Card",
  level: "molecule",
  file,
  props: [],
  tokens: [],
  status: "unknown",
  issues: [],
  specPath: null,
  reportPath: null,
});

const slot = {
  position: "after" as const,
  anchorLabel: "section",
  anchorText: "",
  axis: "column" as const,
  file: "src/pages/Home.tsx",
};

describe("it reaches the runs that select components", () => {
  it("rides in a framework compose run with the reporting gap rule", () => {
    const prompt = buildComposePrompt({
      runId: "r1",
      intent: "a pricing row",
      slot,
      roster: [card("src/components/Card.tsx")],
      tokens: ["--color-primary"],
      designMd: null,
    } satisfies ComposePromptInput);
    expect(prompt).toContain("How to choose components");
    expect(prompt).toContain("do not hand-write a substitute");
  });

  it("rides in a light-native compose run with the build-and-name gap rule instead", () => {
    // The surrounding light prompt already tells the run to keep going on a gap. A block telling it
    // to stop would have the selection method fighting the prompt it was inserted into.
    const prompt = buildComposePrompt({
      runId: "r1",
      intent: "a pricing row",
      slot,
      roster: [card(null)],
      tokens: [],
      designMd: null,
      lightNative: true,
    } satisfies ComposePromptInput);
    expect(prompt).toContain("How to choose components");
    expect(prompt).toContain("Do not stop");
    expect(prompt).not.toContain("do not hand-write a substitute");
  });

  it("rides in a light-page run", () => {
    const prompt = buildLightPagePrompt("Pricing", "three tiers with a highlighted middle");
    expect(prompt).toContain("How to choose components");
    expect(prompt).toContain("Do not stop");
  });

  it("does not contradict the light page's framework-free contract", () => {
    // The whole light prompt exists to keep framework concepts out. A selection method that named
    // JSX or a component file path would reintroduce exactly what the contract forbids.
    const protocol = selectionProtocol({ gapPolicy: "build-and-name", source: "designer" });
    for (const banned of ["JSX", ".tsx", "import ", "cva(", "@/"])
      expect(protocol).not.toContain(banned);
  });
});
