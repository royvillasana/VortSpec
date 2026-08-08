import { describe, expect, it } from "vitest";
import { defaultGovernance, governanceConfigSchema, DEFAULT_RULES } from "./governance";
import { evaluateGovernance, type GovernanceSubject } from "./governance-eval";
import { tokensUsed } from "./relationship-graph";

const config = defaultGovernance();

const subject = (source: string, component = "Callout"): GovernanceSubject => ({
  component,
  file: `src/components/${component}.tsx`,
  source,
});

/**
 * The task 4.4 fixture: every token here EXISTS, resolves, and is referenced with correct syntax.
 * A v1 existence check has nothing to say about it. The surface token is on the text.
 */
const HIERARCHY_VIOLATION = `
export const Callout = () => (
  <div className="bg-[var(--color-surface-raised)] text-[var(--color-surface-raised)]">
    Heads up
  </div>
);`;

describe("v1 passes what v2 catches (task 4.4)", () => {
  it("v1 sees only well-formed token references", () => {
    // The existence layer's whole vocabulary: which tokens are referenced. Both are real.
    expect(tokensUsed(HIERARCHY_VIOLATION)).toEqual(["color-surface-raised"]);
    expect(HIERARCHY_VIOLATION).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("v2 flags the inversion, naming the token and the property", () => {
    const { violations } = evaluateGovernance([subject(HIERARCHY_VIOLATION)], config);
    const inversion = violations.find((v) => v.kind === "hierarchy-inversion");
    expect(inversion).toBeDefined();
    expect(inversion?.rule).toBe("hierarchy/background-token-on-text");
    expect(inversion?.message).toContain("--color-surface-raised");
    expect(inversion?.message).toContain("color");
    expect(inversion?.severity).toBe("error");
  });

  it("every finding carries a correction, not just a complaint", () => {
    // A finding without one leaves the fix to be invented, which is how "use a token" becomes a
    // different wrong token.
    const { violations } = evaluateGovernance([subject(HIERARCHY_VIOLATION)], config);
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) expect(violation.correction.trim()).not.toBe("");
  });

  it("intent findings are a strict SUPERSET — the correct component stays clean", () => {
    const correct = `
      export const Callout = () => (
        <div className="bg-[var(--color-surface-raised)] text-[var(--color-fg-default)]">Heads up</div>
      );`;
    const { violations } = evaluateGovernance([subject(correct)], config);
    expect(violations).toEqual([]);
  });
});

describe("hierarchy", () => {
  it("flags a foreground token on a background property", () => {
    const source = '<div className="bg-[var(--color-fg-default)]" />';
    const { violations } = evaluateGovernance([subject(source)], config);
    expect(violations.map((v) => v.rule)).toEqual(["hierarchy/foreground-token-on-surface"]);
  });

  it("leaves a border token alone on a border property", () => {
    const source = ".a { border-color: var(--color-border-subtle); }";
    expect(evaluateGovernance([subject(source)], config).violations).toEqual([]);
  });

  it("says nothing about a token whose name carries no role", () => {
    // Silence is correct here. Guessing a role from a value would make the rule fire on naming
    // conventions it was never taught, and a false error is worse than a missed one.
    const source = ".a { color: var(--brand-500); background-color: var(--brand-900); }";
    expect(evaluateGovernance([subject(source)], config).violations).toEqual([]);
  });
});

describe("elevation", () => {
  it("flags a literal box-shadow", () => {
    const source = ".card { box-shadow: 0 1px 2px rgba(0,0,0,.2); }";
    const { violations } = evaluateGovernance([subject(source)], config);
    expect(violations.map((v) => v.kind)).toEqual(["elevation-drift"]);
    expect(violations[0]?.severity).toBe("warning");
  });

  it("flags a non-elevation token used as a shadow", () => {
    const source = ".card { box-shadow: var(--color-border-subtle); }";
    const { violations } = evaluateGovernance([subject(source)], config);
    expect(violations.map((v) => v.rule)).toEqual(["elevation/shadow-outside-the-scale"]);
  });

  it("accepts an elevation token on a shadow", () => {
    const source = ".card { box-shadow: var(--shadow-md); }";
    expect(evaluateGovernance([subject(source)], config).violations).toEqual([]);
  });
});

describe("typography", () => {
  it("flags a literal line-height beside a tokenized size", () => {
    const source = ".t { font-size: var(--font-size-lg); line-height: 1.4; }";
    const { violations } = evaluateGovernance([subject(source)], config);
    expect(violations.map((v) => v.kind)).toEqual(["typography-split"]);
    expect(violations[0]?.message).toContain("line-height");
  });

  it("says nothing when the whole composite is literal", () => {
    // Untokenized typography is the EXISTENCE layer's finding, not this one. Reporting it here would
    // make the two audits argue about the same line.
    const source = ".t { font-size: 18px; line-height: 1.4; }";
    expect(evaluateGovernance([subject(source)], config).violations).toEqual([]);
  });

  it("says nothing when the whole composite is tokenized", () => {
    const source = ".t { font-size: var(--font-size-lg); line-height: var(--line-height-lg); }";
    expect(evaluateGovernance([subject(source)], config).violations).toEqual([]);
  });
});

describe("judgment rules are deferred, never guessed (task 4.3)", () => {
  it("does not emit a violation for a judgment rule", () => {
    const source = '<button className="bg-[var(--color-danger-500)]" />';
    const { violations, deferred } = evaluateGovernance([subject(source)], config);
    expect(violations.find((v) => v.kind === "semantic-misuse")).toBeUndefined();
    expect(deferred.map((d) => d.rule)).toContain("semantic-color/intent-token-used-decoratively");
  });

  it("hands the model the placements to judge, not the whole file", () => {
    // A bounded question stays cheap; the component's whole source turns it into an open review.
    const source = `
      <button className="bg-[var(--color-danger-500)] p-[var(--spacing-4)] rounded-[var(--radius-md)]" />`;
    const { deferred } = evaluateGovernance([subject(source)], config);
    const semantic = deferred.find((d) => d.rule === "semantic-color/intent-token-used-decoratively");
    expect(semantic?.evidence.map((e) => e.token)).toEqual(["color-danger-500"]);
  });

  it("defers a mixed-elevation check only when there is more than one to reconcile", () => {
    const one = subject(".a { box-shadow: var(--shadow-sm); }");
    const two = subject(".a { box-shadow: var(--shadow-sm); } .b { box-shadow: var(--shadow-lg); }");
    const rule = "elevation/mixed-elevations-on-one-surface";
    expect(evaluateGovernance([one], config).deferred.map((d) => d.rule)).not.toContain(rule);
    expect(evaluateGovernance([two], config).deferred.map((d) => d.rule)).toContain(rule);
  });

  it("raises nothing at all for a component with no intent or elevation tokens", () => {
    expect(evaluateGovernance([subject('<div className="p-[var(--spacing-4)]" />')], config).deferred).toEqual([]);
  });
});

describe("the rule set itself", () => {
  it("parses as its own schema", () => {
    expect(() => governanceConfigSchema.parse({ rules: DEFAULT_RULES })).not.toThrow();
  });

  it("gives every rule a correction and a rationale", () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.correction.trim(), `${rule.id} has no correction`).not.toBe("");
      expect(rule.rationale.trim(), `${rule.id} has no rationale`).not.toBe("");
    }
  });

  it("has unique ids", () => {
    expect(new Set(DEFAULT_RULES.map((r) => r.id)).size).toBe(DEFAULT_RULES.length);
  });

  it("fires nothing for a disabled rule", () => {
    const off = governanceConfigSchema.parse({
      rules: DEFAULT_RULES.map((r) =>
        r.id === "hierarchy/background-token-on-text" ? { ...r, enabled: false } : r,
      ),
    });
    const { violations } = evaluateGovernance([subject(HIERARCHY_VIOLATION)], off);
    expect(violations.find((v) => v.rule === "hierarchy/background-token-on-text")).toBeUndefined();
  });
});
