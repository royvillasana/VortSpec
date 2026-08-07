/**
 * The AI-readiness maturity ladder — OpenSpec change: agentic-design-system, tasks 5.1 and 5.2.
 *
 * PURE — no fs. `main/inspector/readiness-level.ts` gathers the inputs.
 *
 * Five levels, adopted from the reference board:
 *
 *   1 Libraries    — components and tokens exist, structure inconsistent → AI approximates.
 *   2 Standardised — clear naming, logical token hierarchy → AI can reference structure.
 *   3 Governed     — rationale and rules captured → AI can flag violations.
 *   4 Operational  — deterministic tokens, machine-readable docs → AI can generate and validate.
 *   5 Agentic      — governance invocable, workflows observable → AI is a constrained collaborator.
 *
 * Three decisions make this a scoreboard rather than a vanity number:
 *
 * 1. **The ladder is MONOTONE.** A level is reached only when every criterion at and below it holds.
 *    Without that, a project with excellent metadata and no index would show as "Operational" while
 *    an agent still cannot answer what uses what — the score would be measuring effort, not
 *    capability.
 * 2. **Every threshold is a named constant with its reason.** A ladder whose numbers are unexplained
 *    gets argued with rather than acted on, and the first argument is always "why 90".
 * 3. **The next action names the GAP, never the level.** "Write metadata for 14 components" is
 *    something a person can do this afternoon; "reach Governed" is a slogan. At level 5 there is no
 *    next action, and the field is null rather than an encouraging sentence.
 */

export type ReadinessLevel = 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAMES: Record<ReadinessLevel, string> = {
  1: "Libraries",
  2: "Standardised",
  3: "Governed",
  4: "Operational",
  5: "Agentic",
};

/**
 * Thresholds, each with the reason it is where it is.
 *
 * They are deliberately not round-number-by-feel: each one is the point past which the capability the
 * level claims actually holds.
 */
export const THRESHOLDS = {
  /**
   * Share of tokens that resolve to a concrete value. Below this, "reference the token" is advice an
   * agent cannot follow, because the reference bottoms out in nothing.
   */
  tokenDeterminism: 0.9,
  /**
   * Share of design-system components wired into the graph at all — rendering something, or rendered
   * by something.
   *
   * NOT edges-per-component, which was the first attempt and is simply wrong: an atom renders
   * nothing by definition, so a healthy atom-heavy library scores below 1 forever and could never
   * leave level 1. What the level actually claims is that the library is connected enough to reason
   * over, and half of it participating is the point past which that holds.
   */
  graphConnectedness: 0.5,
  /** Share of the roster with ANY metadata record — the level-3 claim is that rationale is captured. */
  metadataCoverage: 0.5,
  /**
   * Share of the roster whose record is COMPLETE. Level 4 claims machine-readable docs, and a
   * migrated four-field record is exactly the thing that looks like docs and is not.
   */
  metadataCompleteness: 0.9,
  /**
   * Governance errors per component. Level 4 claims an agent can validate against the real system,
   * which is not true while the system itself is violating its own rules.
   */
  violationRate: 0.1,
} as const;

export interface ReadinessInputs {
  /** Design-system components on the roster. */
  components: number;
  /** Components with any metadata record. */
  withMetadata: number;
  /** Components whose record is complete (not migrated, no empty actionable section). */
  withCompleteMetadata: number;
  /** Tokens found. */
  tokens: number;
  /** Tokens that resolve to a concrete value. */
  resolvedTokens: number;
  /** Design-system components with at least one edge in either direction. */
  connectedComponents: number;
  /** Total `uses` edges — reported in the detail line, not scored. */
  edges: number;
  /** Governance rules enabled. */
  rules: number;
  /** Whether the project has adopted its OWN rules rather than running the seeded defaults. */
  rulesAdopted: boolean;
  /** Governance findings at error severity. */
  errors: number;
  /** Whether the index exists and still describes the code. */
  indexFresh: boolean;
}

export interface ReadinessSignal {
  id: string;
  label: string;
  /** What the project scores, already normalised where the threshold is a ratio. */
  value: number;
  /** The threshold this signal must clear, for display beside the value. */
  threshold: number;
  met: boolean;
  /** The level this signal gates — what it is holding back, or holding up. */
  gates: ReadinessLevel;
  /** Human phrasing of the current state. */
  detail: string;
  /** What to do about it, as a concrete gap. Empty when the signal is met. */
  action: string;
}

export interface ReadinessAssessment {
  level: ReadinessLevel;
  levelName: string;
  signals: ReadinessSignal[];
  /** Ids of the signals keeping the project off the next level. Empty at level 5. */
  blocking: string[];
  /** The single most valuable thing to do next, as a gap. Null at level 5. */
  nextAction: string | null;
}

const ratio = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/** Round to two places so a displayed value and a compared value are the same number. */
const round = (value: number): number => Math.round(value * 100) / 100;

export function assessReadiness(input: ReadinessInputs): ReadinessAssessment {
  const determinism = round(ratio(input.resolvedTokens, input.tokens));
  const connectedness = round(ratio(input.connectedComponents, input.components));
  const coverage = round(ratio(input.withMetadata, input.components));
  const completeness = round(ratio(input.withCompleteMetadata, input.components));
  const violationRate = round(ratio(input.errors, input.components));

  const missingMetadata = Math.max(0, input.components - input.withMetadata);
  const incompleteMetadata = Math.max(0, input.components - input.withCompleteMetadata);
  const unresolvedTokens = Math.max(0, input.tokens - input.resolvedTokens);

  const signals: ReadinessSignal[] = [
    {
      id: "graph-connectedness",
      label: "Relationship graph",
      value: connectedness,
      threshold: THRESHOLDS.graphConnectedness,
      met: connectedness >= THRESHOLDS.graphConnectedness,
      gates: 2,
      detail:
        input.edges === 0
          ? "No component renders another — there is a list, not a graph."
          : `${input.connectedComponents} of ${input.components} components are wired in (${input.edges} edges).`,
      action:
        connectedness >= THRESHOLDS.graphConnectedness
          ? ""
          : input.edges === 0
            ? "Build the index so relationships exist to read."
            : `Connect ${input.components - input.connectedComponents} component(s) that nothing uses and that use nothing.`,
    },
    {
      id: "token-determinism",
      label: "Tokens resolve",
      value: determinism,
      threshold: THRESHOLDS.tokenDeterminism,
      met: determinism >= THRESHOLDS.tokenDeterminism,
      gates: 2,
      detail:
        input.tokens === 0
          ? "No tokens found."
          : `${input.resolvedTokens} of ${input.tokens} tokens resolve to a value.`,
      action: unresolvedTokens
        ? `Resolve ${unresolvedTokens} token${unresolvedTokens === 1 ? "" : "s"} that point at nothing.`
        : input.tokens === 0
          ? "Extract or define the design tokens."
          : "",
    },
    {
      id: "governance-rules",
      label: "Rules encoded",
      value: input.rules,
      threshold: 1,
      met: input.rules >= 1,
      gates: 3,
      detail: input.rules ? `${input.rules} rule${input.rules === 1 ? "" : "s"} enabled.` : "No rules enabled.",
      action: input.rules ? "" : "Enable at least one governance rule so violations can be flagged.",
    },
    {
      id: "metadata-coverage",
      label: "Rationale captured",
      value: coverage,
      threshold: THRESHOLDS.metadataCoverage,
      met: coverage >= THRESHOLDS.metadataCoverage,
      gates: 3,
      detail: `${input.withMetadata} of ${input.components} components have a metadata record.`,
      action: missingMetadata
        ? `Write metadata for ${missingMetadata} component${missingMetadata === 1 ? "" : "s"} that have none.`
        : "",
    },
    {
      id: "metadata-completeness",
      label: "Docs machine-readable",
      value: completeness,
      threshold: THRESHOLDS.metadataCompleteness,
      met: completeness >= THRESHOLDS.metadataCompleteness,
      gates: 4,
      detail: `${input.withCompleteMetadata} of ${input.components} records are complete.`,
      action: incompleteMetadata
        ? `Complete ${incompleteMetadata} record${incompleteMetadata === 1 ? "" : "s"} — a migrated record reads as documentation and answers nothing.`
        : "",
    },
    {
      id: "violation-rate",
      label: "System obeys its own rules",
      value: violationRate,
      threshold: THRESHOLDS.violationRate,
      // Inverted: LOW is good. Stated here rather than left to the reader of a `met` flag.
      met: violationRate <= THRESHOLDS.violationRate,
      gates: 4,
      detail: `${input.errors} error-severity violation${input.errors === 1 ? "" : "s"} across ${input.components} components.`,
      action: input.errors ? `Fix ${input.errors} governance error${input.errors === 1 ? "" : "s"}.` : "",
    },
    {
      id: "rules-adopted",
      label: "Governance is the team's own",
      value: input.rulesAdopted ? 1 : 0,
      threshold: 1,
      met: input.rulesAdopted,
      gates: 5,
      detail: input.rulesAdopted
        ? "The project has its own governance rules."
        : "Running the seeded defaults — nobody has decided these are the rules.",
      action: input.rulesAdopted
        ? ""
        : "Review the seeded rules and commit the set this team actually wants.",
    },
    {
      id: "index-fresh",
      label: "Observable",
      value: input.indexFresh ? 1 : 0,
      threshold: 1,
      met: input.indexFresh,
      gates: 5,
      detail: input.indexFresh ? "The index describes the current code." : "The index is missing or stale.",
      action: input.indexFresh ? "" : "Rebuild the index so what the agent reads matches the code.",
    },
  ];

  // Monotone: climb only while every signal gating the next level is met. A project cannot skip a
  // rung by being excellent higher up — the ladder measures capability, and capability is limited by
  // what is missing underneath.
  let level: ReadinessLevel = 1;
  for (const candidate of [2, 3, 4, 5] as const) {
    const gating = signals.filter((signal) => signal.gates === candidate);
    if (!gating.every((signal) => signal.met)) break;
    level = candidate;
  }

  const blocking =
    level === 5 ? [] : signals.filter((s) => s.gates === level + 1 && !s.met).map((s) => s.id);

  // The most valuable next action is the first unmet signal at the blocking level, in declaration
  // order — the order they are declared in is the order they are worth doing.
  const nextAction =
    level === 5
      ? null
      : (signals.find((s) => s.gates === level + 1 && !s.met && s.action)?.action ?? null);

  return { level, levelName: LEVEL_NAMES[level], signals, blocking, nextAction };
}
