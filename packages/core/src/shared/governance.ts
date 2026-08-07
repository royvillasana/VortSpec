import { z } from "zod";

/**
 * Governance v2 — OpenSpec change: agentic-design-system, tasks 4.1 and 4.2.
 *
 * v1 asked "does this token exist". These rules ask whether it was used with INTENT: a token that
 * exists, resolves, and is applied to exactly the wrong property passes every existence check ever
 * written, and is the failure a design system actually accumulates.
 *
 * PURE — no fs. `main/inspector/governance-*.ts` evaluates and writes.
 *
 * The format carries three things existence checks never needed:
 *
 * 1. **`evaluation`** — `deterministic` or `judgment`. This is the cost spine of task 4.3. A rule
 *    that code can settle must never reach a model, and a rule that needs taste must never be
 *    pretended to be settled by a regex. Marking everything deterministic would produce confident
 *    nonsense; marking everything judgment would make an audit cost a model call per token.
 * 2. **`correction`** — one line saying what to do INSTEAD. A finding without one describes a
 *    problem and leaves the fix to be invented, which is how "use a token" becomes a different wrong
 *    token. The same reasoning that drops an anti-pattern with no `alternative` from `LiteHints`.
 * 3. **`rationale`** — why the rule exists, so a team can disagree with it deliberately. These are
 *    DEFAULTS seeded into a project's own `.vortspec/ai/governance/`, not laws; a rule whose reason
 *    is unstated cannot be argued with, only ignored.
 */

export const ruleFamilySchema = z.enum([
  /** Foreground/background sequence — which role of token may take which property. */
  "hierarchy",
  /** Shadow scale coherent with surface and z-order. */
  "elevation",
  /** Intent tokens (`danger`, `success`) used for meaning, not decoration. */
  "semantic-color",
  /** Family/size/weight/line-height applied as a unit rather than piecemeal. */
  "typography",
]);
export type RuleFamily = z.infer<typeof ruleFamilySchema>;

/** The finding kinds governance v2 adds on top of the existence kinds. */
export const intentFindingKinds = [
  "hierarchy-inversion",
  "elevation-drift",
  "semantic-misuse",
  "typography-split",
] as const;
export type IntentFindingKind = (typeof intentFindingKinds)[number];

export const governanceRuleSchema = z.object({
  /** Stable id, `family/slug` — what a finding cites and what a team disables. */
  id: z.string(),
  family: ruleFamilySchema,
  kind: z.enum(intentFindingKinds),
  severity: z.enum(["error", "warning"]),
  /**
   * Whether code can settle this rule. `judgment` rules are NOT evaluated by the deterministic pass;
   * they are collected and routed to a model (task 4.3), so a project that never runs the model pass
   * simply gets fewer findings rather than wrong ones.
   */
  evaluation: z.enum(["deterministic", "judgment"]),
  /** What the rule requires, in one line. */
  statement: z.string(),
  /** What to do instead — carried onto every finding the rule produces. */
  correction: z.string(),
  /** Why this is a rule, so a team can disagree with it on purpose. */
  rationale: z.string(),
  /** Set false in a project's own copy to turn the rule off without deleting it. */
  enabled: z.boolean().default(true),
});
export type GovernanceRule = z.infer<typeof governanceRuleSchema>;

export const governanceConfigSchema = z.object({
  rules: z.array(governanceRuleSchema).default([]),
  /**
   * Token-name fragments that mark a token's ROLE, which is what the hierarchy and semantic rules
   * read. Project-overridable because naming conventions differ, and a rule that assumes `--fg-`
   * is silently dead on a system that writes `--text-`.
   */
  vocabulary: z
    .object({
      foreground: z.array(z.string()).default(["fg", "foreground", "text", "content", "ink", "on-"]),
      background: z.array(z.string()).default(["bg", "background", "surface", "canvas", "fill"]),
      border: z.array(z.string()).default(["border", "outline", "stroke", "divider"]),
      intent: z.array(z.string()).default(["danger", "error", "success", "warning", "critical", "destructive", "info"]),
      elevation: z.array(z.string()).default(["shadow", "elevation"]),
    })
    .default({}),
});
export type GovernanceConfig = z.infer<typeof governanceConfigSchema>;

/** Properties that paint TEXT — where a foreground-role token belongs. */
export const FOREGROUND_PROPERTIES = new Set(["color", "fill", "-webkit-text-fill-color", "caret-color"]);

/** Properties that paint a SURFACE — where a background-role token belongs. */
export const BACKGROUND_PROPERTIES = new Set(["background", "background-color"]);

/** Properties that paint a BORDER — neither foreground nor background. */
export const BORDER_PROPERTIES = new Set([
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "stroke",
]);

/** The typography properties a composite is expected to move as a unit. */
export const TYPOGRAPHY_PROPERTIES = ["font-family", "font-size", "font-weight", "line-height"] as const;

/**
 * The seeded defaults.
 *
 * Deliberately few. A governance layer that ships forty rules is read once and disabled; these four
 * families are the ones the reference architecture names, and each earns its place by catching a
 * mistake that every existence check passes.
 */
export const DEFAULT_RULES: GovernanceRule[] = [
  {
    id: "hierarchy/background-token-on-text",
    family: "hierarchy",
    kind: "hierarchy-inversion",
    severity: "error",
    evaluation: "deterministic",
    statement: "A background-role token must not be applied to a text property.",
    correction: "Use the foreground token paired with this surface (e.g. --color-fg-on-<surface>).",
    rationale:
      "The pairing is what guarantees contrast. A surface colour on text passes every existence check and can render text on its own background — invisible, and invisible to the audit that only asks whether the token exists.",
    enabled: true,
  },
  {
    id: "hierarchy/foreground-token-on-surface",
    family: "hierarchy",
    kind: "hierarchy-inversion",
    severity: "error",
    evaluation: "deterministic",
    statement: "A foreground-role token must not be applied to a background property.",
    correction: "Use a surface token; if this really is an inverted block, use the inverted surface token.",
    rationale:
      "The mirror of the rule above, and the more common one: an inverted block gets built by putting the text colour on the background instead of reaching for the inverted surface, and the pairing is lost.",
    enabled: true,
  },
  {
    id: "elevation/shadow-outside-the-scale",
    family: "elevation",
    kind: "elevation-drift",
    severity: "warning",
    evaluation: "deterministic",
    statement: "A box-shadow must come from an elevation token, not a literal or a non-elevation token.",
    correction: "Reference the elevation token nearest the intended depth.",
    rationale:
      "Elevation is an ordered scale; one hand-written shadow puts a surface at a depth that has no place in the order, and nothing downstream can reason about what is above what.",
    enabled: true,
  },
  {
    id: "elevation/mixed-elevations-on-one-surface",
    family: "elevation",
    kind: "elevation-drift",
    severity: "warning",
    evaluation: "judgment",
    statement: "One surface should resolve to a single elevation.",
    correction: "Pick the elevation that matches this surface's z-order and use it alone.",
    rationale:
      "Two elevation tokens in one component is usually a nested surface, which is correct, and occasionally a mistake — telling those apart needs the component's structure, so this is not a regex's call.",
    enabled: true,
  },
  {
    id: "semantic-color/intent-token-used-decoratively",
    family: "semantic-color",
    kind: "semantic-misuse",
    severity: "warning",
    evaluation: "judgment",
    statement: "An intent token (danger, success, warning) must carry that meaning, not decoration.",
    correction: "Use a neutral or brand token; reserve the intent token for the state it names.",
    rationale:
      "Once red means 'delete' in one place and 'accent' in another, it means nothing anywhere. Whether a given use is decorative depends on what the component is for, which is exactly what a record of intent — not a pattern match — has to answer.",
    enabled: true,
  },
  {
    id: "typography/composite-applied-piecemeal",
    family: "typography",
    kind: "typography-split",
    severity: "warning",
    evaluation: "deterministic",
    statement:
      "When a component tokenizes one typography property, the other properties it sets must be tokenized too.",
    correction: "Apply the whole type style — family, size, weight and line-height — from its tokens.",
    rationale:
      "A tokenized size beside a literal line-height is the state that survives every existence check and breaks on the first scale change: the size moves, the leading does not, and the block reflows wrong.",
    enabled: true,
  },
];

/** The seeded configuration a project starts from. */
export function defaultGovernance(): GovernanceConfig {
  return governanceConfigSchema.parse({ rules: DEFAULT_RULES });
}

/** Which vocabulary role a token name carries, or null when its name says nothing. */
export function tokenRole(
  token: string,
  vocabulary: GovernanceConfig["vocabulary"],
): "foreground" | "background" | "border" | null {
  const name = token.toLowerCase();
  const hit = (fragments: string[]): boolean =>
    fragments.some((fragment) => new RegExp(`(^|[-_])${escapeRegExp(fragment)}`).test(name));
  // Border first: `--color-border-subtle` contains neither a foreground nor a background fragment in
  // most systems, but where it does (`--surface-border`), the border reading is the specific one.
  if (hit(vocabulary.border)) return "border";
  if (hit(vocabulary.foreground)) return "foreground";
  if (hit(vocabulary.background)) return "background";
  return null;
}

/** Whether a token's name marks it as an intent (status) colour. */
export function isIntentToken(token: string, vocabulary: GovernanceConfig["vocabulary"]): boolean {
  const name = token.toLowerCase();
  return vocabulary.intent.some((fragment) => new RegExp(`(^|[-_])${escapeRegExp(fragment)}`).test(name));
}

/** Whether a token's name marks it as an elevation token. */
export function isElevationToken(token: string, vocabulary: GovernanceConfig["vocabulary"]): boolean {
  const name = token.toLowerCase();
  return vocabulary.elevation.some((fragment) => new RegExp(`(^|[-_])${escapeRegExp(fragment)}`).test(name));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
