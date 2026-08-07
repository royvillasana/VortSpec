import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BENCHMARK_QUESTIONS, resolveEntryPage } from "@vortspec/core/benchmark";
import { prepareBenchmark } from "./benchmark";

/**
 * The §1.6 benchmark harness — OpenSpec change: agentic-design-system, task 2.10.
 *
 * These tests assert what the harness CAN establish without a model: that the four questions are
 * answerable from the index, that Q2's page is resolved per framework rather than hardcoded, and
 * that the token cost is measured against a real control. What they deliberately do NOT assert is
 * accuracy or variance — those need independent trials, and a static test claiming them would be
 * the exact false precision this harness is built to avoid.
 */

let dir = "";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** A hand-verifiable project: 3 design-system components, one page rendering two of them. */
async function project(): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
  );
  await write("src/tokens.css", ":root {\n  --color-primary: #1d4ed8;\n}\n");
  await write(
    ".sdd-de/components.json",
    JSON.stringify([
      { name: "Button", level: "atom" },
      { name: "Badge", level: "atom" },
      { name: "Card", level: "molecule" },
    ]),
  );
  await write("src/components/Button.tsx", `export const Button = () => <button/>;`);
  await write("src/components/Badge.tsx", `export const Badge = () => <span/>;`);
  await write(
    "src/components/Card.tsx",
    `import { Badge } from "./Badge";\nexport const Card = () => <div><Badge/></div>;`,
  );
  // The entry page renders Button and Card. Badge is rendered only inside Card.
  await write(
    "src/App.tsx",
    `import { Button } from "./components/Button";\nimport { Card } from "./components/Card";\nexport const App = () => <div><Button/><Card/></div>;`,
  );
  // A second page that also renders Button — this is what makes Q4 non-trivial.
  await write(
    "src/pages/About.tsx",
    `import { Button } from "../components/Button";\nexport const About = () => <Button/>;`,
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-bench-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Q2's page is parameterized, not hardcoded to index.astro (task 2.10)", () => {
  it("resolves the entry page per framework", () => {
    expect(resolveEntryPage("next", ["app/page.tsx", "src/components/Button.tsx"])).toBe("app/page.tsx");
    expect(resolveEntryPage("astro", ["src/pages/index.astro"])).toBe("src/pages/index.astro");
    expect(resolveEntryPage("sveltekit", ["src/routes/+page.svelte"])).toBe("src/routes/+page.svelte");
    expect(resolveEntryPage("react", ["src/App.tsx"])).toBe("src/App.tsx");
  });

  it("prefers the app router over a legacy pages/ entry on Next", () => {
    // Both can exist; the app router is the live one, and benchmarking the dead page would measure
    // nothing while looking fine.
    expect(resolveEntryPage("next", ["pages/index.tsx", "app/page.tsx"])).toBe("app/page.tsx");
  });

  it("falls back to the shallowest index-ish page for a non-standard layout", () => {
    expect(resolveEntryPage("react", ["src/deep/nested/index.tsx", "src/index.tsx"])).toBe("src/index.tsx");
  });

  it("returns null rather than guessing when there is no entry page", () => {
    expect(resolveEntryPage("react", ["src/components/Button.tsx"])).toBeNull();
  });
});

describe("the four questions are answerable from the index (task 2.10)", () => {
  it("poses all four, in order, with the entry page filled in", async () => {
    const prepared = await prepareBenchmark(dir);
    expect(prepared.ok).toBe(true);
    expect(prepared.entryPage).toBe("src/App.tsx");
    expect(prepared.questions.map((question) => question.id)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(prepared.questions[1].question).toBe("List all components used on src/App.tsx");
    // Q3/Q4 keep their back-references — they are sequential by design, not independent.
    expect(prepared.questions[2].question).toContain("that page");
    expect(prepared.questions[3].question).toContain("these components");
  });

  it("maps each question to its ARC phase, the frame the benchmark scores against", () => {
    expect(BENCHMARK_QUESTIONS.map((question) => question.phase)).toEqual([
      "audit",
      "report",
      "compose",
      "compose",
    ]);
  });

  it("Q1 counts the design system, not the pages that consume it", async () => {
    const { answerKey } = await prepareBenchmark(dir);
    // Button, Badge, Card — NOT App or About.
    expect(answerKey?.componentCount).toBe(3);
  });

  it("Q2 lists what the entry page renders — not what it transitively contains", async () => {
    const { answerKey } = await prepareBenchmark(dir);
    // Badge is rendered inside Card, not on the page itself. Including it would be the deep-tracing
    // answer to a different question.
    expect(answerKey?.onEntryPage).toEqual(["Button", "Card"]);
  });

  it("Q3 filters that set by tier", async () => {
    const { answerKey } = await prepareBenchmark(dir);
    expect(answerKey?.atomsOnEntryPage).toEqual(["Button"]); // Card is a molecule
  });

  it("Q4 names which of those are reused, and where", async () => {
    const { answerKey } = await prepareBenchmark(dir);
    expect(answerKey?.reusedElsewhere).toEqual([{ component: "Button", otherPages: ["About"] }]);
  });

  it("reports rather than guesses when no entry page resolves", async () => {
    const bare = await mkdtemp(join(tmpdir(), "vortspec-bench-bare-"));
    try {
      await writeFile(join(bare, "package.json"), "{}", "utf8");
      const prepared = await prepareBenchmark(bare);
      expect(prepared.ok).toBe(false);
      expect(prepared.entryPage).toBeNull();
      expect(prepared.message).toContain("No entry page could be resolved");
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});

describe("token cost is measured against a real control (task 2.10)", () => {
  it("measures the digest with and without the index present", async () => {
    const { tokenCost } = await prepareBenchmark(dir);
    expect(tokenCost).not.toBeNull();
    expect(tokenCost!.withoutIndex).toBeGreaterThan(0);
    // The index ADDS to the prompt — that is the cost the §1.6 claim is about.
    expect(tokenCost!.withIndex).toBeGreaterThan(tokenCost!.withoutIndex);
    expect(tokenCost!.delta).toBe(tokenCost!.withIndex - tokenCost!.withoutIndex);
  });

  it("names what still requires real trials, so the number cannot be over-read", async () => {
    // A harness that reported accuracy from static analysis would corrupt the comparison the whole
    // change is judged on.
    const prepared = await prepareBenchmark(dir);
    expect(prepared.requiresTrials.join(" ")).toMatch(/accuracy/);
    expect(prepared.requiresTrials.join(" ")).toMatch(/variance/);
    expect(prepared.requiresTrials.join(" ")).toMatch(/false negatives/);
    expect(prepared.message).toContain("require independent trials");
  });
});
