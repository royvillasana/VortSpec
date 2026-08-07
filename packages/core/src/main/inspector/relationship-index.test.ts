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
  readIndexStamp,
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
