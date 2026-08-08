import { describe, expect, it } from "vitest";
import { buildJudgePrompt, JUDGE_TIER, MAX_JUDGE_CHECKS } from "./governance-judge";
import { defaultGovernance } from "./governance";
import type { DeferredCheck } from "./governance-eval";

const config = defaultGovernance();
const check = (n: number): DeferredCheck => ({
  rule: "semantic-color/intent-token-used-decoratively",
  component: `C${n}`,
  file: `src/components/C${n}.tsx`,
  evidence: [{ token: "color-danger-500", property: "background-color", syntax: "tailwind" }],
});

describe("the judgment pass (task 4.7)", () => {
  it("routes to the cheapest tier", () => {
    expect(JUDGE_TIER).toBe("haiku");
  });

  it("builds NO prompt when nothing was deferred", () => {
    // Asking a model to confirm an empty list is a model call that cannot change an outcome.
    expect(buildJudgePrompt([], config)).toEqual({ prompt: "", included: [], omitted: 0 });
  });

  it("carries the rule's requirement and the placements, not the source", () => {
    const { prompt } = buildJudgePrompt([check(1)], config);
    expect(prompt).toContain("semantic-color/intent-token-used-decoratively");
    expect(prompt).toContain("--color-danger-500 on background-color");
    expect(prompt).toContain("must carry that meaning");
    expect(prompt).not.toContain("export const");
  });

  it("defaults an uncertain verdict to NOT violated, and says why that is the default", () => {
    const { prompt } = buildJudgePrompt([check(1)], config);
    expect(prompt).toContain("`violated: false`");
    expect(prompt).toContain("an uncertain finding is worse than a missing one");
  });

  it("bounds the batch and REPORTS what it left out", () => {
    const many = Array.from({ length: MAX_JUDGE_CHECKS + 5 }, (_, i) => check(i));
    const plan = buildJudgePrompt(many, config);
    expect(plan.included).toHaveLength(MAX_JUDGE_CHECKS);
    expect(plan.omitted).toBe(5);
  });

  it("indexes checks so verdicts can be matched back", () => {
    const { prompt } = buildJudgePrompt([check(1), check(2)], config);
    expect(prompt).toContain("### Check 0");
    expect(prompt).toContain("### Check 1");
  });
});
