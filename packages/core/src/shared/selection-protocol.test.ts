import { describe, expect, it } from "vitest";
import { selectionProtocol } from "./selection-protocol";
import { buildComposePrompt } from "./compose-run";
import { buildLightPagePrompt } from "./light-page";

describe("the selection method (task 3.3)", () => {
  it("selects on criteria and purpose rather than on names", () => {
    const protocol = selectionProtocol("report");
    expect(protocol).toContain("aiHints.selectionCriteria");
    expect(protocol).toContain("NEVER on the name");
    expect(protocol).toContain("`purpose`");
  });

  it("treats an anti-pattern as a rule with a replacement, not a warning", () => {
    // A warning changes nothing about generated code. The `alternative` is the whole point.
    const protocol = selectionProtocol("report");
    expect(protocol).toContain("antiPatterns");
    expect(protocol).toContain("`alternative`");
    expect(protocol).toContain("a rule, not a caution");
  });

  it("differs on the one step where the two paths genuinely differ", () => {
    const framework = selectionProtocol("report");
    const light = selectionProtocol("build-and-name");
    expect(framework).toContain("do not hand-write a substitute");
    expect(framework).toContain("shadow implementation");
    expect(light).toContain("Do not stop");
    expect(light).not.toContain("do not hand-write a substitute");
  });

  it("stays short enough to ride on every compose run", () => {
    expect(Math.ceil(selectionProtocol("report").length / 4)).toBeLessThan(300);
  });
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
      roster: [{ name: "Card", level: "molecule", file: "src/components/Card.tsx", props: [], tokens: [], variants: [] }],
      tokens: ["--color-primary"],
      designMd: null,
    } as Parameters<typeof buildComposePrompt>[0]);
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
      roster: [{ name: "Card", level: "molecule", file: null, props: [], tokens: [], variants: [] }],
      tokens: [],
      designMd: null,
      lightNative: true,
    } as Parameters<typeof buildComposePrompt>[0]);
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
    const protocol = selectionProtocol("build-and-name");
    for (const banned of ["JSX", ".tsx", "import ", "cva(", "@/"])
      expect(protocol).not.toContain(banned);
  });
});
