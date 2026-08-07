import { profileFor } from "./framework-profiles";
import type { RelationshipGraph } from "./relationship-graph";

/**
 * The §1.6 benchmark protocol — OpenSpec change: agentic-design-system, task 2.10.
 *
 * The four questions were recovered from the FigJam board (Frame 184); the plan had referenced them
 * for two tasks without ever recording them, which made 2.10 and 3.8 unexecutable.
 *
 * TWO PROPERTIES OF THE PROTOCOL that the results table alone does not carry, and that a
 * reimplementation gets wrong by default:
 *
 *  1. **The questions are SEQUENTIAL.** Q3 says "that page" and Q4 says "these components" — each
 *     depends on the previous answer. The board tested this deliberately, naming "session
 *     pollution, sequential queries, accumulated context" as the conditions the infrastructure had
 *     to survive. Running the four as independent sessions measures something easier.
 *  2. **Q2's page must be PARAMETERIZED.** The board asked about `index.astro`, which is its own
 *     repo rather than a property of the method. VortSpec supports nine frameworks; a literal
 *     `index.astro` makes the benchmark unrunnable on eight of them, and would test Astro parsing
 *     rather than the index.
 *
 * PURE — no fs.
 */

export type ArcPhase = "audit" | "report" | "compose";

export interface BenchmarkQuestion {
  id: "Q1" | "Q2" | "Q3" | "Q4";
  /** `{entry}` is replaced with the project's resolved entry page. */
  template: string;
  phase: ArcPhase;
  /** What the question exercises, from the board. */
  exercises: string;
}

export const BENCHMARK_QUESTIONS: readonly BenchmarkQuestion[] = [
  {
    id: "Q1",
    template: "How many components do we have on this repo?",
    phase: "audit",
    exercises: "Query the index for a complete inventory",
  },
  {
    id: "Q2",
    template: "List all components used on {entry}",
    phase: "report",
    exercises: "Read the relationship graph, generate a specification",
  },
  {
    id: "Q3",
    template: "List all atoms used on that page",
    phase: "compose",
    exercises: "Reason over cached data, filter by category",
  },
  {
    id: "Q4",
    template: "How many of these components are being used on other pages?",
    phase: "compose",
    exercises: "Traverse pre-computed usedBy relationships",
  },
];

/**
 * The project's main entry page — what `{entry}` resolves to.
 *
 * Per framework, most specific first, because a Next project can have both `app/page.tsx` and a
 * legacy `pages/index.tsx` and the app router is the live one. Returns null when nothing matches,
 * which the caller must report rather than paper over: a benchmark run against the WRONG page
 * produces answers that look plausible and are measuring nothing.
 */
export function resolveEntryPage(framework: string | undefined, files: readonly string[]): string | null {
  const present = new Set(files);
  for (const candidate of entryCandidates(framework)) if (present.has(candidate)) return candidate;
  // Fall back to any index-ish page the project does have, so a non-standard layout still runs.
  const fallback = files
    .filter((file) => /(^|\/)(index|page|app|home)\.[jt]sx?$|(^|\/)(index|page)\.(astro|vue|svelte)$/i.test(file))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return fallback[0] ?? null;
}

function entryCandidates(framework: string | undefined): string[] {
  switch ((framework ?? "").toLowerCase()) {
    case "next":
      return ["app/page.tsx", "app/page.jsx", "src/app/page.tsx", "pages/index.tsx", "src/pages/index.tsx"];
    case "astro":
      return ["src/pages/index.astro"];
    case "nuxt":
      return ["app.vue", "pages/index.vue"];
    case "sveltekit":
      return ["src/routes/+page.svelte"];
    case "svelte":
      return ["src/App.svelte", "src/routes/+page.svelte"];
    case "vue":
      return ["src/App.vue", "src/pages/index.vue"];
    case "angular":
      return ["src/app/app.component.ts", "src/app/app.component.html"];
    case "react":
    case "vanilla":
    default:
      return ["src/App.tsx", "src/App.jsx", "src/pages/index.tsx", "src/index.tsx", "index.html"];
  }
}

/** One question, filled in for a project. */
export interface PosedQuestion extends BenchmarkQuestion {
  question: string;
}

export function poseQuestions(entryPage: string): PosedQuestion[] {
  return BENCHMARK_QUESTIONS.map((question) => ({
    ...question,
    question: question.template.replace("{entry}", entryPage),
  }));
}

/** The answers the index makes available — the ANSWER KEY a trial's responses are graded against. */
export interface BenchmarkAnswers {
  entryPage: string;
  /** Q1 — design-system components, not pages. */
  componentCount: number;
  /** Q2 — components rendered on the entry page. */
  onEntryPage: string[];
  /** Q3 — of those, the ones whose tier is `atom`. */
  atomsOnEntryPage: string[];
  /** Q4 — of those, the ones also rendered somewhere other than the entry page. */
  reusedElsewhere: { component: string; otherPages: string[] }[];
}

/**
 * Derive the answer key from the graph.
 *
 * This is what the index MAKES ANSWERABLE, and it is the key a trial is graded against — not a
 * measurement of the benchmark itself. Grading an agent's answers against a key derived from the
 * same index would be circular for accuracy, which is why 2.10's accuracy number needs independent
 * trials; what this key legitimately proves is the prerequisite — that the four questions are
 * answerable from the index at all, and with what content.
 */
export function answersFromGraph(graph: RelationshipGraph, entryPage: string): BenchmarkAnswers {
  const byName = new Map(graph.components.map((component) => [component.name, component]));
  const entry = graph.components.find((component) => component.path === entryPage);

  const onEntryPage = [...(entry?.uses ?? [])].sort();
  const atoms = onEntryPage.filter((name) => byName.get(name)?.tier === "atom");

  const reused = onEntryPage
    .map((name) => {
      const otherPages = (byName.get(name)?.usedBy ?? [])
        .filter((user) => user !== entry?.name)
        .sort();
      return { component: name, otherPages };
    })
    .filter((entryRow) => entryRow.otherPages.length > 0);

  return {
    // Q1 counts the DESIGN SYSTEM. Counting pages too is the wrong answer in a way nobody notices.
    componentCount: graph.components.filter((component) => component.designSystem).length,
    entryPage,
    onEntryPage,
    atomsOnEntryPage: atoms,
    reusedElsewhere: reused,
  };
}

/**
 * A rough token count for a prompt fragment.
 *
 * ~4 characters per token is the usual English rule of thumb. Deliberately approximate and named as
 * such: the §1.6 claim is a 3.5% DIFFERENCE between two runs, and a consistent estimator measures a
 * difference correctly even when its absolute value is off. Using a real tokenizer here would add a
 * dependency to make a ratio marginally more precise.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
