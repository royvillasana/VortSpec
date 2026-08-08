import type { AuditScope } from "./inspector";

/**
 * Which audit a rule is allowed to run in — OpenSpec change: agentic-design-system, task 2c.1.
 *
 * The whole point is to make "rule evaluated in the wrong audit" a mistake the type system catches
 * rather than a false finding a user has to learn to ignore. An audit that cries wolf is one people
 * scroll past, and then the true findings go with it — the same failure mode
 * `apps/ide/tests/ct/README.md` documents for a red test suite nobody trusts.
 *
 * PURE — no fs.
 */

/** A rule's declaration of where it is valid. A rule MUST name at least one scope. */
export interface ScopedRule<Kind extends string = string> {
  kind: Kind;
  /** The audits this rule produces meaningful findings in. */
  scopes: readonly [AuditScope, ...AuditScope[]];
  /** Why it is limited to those — read by a person deciding whether to widen it. */
  rationale: string;
}

/**
 * The rules whose scope is NOT both, with the reason recorded next to them.
 *
 * Listed as data rather than as `if` statements inside each rule so the boundary is reviewable in
 * one place: someone widening a rule has to state why here, where the counter-argument is visible.
 */
export const RULE_SCOPES = {
  /** A hardcoded value is wrong wherever it appears — only the FIX differs by scope. */
  "hardcoded-color": {
    kind: "hardcoded-color",
    scopes: ["component-creation", "screen-generation"],
    rationale:
      "Wrong in both. At component creation the fix is in the component's source; at screen " +
      "generation it is usually the conversion having inlined a literal the light page carried.",
  },
  /** Drift is a component-vs-design-source question; it does not need a screen. */
  "token-drift": {
    kind: "token-drift",
    scopes: ["component-creation", "screen-generation"],
    rationale: "A token's value diverging from the design source is true regardless of the subject.",
  },
  /** Requires screens to be meaningful at all. */
  unused: {
    kind: "unused",
    scopes: ["screen-generation"],
    rationale:
      "At component creation NOTHING is used — there are no screens — so every component would be " +
      "reported unused. That is noise, and noise is what makes a report ignorable.",
  },
  /** Impossible against a generated page, which always imports. */
  "shadow-implementation": {
    kind: "shadow-implementation",
    scopes: ["screen-generation"],
    rationale:
      "The generated validation page always imports the component, so a shadow cannot occur there. " +
      "The conversion from a light page is exactly where one gets introduced.",
  },
  /** A property of generated code; there is no generated code at component creation. */
  "styling-lost-token": {
    kind: "styling-lost-token",
    scopes: ["screen-generation"],
    rationale:
      "A Tailwind arbitrary value where a scale key existed is a failure of the CONVERSION's output. " +
      "Audit A has no converted output to inspect.",
  },
  /** Needs a context to be wrong in. */
  "wrong-variant-for-context": {
    kind: "wrong-variant-for-context",
    scopes: ["screen-generation"],
    rationale: "A variant is only wrong relative to the surrounding screen; a validation page has no context.",
  },
} as const satisfies Record<string, ScopedRule>;

export type ScopedRuleKind = keyof typeof RULE_SCOPES;

/** Whether a rule may run in a scope. */
export function ruleAppliesIn(kind: ScopedRuleKind, scope: AuditScope): boolean {
  return (RULE_SCOPES[kind].scopes as readonly AuditScope[]).includes(scope);
}

/** Every rule valid in a scope — what an audit should evaluate, and nothing more. */
export function rulesForScope(scope: AuditScope): ScopedRuleKind[] {
  return (Object.keys(RULE_SCOPES) as ScopedRuleKind[]).filter((kind) => ruleAppliesIn(kind, scope));
}

/**
 * Drop findings a scope must not emit, returning what was dropped.
 *
 * The runtime backstop behind the type-level declaration. Returned rather than silently filtered,
 * because a rule producing out-of-scope findings is a BUG in that rule, and swallowing the evidence
 * would leave it undiagnosable.
 */
export function enforceScope<T extends { kind: string }>(
  findings: readonly T[],
  scope: AuditScope,
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const finding of findings) {
    const known = finding.kind in RULE_SCOPES;
    // An unknown kind is KEPT: this table governs the rules it knows about, and silently discarding
    // a finding from a rule added later would be worse than showing one that may be out of scope.
    if (!known || ruleAppliesIn(finding.kind as ScopedRuleKind, scope)) kept.push(finding);
    else dropped.push(finding);
  }
  return { kept, dropped };
}
