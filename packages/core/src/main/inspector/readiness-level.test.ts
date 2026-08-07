import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { projectReadiness } from "./readiness-level";
import { buildRelationshipIndex } from "./relationship-index";
import { GOVERNANCE_PATH } from "./governance-store";

let dir = "";
const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

async function project(): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    "framework: react\nlanguage: typescript\nstyling: tailwind\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
  );
  await write("src/tokens.css", ":root { --color-fg-default: #111; --color-surface: #fff; }\n");
  await write(".sdd-de/components.json", JSON.stringify([{ name: "Button", level: "atom" }, { name: "Card", level: "molecule" }]));
  await write("src/components/Button.tsx", `export const Button = () => <button className="text-[var(--color-fg-default)]" />;`);
  await write(
    "src/components/Card.tsx",
    `import { Button } from "./Button";\nexport const Card = () => (<div className="bg-[var(--color-surface)]"><Button/></div>);`,
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-readiness-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("reading the level from real artifacts (task 5.1)", () => {
  it("scores a project with no index at Libraries", async () => {
    // No index means no graph. Whatever else is true, an agent cannot answer what uses what.
    const result = await projectReadiness(dir);
    expect(result.level).toBe(1);
    expect(result.blocking).toContain("graph-connectedness");
  });

  it("recomputes after the index is built (task 5.4)", async () => {
    const before = await projectReadiness(dir);
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    const after = await projectReadiness(dir);
    expect(after.level).toBeGreaterThan(before.level);
    expect(after.signals.find((s) => s.id === "graph-connectedness")?.met).toBe(true);
  });

  it("counts governance errors from the SOURCES, not from a report that may not have run", async () => {
    // A level that scored a never-audited project as clean would be the most flattering possible lie.
    await write(
      "src/components/Card.tsx",
      `import { Button } from "./Button";\nexport const Card = () => (<div className="text-[var(--color-surface)]"><Button/></div>);`,
    );
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    const result = await projectReadiness(dir);
    const violations = result.signals.find((s) => s.id === "violation-rate");
    expect(violations?.value).toBeGreaterThan(0);
    expect(violations?.met).toBe(false);
  });

  it("treats the untouched seed as 'not yet decided', however the file got there", async () => {
    // The index build SEEDS the rules file, so "a rules file exists" cannot mean the team adopted
    // rules — otherwise every project would count as governed the moment its index was first built.
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    expect((await projectReadiness(dir)).signals.find((s) => s.id === "rules-adopted")?.met).toBe(false);

    // Deciding is an edit. Turning one rule off is a decision; rewriting the same bytes is not.
    const rules = JSON.parse(await readFile(join(dir, GOVERNANCE_PATH), "utf8"));
    await write(GOVERNANCE_PATH, `${JSON.stringify(rules, null, 2)}\n`);
    expect((await projectReadiness(dir)).signals.find((s) => s.id === "rules-adopted")?.met).toBe(false);

    rules.rules[0].enabled = false;
    await write(GOVERNANCE_PATH, `${JSON.stringify(rules, null, 2)}\n`);
    expect((await projectReadiness(dir)).signals.find((s) => s.id === "rules-adopted")?.met).toBe(true);
  });

  it("always offers an action below the top level", async () => {
    const result = await projectReadiness(dir);
    expect(result.level).toBeLessThan(5);
    expect(result.nextAction).toBeTruthy();
  });
});
