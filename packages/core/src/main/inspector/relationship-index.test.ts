import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseToon, type ToonValue } from "@vortspec/core/toon";
import {
  INDEX_PATH,
  TOKENS_PATH,
  USAGE_PATH,
  buildRelationshipIndex,
  checkIndexFreshness,
  componentsUsingToken,
  indexStaleness,
  readIndexStamp,
  readTokenIndex,
  tokensUsedByComponent,
} from "./relationship-index";

/**
 * The three `.vortspec/ai/` artifacts — OpenSpec change: agentic-design-system, task 2.6.
 *
 * Every artifact is asserted by PARSING it back, not by matching text. A test that greps for a
 * substring passes on a file whose rows have silently shifted a column, which is exactly the
 * failure the round trip exists to catch.
 */

let dir = "";
const STAMP = "2026-08-07T12:00:00.000Z";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** A small but real project: two design-system components, a page that uses one and shadows none. */
async function project(): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
  );
  await write("src/tokens.css", ":root {\n  --color-primary: #1d4ed8;\n  --radius-md: 8px;\n  --spacing-4: 16px;\n}\n");
  await write(
    ".sdd-de/components.json",
    JSON.stringify([
      { name: "Button", level: "atom" },
      { name: "Card", level: "molecule" },
    ]),
  );
  await write(
    "src/components/Button.tsx",
    `export const Button = () => <button className="bg-[var(--color-primary)] rounded-[var(--radius-md)] p-[var(--spacing-4)]" />;`,
  );
  await write(
    "src/components/Card.tsx",
    `export const Card = ({ children }) => <div className="rounded-[var(--radius-md)]">{children}</div>;`,
  );
  await write(
    "src/pages/Home.tsx",
    `import { Button } from "../components/Button";\nexport const Home = () => <div><Button/><Button/></div>;`,
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-rel-index-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function artifact(path: string): Promise<Record<string, ToonValue>> {
  return parseToon(await readFile(join(dir, path), "utf8"));
}

describe("building the index artifacts (task 2.6)", () => {
  it("writes all three artifacts under .vortspec/ai/", async () => {
    const result = await buildRelationshipIndex(dir, { generatedAt: STAMP });
    expect(result.written).toEqual([INDEX_PATH, USAGE_PATH, TOKENS_PATH]);
  });

  it("stamps every artifact, so staleness is answerable without a rebuild", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    for (const path of [INDEX_PATH, USAGE_PATH, TOKENS_PATH]) {
      expect((await artifact(path)).generatedAt).toBe(STAMP);
    }
    expect(await readIndexStamp(dir)).toBe(STAMP);
  });

  it("index.toon records what exists, with adoption per component", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const index = await artifact(INDEX_PATH);
    const components = index.components as Record<string, ToonValue>[];
    const button = components.find((component) => component.name === "Button")!;

    expect(button.path).toBe("src/components/Button.tsx");
    expect(button.instances).toBe(2); // rendered twice on the page
    expect(button.adoption).toBe("adopted");
    // Card is never imported — a real state, distinct from "imported and never rendered".
    expect(components.find((component) => component.name === "Card")?.adoption).toBe("unimported");
  });

  it("states truncation rather than reporting a partial count as complete", async () => {
    const index = await artifact((await buildRelationshipIndex(dir, { generatedAt: STAMP }), INDEX_PATH));
    expect((index.stats as Record<string, ToonValue>).truncated).toBe(false);
  });

  it("component-usage.toon carries both edge directions", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const usage = await artifact(USAGE_PATH);
    const rows = usage.usage as Record<string, ToonValue>[];
    expect(rows.find((row) => row.name === "Button")?.usedBy).toBe("Home");
    expect(rows.find((row) => row.name === "Home")?.uses).toBe("Button");
  });

  it("joins lists with | so a list can never become extra columns", async () => {
    // `,` is the row delimiter. A list written with it would silently shift every value after it —
    // and the file would still look fine.
    await write(
      "src/pages/Home.tsx",
      `import { Button } from "../components/Button";\nimport { Card } from "../components/Card";\nexport const Home = () => <div><Button/><Card/></div>;`,
    );
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const rows = (await artifact(USAGE_PATH)).usage as Record<string, ToonValue>[];
    expect(rows.find((row) => row.name === "Home")?.uses).toBe("Button|Card");
  });

  it("design-tokens.toon is a REVERSE index: token → consuming components", async () => {
    // Answers "what breaks if I change this token" without scanning a single component source.
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const tokens = (await artifact(TOKENS_PATH)).tokens as Record<string, ToonValue>[];
    const radius = tokens.find((token) => token.name === "radius-md")!;
    expect(radius.usedBy).toBe("Button|Card");
    expect(radius.uses).toBe(2);
    const primary = tokens.find((token) => token.name === "color-primary")!;
    expect(primary.usedBy).toBe("Button");
    expect(primary.value).toBe("#1d4ed8");
  });

  it("reports a token nothing consumes, rather than omitting it", async () => {
    await write("src/tokens.css", ":root {\n  --color-primary: #1d4ed8;\n  --unused-token: 4px;\n}\n");
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const tokens = (await artifact(TOKENS_PATH)).tokens as Record<string, ToonValue>[];
    const orphan = tokens.find((token) => token.name === "unused-token")!;
    expect(orphan.usedBy).toBe("");
    expect(orphan.uses).toBe(0);
  });

  it("is byte-stable — the same project and stamp produce identical files", async () => {
    // The artifacts are committed and read in a diff. A writer that reordered itself would show a
    // change on every build and train everyone to skip the diff.
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const first = await Promise.all([INDEX_PATH, USAGE_PATH, TOKENS_PATH].map((p) => readFile(join(dir, p), "utf8")));
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const second = await Promise.all([INDEX_PATH, USAGE_PATH, TOKENS_PATH].map((p) => readFile(join(dir, p), "utf8")));
    expect(second).toEqual(first);
  });

  it("records a shadow implementation with the file that should have imported instead", async () => {
    await write(
      "src/pages/Landing.tsx",
      `export const Landing = () => <button className="bg-[var(--color-primary)] rounded-[var(--radius-md)] p-[var(--spacing-4)]" />;`,
    );
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const shadows = (await artifact(USAGE_PATH)).shadows as Record<string, ToonValue>[];
    const found = shadows.find((shadow) => shadow.file === "src/pages/Landing.tsx");
    expect(found?.component).toBe("Button");
    expect(String(found?.sharedTokens)).toContain("color-primary");
  });

  it("degrades to an empty index rather than throwing on a project with no components", async () => {
    const bare = await mkdtemp(join(tmpdir(), "vortspec-rel-bare-"));
    try {
      const result = await buildRelationshipIndex(bare, { generatedAt: STAMP });
      expect(result.graph.components).toEqual([]);
      expect(result.written).toHaveLength(3);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});

describe("pages are nodes, but are not counted as components (task 2.6)", () => {
  it("separates the design-system count from the node count", async () => {
    // "How many components do we have on this repo?" — benchmark Q1 — must not include the pages
    // that consume them, or the answer is wrong in a way nobody notices.
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const stats = (await artifact(INDEX_PATH)).stats as Record<string, ToonValue>;
    expect(stats.components).toBe(2); // Button, Card
    expect(stats.nodes).toBe(3); // …plus the Home page
  });

  it("labels each node so a reader can tell a page from a component", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const components = (await artifact(INDEX_PATH)).components as Record<string, ToonValue>[];
    expect(components.find((c) => c.name === "Button")?.kind).toBe("component");
    expect(components.find((c) => c.name === "Home")?.kind).toBe("page");
  });

  it("prunes a file connected to nothing — a swept-up util is not a graph node", async () => {
    await write("src/lib/format.ts", `export const format = (n: number) => String(n);`);
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const components = (await artifact(INDEX_PATH)).components as Record<string, ToonValue>[];
    expect(components.map((c) => c.name)).not.toContain("Format");
  });

  it("keeps a design-system component with no edges — 'nothing uses this' is the finding", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const components = (await artifact(INDEX_PATH)).components as Record<string, ToonValue>[];
    expect(components.find((c) => c.name === "Card")?.adoption).toBe("unimported");
  });
});

describe("the token reverse index answers without scanning component sources (task 2.7)", () => {
  /**
   * The proof is destructive on purpose: build the index, then DELETE every component source and
   * the token file, and ask again. If any answer changed, the read path was quietly falling back to
   * a scan — which is the one thing this artifact exists to make unnecessary, and the one thing a
   * non-destructive test cannot rule out.
   */
  async function deleteAllSources(): Promise<void> {
    await rm(join(dir, "src"), { recursive: true, force: true });
    await rm(join(dir, ".sdd-de/components.json"), { force: true });
  }

  it("answers token → components after every source file is gone", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const before = await componentsUsingToken(dir, "radius-md");
    expect(before).toEqual(["Button", "Card"]);

    await deleteAllSources();

    expect(await componentsUsingToken(dir, "radius-md")).toEqual(before);
    expect(await componentsUsingToken(dir, "color-primary")).toEqual(["Button"]);
  });

  it("answers component → tokens from the same file, with no second index to drift", async () => {
    // Derived by inverting the reverse index rather than stored separately: two copies of one
    // relationship disagree the moment either is regenerated alone.
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    await deleteAllSources();

    expect(await tokensUsedByComponent(dir, "Button")).toEqual(["color-primary", "radius-md", "spacing-4"]);
    expect(await tokensUsedByComponent(dir, "Card")).toEqual(["radius-md"]);
  });

  it("accepts a token name with or without the -- prefix", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    expect(await componentsUsingToken(dir, "--radius-md")).toEqual(["Button", "Card"]);
  });

  it("returns an empty list for a token nothing consumes, and for an unknown one", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    expect(await componentsUsingToken(dir, "no-such-token")).toEqual([]);
    const index = await readTokenIndex(dir);
    expect(index?.find((row) => row.token === "spacing-4")?.usedBy).toEqual(["Button"]);
  });

  it("returns null — not an empty answer — when the index has not been built", async () => {
    // "Nothing uses this token" and "we never looked" are different facts, and collapsing them
    // would let a caller report a token as safe to delete because the index was missing.
    const bare = await mkdtemp(join(tmpdir(), "vortspec-no-index-"));
    try {
      expect(await readTokenIndex(bare)).toBeNull();
      expect(await componentsUsingToken(bare, "radius-md")).toBeNull();
      expect(await tokensUsedByComponent(bare, "Button")).toBeNull();
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("reads a corrupt artifact as 'not built' rather than as 'no tokens'", async () => {
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    await writeFile(join(dir, TOKENS_PATH), "this is not toon\n", "utf8");
    expect(await readTokenIndex(dir)).toBeNull();
  });

  it("does not rebuild on read — a stale index answers stale, visibly", async () => {
    // A silent rebuild inside a read would hide staleness behind an answer that looks fresh, which
    // is precisely what task 2.9's staleness check exists to surface.
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    await write(
      "src/components/Card.tsx",
      `export const Card = () => <div className="bg-[var(--color-primary)]" />;`,
    );

    // The source now uses --color-primary, but the index still says it does not.
    expect(await componentsUsingToken(dir, "color-primary")).toEqual(["Button"]);
    expect(await readIndexStamp(dir)).toBe(STAMP);
  });
});

describe("frameworks whose template tag is not the class name (Angular end to end)", () => {
  it("builds real edges for an Angular project with a separate template file", async () => {
    // The two halves of the same failure: the tag `<app-button>` is unrelated to the class
    // `ButtonComponent`, AND it lives in a `.html` the `.ts` scan would never open. Miss either and
    // an Angular project's graph is silently empty of edges.
    const ng = await mkdtemp(join(tmpdir(), "vortspec-ng-"));
    const put = async (rel: string, body: string) => {
      await mkdir(dirname(join(ng, rel)), { recursive: true });
      await writeFile(join(ng, rel), body, "utf8");
    };
    try {
      await put(".sdd-de/project.yaml", "framework: angular\ncomponent_dir: src/app\ntoken_file: src/tokens.css\n");
      await put("src/tokens.css", ":root { --color-primary: #1d4ed8; }\n");
      await put(
        ".sdd-de/components.json",
        JSON.stringify([
          { name: "ButtonComponent", level: "atom" },
          { name: "HomeComponent", level: "organism" },
        ]),
      );
      await put(
        "src/app/button/button.component.ts",
        `@Component({ selector: 'app-button', templateUrl: './button.component.html' })\nexport class ButtonComponent {}`,
      );
      await put("src/app/button/button.component.html", `<button class="btn"></button>`);
      await put(
        "src/app/home/home.component.ts",
        `@Component({ selector: 'app-home', templateUrl: './home.component.html' })\nexport class HomeComponent {}`,
      );
      await put("src/app/home/home.component.html", `<app-button></app-button><app-button></app-button>`);

      const result = await buildRelationshipIndex(ng, { generatedAt: STAMP });
      const button = result.graph.components.find((component) => component.name === "ButtonComponent")!;

      expect(button.instanceCount).toBe(2);
      expect(button.usedBy).toEqual(["HomeComponent"]);
      expect(button.adoption).toBe("adopted");
    } finally {
      await rm(ng, { recursive: true, force: true });
    }
  });
});

describe("staleness (task 2.9)", () => {
  it("reports a freshly built index as current, not as stale", async () => {
    // The regression this guards: `generatedAt` is an ISO string with millisecond precision while
    // an mtime has more, so a file written at …991.4ms looked NEWER than an index stamped …991 —
    // a fresh index failing its own CI gate.
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    const staleness = await indexStaleness(dir);
    expect(staleness).toMatchObject({ stale: false, built: true });
    expect(staleness.message).toContain("current");
  });

  it("NAMES the files that changed, because 'stale' alone is not actionable", async () => {
    // A stale index is worse than no index: every reader treats it as authoritative, so a component
    // added after the build reads as "does not exist" and an agent creates a duplicate — the
    // benchmark's false negative arriving through the back door.
    await buildRelationshipIndex(dir, { generatedAt: "2020-01-01T00:00:00.000Z" });

    const staleness = await indexStaleness(dir);

    expect(staleness.stale).toBe(true);
    expect(staleness.changed).toContain("src/components/Button.tsx");
    expect(staleness.message).toContain("src/components/Button.tsx");
    expect(staleness.message).toContain("Rebuild it");
  });

  it("does not count a file twice when scan roots overlap", async () => {
    // `src` contains `src/components`, and a framework's scanDirs contain both, so the roots
    // overlap by design.
    await buildRelationshipIndex(dir, { generatedAt: "2020-01-01T00:00:00.000Z" });
    const staleness = await indexStaleness(dir);
    expect(new Set(staleness.changed).size).toBe(staleness.changed.length);
  });

  it("caps the names but not the count", async () => {
    for (let i = 0; i < 15; i++) await write(`src/components/Extra${i}.tsx`, `export const Extra${i} = () => <i/>;`);
    await buildRelationshipIndex(dir, { generatedAt: "2020-01-01T00:00:00.000Z" });

    const staleness = await indexStaleness(dir);

    expect(staleness.changed.length).toBeLessThanOrEqual(10);
    expect(staleness.changedCount).toBeGreaterThan(10);
    expect(staleness.message).toMatch(/\+\d+ more/);
  });

  it("distinguishes ABSENT from stale", async () => {
    // Conflating them would fail CI on every project that never opted into the index.
    const bare = await mkdtemp(join(tmpdir(), "vortspec-stale-bare-"));
    try {
      const staleness = await indexStaleness(bare);
      expect(staleness).toMatchObject({ stale: false, built: false, generatedAt: null });
      expect(staleness.message).toContain("No design-system index has been built");
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("the CI gate fails on stale, passes on current, and passes on absent", async () => {
    await buildRelationshipIndex(dir, { generatedAt: "2020-01-01T00:00:00.000Z" });
    expect((await checkIndexFreshness(dir)).code).toBe(1);

    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    expect((await checkIndexFreshness(dir)).code).toBe(0);

    const bare = await mkdtemp(join(tmpdir(), "vortspec-ci-bare-"));
    try {
      // Absent PASSES: a project that has not opted in has nothing to be out of date with, and
      // failing there would make every repo without one red for a reason nobody chose.
      expect((await checkIndexFreshness(bare)).code).toBe(0);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});

describe("folded in from the reference script (task 2.9)", () => {
  it("walks the framework's own directories, not just src and component_dir", async () => {
    // An Astro project keeps layouts in `src/layouts`; walking only `component_dir` misses every
    // instance they render, which silently understates adoption.
    const astro = await mkdtemp(join(tmpdir(), "vortspec-astro-"));
    const put = async (rel: string, body: string) => {
      await mkdir(dirname(join(astro, rel)), { recursive: true });
      await writeFile(join(astro, rel), body, "utf8");
    };
    try {
      await put(".sdd-de/project.yaml", "framework: astro\ncomponent_dir: src/components\ntoken_file: src/t.css\n");
      await put("src/t.css", ":root { --a: 1px; }");
      await put(".sdd-de/components.json", JSON.stringify([{ name: "Button", level: "atom" }]));
      await put("src/components/Button.astro", `<button/>`);
      await put("src/layouts/Base.astro", `---\nimport Button from "../components/Button.astro";\n---\n<Button/><Button/>`);

      const result = await buildRelationshipIndex(astro, { generatedAt: STAMP });
      const button = result.graph.components.find((component) => component.name === "Button")!;

      expect(button.instanceCount).toBe(2);
      expect(button.usedBy).toEqual(["Base"]);
    } finally {
      await rm(astro, { recursive: true, force: true });
    }
  });

  it("derives the atomic tier from the path when the roster records none", async () => {
    // Benchmark Q3 is "list all atoms used on that page". Without this a project that never ran
    // extraction cannot answer it, even though its own directories say `atoms/`.
    await write("src/components/atoms/Chip.tsx", `export const Chip = () => <span/>;`);
    await write("src/components/molecules/Field.tsx", `import { Chip } from "../atoms/Chip";\nexport const Field = () => <Chip/>;`);
    await buildRelationshipIndex(dir, { generatedAt: STAMP });

    const components = (await artifact(INDEX_PATH)).components as Record<string, ToonValue>[];
    expect(components.find((c) => c.name === "Chip")?.tier).toBe("atom");
    expect(components.find((c) => c.name === "Field")?.tier).toBe("molecule");
  });

  it("lets a RECORDED level win over the path — a decision beats a convention", async () => {
    await write(".sdd-de/components.json", JSON.stringify([{ name: "Button", level: "organism" }, { name: "Card" }]));
    await buildRelationshipIndex(dir, { generatedAt: STAMP });
    const components = (await artifact(INDEX_PATH)).components as Record<string, ToonValue>[];
    expect(components.find((c) => c.name === "Button")?.tier).toBe("organism");
  });
});

describe("the CI script agrees with checkIndexFreshness (task 2.9)", () => {
  /**
   * `scripts/check-index-freshness.mjs` is self-contained plain JS — core exports TypeScript and the
   * repo has no TS runner at its root, so importing the real function there would put a build step
   * in front of a check whose value is being cheap enough to run on every push. This test is what
   * stops the copy drifting: it SPAWNS the script and asserts the same verdict.
   */
  const SCRIPT = join(process.cwd(), "..", "..", "scripts", "check-index-freshness.mjs");

  async function runScript(target: string): Promise<{ code: number; out: string }> {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve) => {
      execFile(process.execPath, [SCRIPT, target], (error, stdout) => {
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: stdout });
      });
    });
  }

  it("agrees on ABSENT (both pass)", async () => {
    const bare = await mkdtemp(join(tmpdir(), "vortspec-agree-absent-"));
    try {
      const script = await runScript(bare);
      const core = await checkIndexFreshness(bare);
      expect(script.code).toBe(core.code);
      expect(script.code).toBe(0);
      expect(script.out).toContain("No design-system index has been built");
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("agrees on STALE (both fail) and both NAME the changed files", async () => {
    await buildRelationshipIndex(dir, { generatedAt: "2020-01-01T00:00:00.000Z" });

    const script = await runScript(dir);
    const core = await checkIndexFreshness(dir);

    expect(script.code).toBe(1);
    expect(core.code).toBe(1);
    expect(script.out).toContain("src/components/Button.tsx");
    expect(core.message).toContain("src/components/Button.tsx");
  });

  it("agrees on CURRENT (both pass)", async () => {
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });

    const script = await runScript(dir);
    const core = await checkIndexFreshness(dir);

    expect(script.code).toBe(0);
    expect(core.code).toBe(0);
    expect(script.out).toContain("current");
  });
});
