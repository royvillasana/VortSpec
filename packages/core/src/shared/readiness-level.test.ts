import { describe, expect, it } from "vitest";
import { assessReadiness, LEVEL_NAMES, type ReadinessInputs } from "./readiness-level";

/** A project at the top of the ladder; each test knocks out only what it is about. */
const AGENTIC: ReadinessInputs = {
  components: 20,
  withMetadata: 20,
  withCompleteMetadata: 20,
  tokens: 50,
  resolvedTokens: 50,
  connectedComponents: 20,
  edges: 40,
  rules: 6,
  rulesAdopted: true,
  errors: 0,
  indexFresh: true,
};

const at = (over: Partial<ReadinessInputs>) => assessReadiness({ ...AGENTIC, ...over });

describe("the ladder (task 5.5)", () => {
  it("puts a bare component library at Libraries", () => {
    // Components and tokens exist; nothing else does.
    const result = assessReadiness({
      components: 12,
      withMetadata: 0,
      withCompleteMetadata: 0,
      tokens: 30,
      resolvedTokens: 30,
      connectedComponents: 0,
      edges: 0,
      rules: 0,
      rulesAdopted: false,
      errors: 0,
      indexFresh: false,
    });
    expect(result.level).toBe(1);
    expect(result.levelName).toBe("Libraries");
  });

  it("reaches Standardised on a real graph and resolving tokens", () => {
    const result = at({ withMetadata: 0, withCompleteMetadata: 0, rules: 0, rulesAdopted: false, indexFresh: false });
    expect(result.level).toBe(2);
    expect(result.levelName).toBe("Standardised");
  });

  it("reaches Governed once rules and rationale are captured", () => {
    const result = at({ withCompleteMetadata: 4, rulesAdopted: false, indexFresh: false });
    expect(result.level).toBe(3);
    expect(result.levelName).toBe("Governed");
  });

  it("reaches Operational on complete records and a clean system", () => {
    const result = at({ rulesAdopted: false, indexFresh: false });
    expect(result.level).toBe(4);
  });

  it("reaches Agentic when governance is the team's own and the index is fresh", () => {
    expect(at({}).level).toBe(5);
    expect(LEVEL_NAMES[5]).toBe("Agentic");
  });

  it("is MONOTONE — excellence higher up cannot skip a missing rung", () => {
    // Perfect metadata and governance, but nothing renders anything. An agent still cannot answer
    // what uses what, so the ladder must not report Operational.
    const result = at({ connectedComponents: 0, edges: 0 });
    expect(result.level).toBe(1);
    expect(result.blocking).toContain("graph-connectedness");
  });
});

describe("attribution (task 5.2)", () => {
  it("names the signals responsible for not being higher", () => {
    const result = at({ withCompleteMetadata: 2, errors: 9 });
    expect(result.level).toBe(3);
    expect(result.blocking.sort()).toEqual(["metadata-completeness", "violation-rate"]);
  });

  it("phrases the next action as the concrete gap, never the level name", () => {
    const result = at({ withMetadata: 3, withCompleteMetadata: 3, rules: 0, rulesAdopted: false });
    expect(result.nextAction).toBe("Enable at least one governance rule so violations can be flagged.");
    for (const name of Object.values(LEVEL_NAMES)) expect(result.nextAction).not.toContain(name);
  });

  it("counts the actual gap, not a percentage", () => {
    // "Write metadata for 14 components" is something a person does this afternoon.
    const result = at({ components: 20, withMetadata: 6, withCompleteMetadata: 6, rules: 0, rulesAdopted: false });
    const coverage = result.signals.find((s) => s.id === "metadata-coverage");
    expect(coverage?.action).toBe("Write metadata for 14 components that have none.");
  });

  it("returns NO next action at the top", () => {
    const result = at({});
    expect(result.nextAction).toBeNull();
    expect(result.blocking).toEqual([]);
  });

  it("reports every signal, met or not, with its threshold", () => {
    // A signal that vanishes when met leaves the reader unable to see what is holding the level UP,
    // only what is holding it back.
    const result = at({ errors: 9 });
    expect(result.signals.length).toBeGreaterThan(5);
    for (const signal of result.signals) expect(typeof signal.threshold).toBe("number");
    expect(result.signals.find((s) => s.id === "token-determinism")?.met).toBe(true);
  });

  it("treats the violation rate as inverted — low is good", () => {
    expect(at({ errors: 0 }).signals.find((s) => s.id === "violation-rate")?.met).toBe(true);
    expect(at({ errors: 9 }).signals.find((s) => s.id === "violation-rate")?.met).toBe(false);
  });

  it("gives no action for a signal that is already met", () => {
    for (const signal of at({}).signals) expect(signal.action).toBe("");
  });
});

describe("degenerate inputs", () => {
  it("does not divide by zero on an empty project", () => {
    const result = assessReadiness({
      components: 0,
      withMetadata: 0,
      withCompleteMetadata: 0,
      tokens: 0,
      resolvedTokens: 0,
      connectedComponents: 0,
      edges: 0,
      rules: 0,
      rulesAdopted: false,
      errors: 0,
      indexFresh: false,
    });
    expect(result.level).toBe(1);
    expect(Number.isFinite(result.signals[0]?.value)).toBe(true);
  });

  it("tells an empty project to get tokens rather than to resolve zero of them", () => {
    const result = assessReadiness({
      components: 3,
      withMetadata: 0,
      withCompleteMetadata: 0,
      tokens: 0,
      resolvedTokens: 0,
      connectedComponents: 3,
      edges: 5,
      rules: 0,
      rulesAdopted: false,
      errors: 0,
      indexFresh: false,
    });
    expect(result.signals.find((s) => s.id === "token-determinism")?.action).toBe(
      "Extract or define the design tokens.",
    );
  });
});
