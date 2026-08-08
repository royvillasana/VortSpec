import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildComponentCreationAudit } from "./component-audit";

/**
 * AUDIT A — component creation (OpenSpec change: agentic-design-system, task 2c.2).
 *
 * TEST criterion from the task: a component with a hardcoded hex is caught; one that references the
 * right token is not. VALIDATE criterion: it is COMPLETE on a project with components and no screens
 * — which is the whole reason this audit exists separately.
 */

let dir = "";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function project(components: Record<string, string>): Promise<void> {
  await write(".sdd-de/project.yaml", "framework: react\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n");
  await write(
    "src/tokens.css",
    ":root {\n  --color-primary: #1d4ed8;\n  --spacing-4: 16px;\n  --radius-md: 8px;\n}\n",
  );
  await write(
    ".sdd-de/components.json",
    JSON.stringify(Object.keys(components).map((name) => ({ name, level: "atom" }))),
  );
  for (const [name, source] of Object.entries(components))
    await write(`src/components/${name}.tsx`, source);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-audit-a-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("catches a hardcoded value a token already names (task 2c.2 TEST)", () => {
  it("flags a hardcoded hex", async () => {
    await project({ Button: `export const Button = () => <button style={{ color: "#1d4ed8" }} />;` });
    const audit = await buildComponentCreationAudit(dir);
    const finding = audit.findings.find((f) => f.component === "Button");
    expect(finding?.kind).toBe("hardcoded-color");
    expect(finding?.message).toContain("use var(--color-primary)");
  });

  it("does NOT flag a component that references the token", async () => {
    await project({ Button: `export const Button = () => <button style={{ color: "var(--color-primary)" }} />;` });
    expect((await buildComponentCreationAudit(dir)).findings).toEqual([]);
  });

  it("flags a hardcoded LENGTH, not just a colour", async () => {
    // The larger half of a design system was unguarded: `padding: 16px` where `--spacing-4: 16px`
    // exists is the same failure as a hardcoded hex, and far more common because it looks innocuous.
    await project({ Card: `export const Card = () => <div style={{ padding: "16px" }} />;` });
    const finding = (await buildComponentCreationAudit(dir)).findings.find((f) => f.component === "Card");
    expect(finding?.message).toContain("padding hardcodes 16px");
    expect(finding?.message).toContain("use var(--spacing-4)");
  });

  it("ignores trivial lengths no token should name", async () => {
    await project({ Rule: `export const Rule = () => <hr style={{ borderWidth: "1px", margin: "0" }} />;` });
    expect((await buildComponentCreationAudit(dir)).findings).toEqual([]);
  });

  it("ignores a value in a comment", async () => {
    await project({ Note: `/* brand #1d4ed8 */\nexport const Note = () => <p/>;` });
    expect((await buildComponentCreationAudit(dir)).findings).toEqual([]);
  });

  it("does not flag a length no token defines — that is a choice, not a violation", async () => {
    await project({ Odd: `export const Odd = () => <div style={{ padding: "13px" }} />;` });
    expect((await buildComponentCreationAudit(dir)).findings).toEqual([]);
  });
});

describe("it is COMPLETE on a project with no screens (task 2c.2 VALIDATE)", () => {
  it("audits every component even though nothing renders them", async () => {
    // The reason audit A exists: components are built before screens, and this is when their token
    // discipline is cheapest to fix.
    await project({
      Button: `export const Button = () => <button style={{ color: "#1d4ed8" }} />;`,
      Card: `export const Card = () => <div style={{ padding: "16px" }} />;`,
      Badge: `export const Badge = () => <span style={{ borderRadius: "8px" }} />;`,
    });

    const audit = await buildComponentCreationAudit(dir);

    expect(audit.summary.components).toBe(3);
    expect(audit.findings.map((f) => f.component).sort()).toEqual(["Badge", "Button", "Card"]);
  });

  it("emits ZERO unused and ZERO shadow findings, whatever the rules produce", async () => {
    // Enforced by scope, not by omission: a future rule cannot leak a screen-only finding in here.
    await project({ Button: `export const Button = () => <button/>;` });
    const audit = await buildComponentCreationAudit(dir);
    expect(audit.findings.some((f) => f.kind === "unused")).toBe(false);
    expect(audit.findings.some((f) => f.kind === "shadow-implementation")).toBe(false);
  });

  it("stamps every finding with its scope and subject", async () => {
    // So a generated-page finding is never presented as equal evidence to a real-screen one.
    await project({ Button: `export const Button = () => <button style={{ color: "#1d4ed8" }} />;` });
    const audit = await buildComponentCreationAudit(dir);
    expect(audit.findings[0].scope).toBe("component-creation");
    expect(audit.findings[0].subject).toBe("component-source");
  });

  it("attributes findings to the validation PAGE when auditing one", async () => {
    await project({ Button: `export const Button = () => <button/>;` });
    await write("src/__vortspec_validation__/Atoms.tsx", `export default () => <button style={{ color: "#1d4ed8" }} />;`);

    const audit = await buildComponentCreationAudit(dir, {
      validationPages: ["src/__vortspec_validation__/Atoms.tsx"],
    });

    expect(audit.findings[0].subject).toBe("validation-page");
    expect(audit.findings[0].file).toBe("src/__vortspec_validation__/Atoms.tsx");
  });
});
