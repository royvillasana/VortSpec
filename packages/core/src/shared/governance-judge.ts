import type { DeferredCheck } from "./governance-eval";
import type { GovernanceConfig } from "./governance";

/**
 * The judgment pass — OpenSpec change: agentic-design-system, task 4.7.
 *
 * PURE — builds the prompt; it does not run anything.
 *
 * **This is the only part of governance v2 that costs a model call.** The plan assumed report
 * generation itself would be a model run and budgeted Haiku for it; the group 4 design made both
 * reports deterministic derivations of the graph, so generating them costs nothing at all. What is
 * left needing judgment is the handful of rules marked `judgment` — whether a red is meaning or
 * decoration, whether two elevations on one component are a nested surface or a mistake.
 *
 * `JUDGE_TIER` is therefore the cheapest tier that can hold the schema, consistent with the existing
 * verify/Apply routing. A run is only worth making when there is something deferred; `buildJudgePrompt`
 * returns "" otherwise rather than asking a model to confirm an empty list.
 */

/** The model tier this pass routes to. */
export const JUDGE_TIER = "haiku" as const;

/** How many checks one run may carry, so a large design system cannot produce an unbounded prompt. */
export const MAX_JUDGE_CHECKS = 40;

export interface JudgePlan {
  prompt: string;
  /** The checks actually included — the caller matches verdicts back by index. */
  included: DeferredCheck[];
  /** How many were left for a later run. Reported, never silently dropped. */
  omitted: number;
}

/**
 * Build the judgment prompt for the deferred checks.
 *
 * Each check arrives with only the token placements the rule is about — never the component's
 * source. A bounded question stays cheap and answerable; handing over whole files turns a schema-shaped
 * check into an open-ended review, which is the cost failure the deterministic/judgment split exists
 * to prevent.
 */
export function buildJudgePrompt(deferred: readonly DeferredCheck[], config: GovernanceConfig): JudgePlan {
  const included = deferred.slice(0, MAX_JUDGE_CHECKS);
  const omitted = deferred.length - included.length;
  if (!included.length) return { prompt: "", included: [], omitted: 0 };

  const rules = new Map(config.rules.map((rule) => [rule.id, rule]));
  const lines: string[] = [
    "Judge each design-system check below. Answer ONLY from the evidence given — you are not being asked to review the components.",
    "",
  ];

  included.forEach((check, index) => {
    const rule = rules.get(check.rule);
    lines.push(
      `### Check ${index}`,
      `- rule: ${check.rule}`,
      `- requires: ${rule?.statement ?? "(rule text unavailable)"}`,
      `- component: ${check.component}`,
      `- placements: ${check.evidence.map((e) => `--${e.token} on ${e.property}`).join("; ")}`,
      "",
    );
  });

  lines.push(
    "For each check, decide whether the rule is VIOLATED.",
    // The default matters: an uncertain verdict must not become a finding. A wrong error costs a
    // person a real investigation, and enough of them cost the audit its credibility.
    "If you cannot tell from the placements alone, answer `violated: false` and say why in `reason` — an uncertain finding is worse than a missing one, because someone will act on it.",
    "",
    "Return ONLY a fenced ```json block:",
    '{ "verdicts": [ { "check": 0, "violated": true|false, "reason": "<one line>" } ] }',
  );

  return { prompt: lines.join("\n"), included, omitted };
}
