import { describe, expect, it } from "vitest";
import { RULE_SCOPES, enforceScope, ruleAppliesIn, rulesForScope, type ScopedRuleKind } from "./audit-scope";

/**
 * Audit scoping — OpenSpec change: agentic-design-system, task 2c.1.
 *
 * The property under test is the one that motivates the whole split: THE SAME FINDING IS MEANINGFUL
 * IN ONE AUDIT AND FALSE IN THE OTHER. A report that emits the false one teaches people to scroll
 * past it, and the true findings go with it.
 */

describe("a rule declares where it is valid", () => {
  it("every rule names at least one scope and says why", () => {
    for (const [kind, rule] of Object.entries(RULE_SCOPES)) {
      expect(rule.scopes.length, `${kind} must name a scope`).toBeGreaterThan(0);
      // The rationale is read by whoever later wants to widen the rule — it is where the
      // counter-argument lives.
      expect(rule.rationale.length, `${kind} must justify its scope`).toBeGreaterThan(20);
    }
  });

  it("keeps 'unused' OUT of component creation — there are no screens yet", () => {
    // Every component would be reported unused. That is noise, and noise is what makes a report
    // ignorable.
    expect(ruleAppliesIn("unused", "component-creation")).toBe(false);
    expect(ruleAppliesIn("unused", "screen-generation")).toBe(true);
  });

  it("keeps shadow detection OUT of component creation — it is impossible there", () => {
    // The generated validation page always imports the component, so a shadow cannot occur.
    expect(ruleAppliesIn("shadow-implementation", "component-creation")).toBe(false);
    expect(ruleAppliesIn("shadow-implementation", "screen-generation")).toBe(true);
  });

  it("keeps conversion-only rules out of component creation", () => {
    // There is no generated output to inspect before a screen is generated.
    for (const kind of ["styling-lost-token", "wrong-variant-for-context"] as ScopedRuleKind[])
      expect(ruleAppliesIn(kind, "component-creation")).toBe(false);
  });

  it("runs the value rules in BOTH — only the fix differs", () => {
    for (const kind of ["hardcoded-color", "token-drift"] as ScopedRuleKind[]) {
      expect(ruleAppliesIn(kind, "component-creation")).toBe(true);
      expect(ruleAppliesIn(kind, "screen-generation")).toBe(true);
    }
  });
});

describe("an audit evaluates its scope's rules and nothing more", () => {
  it("component creation gets only the rules that mean something without screens", () => {
    expect(rulesForScope("component-creation").sort()).toEqual(["hardcoded-color", "token-drift"]);
  });

  it("screen generation gets every rule", () => {
    expect(rulesForScope("screen-generation").sort()).toEqual([
      "hardcoded-color",
      "shadow-implementation",
      "styling-lost-token",
      "token-drift",
      "unused",
      "wrong-variant-for-context",
    ]);
  });
});

describe("enforceScope is the runtime backstop (task 2c.1 VALIDATE)", () => {
  it("drops an out-of-scope finding and RETURNS it, rather than swallowing it", () => {
    // A rule producing out-of-scope findings is a bug in that rule; discarding the evidence
    // silently would leave it undiagnosable.
    const findings = [
      { kind: "hardcoded-color", component: "Button" },
      { kind: "unused", component: "Badge" },
      { kind: "shadow-implementation", component: "Card" },
    ];
    const { kept, dropped } = enforceScope(findings, "component-creation");
    expect(kept.map((f) => f.kind)).toEqual(["hardcoded-color"]);
    expect(dropped.map((f) => f.kind)).toEqual(["unused", "shadow-implementation"]);
  });

  it("a component-creation audit on a project with no screens emits ZERO unused and ZERO shadows", () => {
    // The validation criterion from 2c.1, asserted directly.
    const asIfEveryComponentLookedUnused = [
      { kind: "unused", component: "Button" },
      { kind: "unused", component: "Badge" },
      { kind: "unused", component: "Card" },
      { kind: "shadow-implementation", component: "Card" },
    ];
    const { kept } = enforceScope(asIfEveryComponentLookedUnused, "component-creation");
    expect(kept).toEqual([]);
  });

  it("keeps a finding from a rule the table does not know", () => {
    // Silently discarding a finding from a rule added later would be worse than showing one that
    // may be out of scope.
    const { kept, dropped } = enforceScope([{ kind: "some-future-rule" }], "component-creation");
    expect(kept).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it("passes everything through in screen generation", () => {
    const findings = (rulesForScope("screen-generation") as string[]).map((kind) => ({ kind }));
    expect(enforceScope(findings, "screen-generation").dropped).toEqual([]);
  });
});
