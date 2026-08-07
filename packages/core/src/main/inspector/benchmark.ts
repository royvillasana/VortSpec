import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  answersFromGraph,
  approxTokens,
  poseQuestions,
  resolveEntryPage,
  type BenchmarkAnswers,
  type PosedQuestion,
} from "@vortspec/core/benchmark";
import { buildIndexDigest } from "./index-digest";
import { AI_DIR, buildRelationshipIndex } from "./relationship-index";
import { readProjectConfig } from "../workspace/config-manager";
import { getInspectorComponents } from "./component-reader";

/**
 * The §1.6 benchmark harness — OpenSpec change: agentic-design-system, task 2.10.
 *
 * WHAT THIS MEASURES AND WHAT IT DOES NOT, stated up front because the distinction is the whole
 * value of the number:
 *
 *  • **Token cost is measured here, deterministically.** It is the headline claim (+3.5%, "the
 *    infrastructure converts token spend from exploration into analysis") and it needs no model
 *    runs at all: the digest is a string, and the control is the same digest with no index present.
 *  • **Accuracy, run-to-run variance, false negatives and speed are NOT measured here.** Each needs
 *    N independent agent trials — the board used 11 — and no amount of static analysis substitutes
 *    for one. This harness prepares them: it resolves the entry page, poses the four questions in
 *    order, and derives the answer key a trial is graded against.
 *
 * Reporting a computed number as if it were a measured one would corrupt the very comparison the
 * change is judged on, so the result type keeps them in separate fields.
 */

export interface BenchmarkTokenCost {
  /** The digest a grounded run pays for WITH the index present. */
  withIndex: number;
  /** The same digest with the index absent — the control. */
  withoutIndex: number;
  /** `withIndex - withoutIndex`, the infrastructure's added cost. */
  delta: number;
  /** As a percentage of the control, comparable to §1.6's +3.5%. */
  deltaPercent: number;
}

export interface BenchmarkPreparation {
  ok: boolean;
  /** Null when no entry page could be resolved — reported, never guessed. */
  entryPage: string | null;
  questions: PosedQuestion[];
  /** What the index makes answerable. The key a trial's answers are graded against. */
  answerKey: BenchmarkAnswers | null;
  tokenCost: BenchmarkTokenCost | null;
  /** What still requires real trials, named so a reader cannot mistake this for a full run. */
  requiresTrials: string[];
  message: string;
}

const REQUIRES_TRIALS = [
  "accuracy (needs N independent agent runs graded against the answer key)",
  "run-to-run variance (needs repeated runs — the board used 11 trials)",
  "false negatives (needs runs; this is the metric the index exists to drive to zero)",
  "speed (wall-clock of real runs)",
];

/**
 * Prepare a benchmark run and measure everything measurable without a model.
 *
 * Builds the index, measures the digest with and without it, resolves the entry page, poses the four
 * questions IN ORDER, and derives the answer key.
 */
export async function prepareBenchmark(projectPath: string): Promise<BenchmarkPreparation> {
  const config = await readProjectConfig(projectPath);

  // Control FIRST: the digest as a run would see it with no index present. Measured before the
  // index is built, because building it is what changes the answer.
  await rm(join(projectPath, AI_DIR), { recursive: true, force: true });
  const withoutIndex = approxTokens(await buildIndexDigest(projectPath).catch(() => ""));

  const { graph } = await buildRelationshipIndex(projectPath);
  // The curated roster is Q1's answer where one exists (see `answersFromGraph`). Best-effort: a
  // project with no `components.json` falls back to the scan, which is then the only answer there is.
  const roster = await getInspectorComponents(projectPath).catch(() => null);
  const withIndex = approxTokens(await buildIndexDigest(projectPath).catch(() => ""));

  const entryPage = resolveEntryPage(config?.framework ?? undefined, graph.components.map((c) => c.path));
  const delta = withIndex - withoutIndex;
  const tokenCost: BenchmarkTokenCost = {
    withIndex,
    withoutIndex,
    delta,
    deltaPercent: withoutIndex > 0 ? Math.round((delta / withoutIndex) * 1000) / 10 : 0,
  };

  if (!entryPage)
    return {
      ok: false,
      entryPage: null,
      questions: [],
      answerKey: null,
      tokenCost,
      requiresTrials: REQUIRES_TRIALS,
      // Reported, not papered over: a run against the wrong page produces plausible answers that
      // measure nothing.
      message:
        "No entry page could be resolved for this project, so Q2–Q4 have no subject. " +
        "Name one explicitly before running the benchmark.",
    };

  return {
    ok: true,
    entryPage,
    questions: poseQuestions(entryPage),
    answerKey: answersFromGraph(graph, entryPage, roster?.components.length),
    tokenCost,
    requiresTrials: REQUIRES_TRIALS,
    message:
      `Benchmark ready against ${entryPage}. Token cost measured: ${withoutIndex} → ${withIndex} tokens ` +
      `(${delta >= 0 ? "+" : ""}${tokenCost.deltaPercent}%). Accuracy, variance, false negatives and speed ` +
      `require independent trials.`,
  };
}
