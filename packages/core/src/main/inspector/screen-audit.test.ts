import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildScreenGenerationAudit } from "./screen-audit";

/**
 * AUDIT B — screen generation (OpenSpec change: agentic-design-system, task 2c.3).
 *
 * TEST criterion from the task: a screen that inlines a component's markup is flagged; the same
 * screen importing it is not. Everything asserted here is structurally invisible to audit A, which
 * is the reason the two audits exist separately.
 */

let dir = "";
const STAMP = "2026-08-07T12:00:00.000Z";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** A design system with one token-rich Button, plus whatever screens a test adds. */
async function project(screens: Record<string, string>): Promise<void> {
  await write(".sdd-de/project.yaml", "framework: react\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n");
  await write(
    "src/tokens.css",
    ":root {\n  --color-primary: #1d4ed8;\n  --color-on-primary: #ffffff;\n  --radius-md: 8px;\n  --spacing-4: 16px;\n}\n",
  );
  await write(".sdd-de/components.json", JSON.stringify([{ name: "Button", level: "atom" }]));
  await write(
    "src/components/Button.tsx",
    `export const Button = () => (
      <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] p-[var(--spacing-4)]" />
    );`,
  );
  for (const [path, source] of Object.entries(screens)) await write(path, source);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-audit-b-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("a screen that reimplements a component is flagged (task 2c.3 TEST)", () => {
  it("flags markup that reproduces the component instead of importing it", async () => {
    // The finding audit B exists for. It cannot occur in audit A, because the generated validation
    // page always imports — this is introduced by the conversion, when a model writes markup rather
    // than reaching for a component it did not know existed.
    await project({
      "src/pages/Landing.tsx": `export const Landing = () => (
        <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] p-[var(--spacing-4)]" />
      );`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });
    const shadow = audit.findings.find((finding) => finding.kind === "shadow-implementation");

    expect(shadow?.file).toBe("src/pages/Landing.tsx");
    expect(shadow?.message).toContain("import Button instead of reimplementing it");
  });

  it("does NOT flag the same screen when it imports the component", async () => {
    await project({
      "src/pages/Landing.tsx": `import { Button } from "../components/Button";\nexport const Landing = () => <Button/>;`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });

    expect(audit.findings.some((finding) => finding.kind === "shadow-implementation")).toBe(false);
  });
});

describe("findings audit A structurally cannot produce (task 2c.3)", () => {
  it("reports a component no screen renders", async () => {
    // Meaningful only here. Before screens exist EVERY component is unused, which is why audit A
    // refuses this rule outright rather than merely omitting it.
    await project({ "src/pages/Empty.tsx": `export const Empty = () => <div>nothing</div>;` });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });
    const unused = audit.findings.find((finding) => finding.kind === "unused");

    expect(unused?.component).toBe("Button");
    expect(unused?.message).toContain("no screen renders this component");
  });

  it("distinguishes a left-over import from a component nothing touches", async () => {
    // Different fixes: delete the import, versus adopt or delete the component.
    await project({
      "src/pages/Stale.tsx": `import { Button } from "../components/Button";\nexport const Stale = () => <div/>;`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });
    const unused = audit.findings.find((finding) => finding.kind === "unused");

    expect(unused?.message).toContain("the import is left over, or the screen reimplemented it");
  });

  it("blames the CONVERSION for a hardcoded value in a screen, not the author", async () => {
    // The same finding as audit A's, pointing at a different fix — which is why the message differs.
    await project({
      "src/pages/Landing.tsx": `import { Button } from "../components/Button";
        export const Landing = () => <div style={{ background: "#1d4ed8" }}><Button/></div>;`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });
    const hardcoded = audit.findings.find((finding) => finding.kind === "hardcoded-color");

    expect(hardcoded?.file).toBe("src/pages/Landing.tsx");
    expect(hardcoded?.message).toContain("the conversion inlined a value the design system already names");
  });
});

describe("scope and subject are stamped on every finding", () => {
  it("marks findings as screen-generation against a user screen", async () => {
    await project({
      "src/pages/Landing.tsx": `export const Landing = () => (
        <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] p-[var(--spacing-4)]" />
      );`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });

    expect(audit.findings.length).toBeGreaterThan(0);
    for (const finding of audit.findings) {
      expect(finding.scope).toBe("screen-generation");
      expect(finding.subject).toBe("user-screen");
    }
  });

  it("names the screens it audited, so the subject is never implicit", async () => {
    await project({
      "src/pages/A.tsx": `import { Button } from "../components/Button";\nexport const A = () => <Button/>;`,
      "src/pages/B.tsx": `import { Button } from "../components/Button";\nexport const B = () => <Button/>;`,
    });

    const audit = await buildScreenGenerationAudit(dir, { generatedAt: STAMP });

    expect(audit.screens).toEqual(["src/pages/A.tsx", "src/pages/B.tsx"]);
    // The design system is counted separately from the screens that consume it.
    expect(audit.summary.components).toBe(1);
  });

  it("reports a clean conversion as clean", async () => {
    await project({
      "src/pages/Landing.tsx": `import { Button } from "../components/Button";\nexport const Landing = () => <Button/>;`,
    });
    expect((await buildScreenGenerationAudit(dir, { generatedAt: STAMP })).findings).toEqual([]);
  });
});
