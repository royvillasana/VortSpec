import { DESIGN_SOURCE_OPTIONS } from "./setup";

/**
 * Design-source parity between the APP and the SDD-DE skills — OpenSpec change:
 * agentic-design-system, task 9.3.
 *
 * PURE — the fs half lives in the test, which reads the installed toolkit.
 *
 * **Why this is a guard rather than a fix.** The four branching skills live in
 * `@royvillasana/sdd-de`, a separate published package; this repository consumes it and its working
 * copy at `.sdd-de/` is gitignored. Editing the prose here would be lost on the next toolkit update
 * and would never reach a user, so 9.1 and 9.2 belong in that repository. What belongs HERE is the
 * assertion, because the thing that drifts is the relationship between `DESIGN_SOURCE_OPTIONS` — which
 * this repo owns — and the branches — which it does not. A source added to the app can otherwise
 * silently lack a branch, and the agent then improvises down whichever branch it likes.
 */

/** The skills that branch on `design_source`. */
export const BRANCHING_SKILLS = ["setup", "enrich-brief", "generate-artifacts", "visual-verify"] as const;
export type BranchingSkill = (typeof BRANCHING_SKILLS)[number];

/**
 * Sources known to be missing a branch today, with the reason kept next to them.
 *
 * An allowlist, not an exemption: the parity check fails when a NEW gap appears **and** when an entry
 * here is fixed. A stale allowlist is how a known-failure list turns into a permanent one — the same
 * failure mode as a red suite people learn to scroll past.
 */
export const KNOWN_GAPS: { source: string; why: string }[] = [
  {
    source: "enterprise",
    why: "The app's own 'Connect Enterprise Design System' flow writes this value, so a project the app created matches no branch. Fix in the sdd-de repo: retitle Branch B to `library | enterprise` and state the consume rules.",
  },
  {
    source: "claude-design",
    why: "Found by this check, not by the task list that motivated it. A `claude-design` project matches no branch either, and the agent most likely falls through to the Figma path.",
  },
];

export interface ParityResult {
  /** Sources with no branch, per skill. */
  missing: { skill: BranchingSkill; source: string }[];
  /** Gaps present that the allowlist does not cover — a regression. */
  unexpected: { skill: BranchingSkill; source: string }[];
  /** Allowlisted gaps that no longer exist — the allowlist is stale and should shrink. */
  fixed: string[];
}

/**
 * Compare each skill's text against the app's source list.
 *
 * Matching is by the source VALUE appearing anywhere in the skill — deliberately loose. A stricter
 * check (a heading of an exact shape) would fail on every reasonable rewording, and a parity guard
 * that cries wolf gets deleted. Loose matching can only under-report, which is the safe direction:
 * it will not manufacture a gap that is not there.
 */
export function checkParity(skillText: Record<BranchingSkill, string>): ParityResult {
  const sources = DESIGN_SOURCE_OPTIONS.map((option) => option.value as string);
  const known = new Set(KNOWN_GAPS.map((gap) => gap.source));

  const missing: ParityResult["missing"] = [];
  for (const skill of BRANCHING_SKILLS) {
    const text = (skillText[skill] ?? "").toLowerCase();
    for (const source of sources) if (!text.includes(source.toLowerCase())) missing.push({ skill, source });
  }

  const missingSources = new Set(missing.map((entry) => entry.source));
  return {
    missing,
    unexpected: missing.filter((entry) => !known.has(entry.source)),
    fixed: [...known].filter((source) => !missingSources.has(source)).sort(),
  };
}
