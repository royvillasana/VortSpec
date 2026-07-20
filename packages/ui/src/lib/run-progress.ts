import type { RunModel } from "./run-model";

/**
 * A holistic, at-a-glance view of where a background run is in the SDD-DE cycle.
 * The engine (Claude Code) streams tool calls, files, and prose; we don't get an
 * explicit "stage" event, so we *derive* the current stage from those signals —
 * which files were written, which skills were mentioned — and map it onto the
 * known ordered stages for the kind of operation the user started. Pure and
 * deterministic so it can be unit-tested against recorded transcripts.
 */

export type OpKind = "source" | "build" | "verify" | "pipeline" | "commit" | "other";

export type StageId =
  | "source"
  | "tokens"
  | "detect"
  | "specs"
  | "implement"
  | "visual"
  | "adversarial"
  | "commit"
  | "working";

export interface Stage {
  id: StageId;
  label: string;
}

export interface Blocker {
  title: string;
  hint: string;
  tone: "error" | "warning";
}

export interface RunProgress {
  stages: Stage[];
  /** Index into `stages` of the current (furthest-reached) stage; -1 before any. */
  currentIndex: number;
  /** Human sentence describing what's happening now. */
  legend: string;
  /** 0..1 completion estimate for the progress bar. */
  fraction: number;
  /** For the pipeline: which component of how many. */
  counter?: { done: number; total: number };
  /** Issues that may need the user to act. */
  blockers: Blocker[];
  done: boolean;
}

const CATALOG: Record<OpKind, Stage[]> = {
  source: [
    { id: "source", label: "Reading source" },
    { id: "tokens", label: "Extracting tokens" },
    { id: "detect", label: "Detecting components" },
  ],
  build: [
    { id: "specs", label: "Generating specs" },
    { id: "implement", label: "Implementing" },
  ],
  verify: [
    { id: "visual", label: "Visual QA" },
    { id: "adversarial", label: "Adversarial review" },
  ],
  pipeline: [
    { id: "specs", label: "Specs" },
    { id: "implement", label: "Build" },
    { id: "visual", label: "Visual QA" },
    { id: "adversarial", label: "Review" },
  ],
  commit: [{ id: "commit", label: "Committing" }],
  other: [{ id: "working", label: "Working" }],
};

/** Signals for each stage: file-path patterns and text markers found in the run. */
const SIGNALS: Record<Exclude<StageId, "working">, { files: RegExp[]; text: RegExp[] }> = {
  source: { files: [], text: [/design[\s_-]?source/, /\bfigma\b/, /re-?scan/, /\bmcp__[a-z_]*figma/] },
  tokens: { files: [/tokens?\.(css|scss|json|ts)$/i, /globals\.css$/i], text: [/extract\w*\s+token/, /design token/] },
  detect: { files: [/\.sdd-de\/components\.json$/i], text: [/detect\w*\s+component/, /component inventory/] },
  specs: {
    files: [/specs\/.*(component-spec|interaction-spec|page-spec)\.md$/i],
    text: [/generate-artifacts/, /component spec/],
  },
  implement: {
    files: [/(?<!spec)\.(tsx|jsx|vue|svelte)$/i],
    text: [/\bimplement\w*\b/],
  },
  visual: { files: [/visual-verify-report\.md$/i], text: [/visual-verify/, /visual qa/] },
  adversarial: { files: [/adversarial-review/i], text: [/adversarial-review/, /red-?team/] },
  commit: { files: [], text: [/git commit/, /gh pr\b/, /\/commit\b/, /pull request/] },
};

function haystack(model: RunModel): { text: string; files: string[] } {
  const text = [
    ...model.messages.map((m) => m.text),
    model.streamingText,
    ...model.activity.map((a) => a.label),
  ]
    .join("\n")
    .toLowerCase();
  return { text, files: model.files };
}

function stageReached(id: StageId, hay: { text: string; files: string[] }): boolean {
  if (id === "working") return true;
  const sig = SIGNALS[id];
  if (sig.files.some((re) => hay.files.some((f) => re.test(f)))) return true;
  return sig.text.some((re) => re.test(hay.text));
}

/** Count the per-component verdict lines the pipeline prints ("<name>: PASS|ISSUES|BLOCKED"). */
function countVerdicts(text: string): number {
  const matches = text.match(/:\s*(pass|issues|blocked)\b/gi);
  return matches ? matches.length : 0;
}

function deriveBlockers(model: RunModel): Blocker[] {
  const blockers: Blocker[] = [];
  if (model.mcpErrors.length > 0) {
    const joined = model.mcpErrors.join("; ");
    const isFigma = /figma/i.test(joined);
    blockers.push({
      title: isFigma ? "Figma isn't connected" : "A tool (MCP) isn't available",
      hint: isFigma
        ? "Open the Figma desktop app and reconnect the Figma MCP, then retry — verification falls back to a code-level audit until then."
        : `Reconnect the tool and retry. Details: ${joined}`,
      tone: "error",
    });
  }
  if (model.result?.isError) {
    blockers.push({
      title: "The step ended with an error",
      hint: (model.result.text || "Open View details for the full output, fix the cause, and retry.").slice(0, 240),
      tone: "error",
    });
  }
  const retries = model.activity.filter((a) => a.tone === "retry").length;
  if (retries >= 2 && model.status === "running") {
    blockers.push({
      title: "Claude is retrying",
      hint: "The API is rate-limiting or erroring; it will keep retrying. No action needed unless it persists.",
      tone: "warning",
    });
  }
  return blockers;
}

export function deriveProgress(
  model: RunModel,
  kind: OpKind,
  opts?: { total?: number },
): RunProgress {
  const stages = CATALOG[kind];
  const hay = haystack(model);
  const done = model.status === "done";
  const running = model.status === "running";

  // Furthest-reached stage in this kind's catalog.
  let currentIndex = -1;
  for (let i = 0; i < stages.length; i++) {
    if (stageReached(stages[i].id, hay)) currentIndex = i;
  }
  if (currentIndex < 0 && (running || done)) currentIndex = 0;

  const blockers = deriveBlockers(model);
  const stagesLen = stages.length;

  let counter: { done: number; total: number } | undefined;
  let fraction: number;
  if (kind === "pipeline" && opts?.total && opts.total > 0) {
    const finished = Math.min(countVerdicts(hay.text), opts.total);
    counter = { done: finished, total: opts.total };
    const per = 1 / opts.total;
    const intra = ((currentIndex + 1) / stagesLen) * per;
    fraction = done ? 1 : Math.min(finished * per + intra, 0.98);
  } else {
    fraction = done ? 1 : Math.min((currentIndex + 1) / stagesLen, running ? 0.95 : 1);
  }

  const stageLabel = currentIndex >= 0 ? stages[currentIndex].label : "Starting";
  let legend: string;
  if (done) {
    legend = "Done";
  } else if (counter) {
    legend = `${stageLabel} — component ${Math.min(counter.done + 1, counter.total)} of ${counter.total}`;
  } else {
    legend = `${stageLabel}…`;
  }

  return { stages, currentIndex, legend, fraction, counter, blockers, done };
}
