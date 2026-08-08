import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditVerdict, describeCoverage, hasRun } from "@vortspec/core/audit-report";
import {
  AUDIT_REPORT_PATH,
  readAuditReport,
  runComponentCreationAudit,
  runScreenGenerationAudit,
} from "./audit-report";

/**
 * Reporting the two audits — OpenSpec change: agentic-design-system, task 2c.5 (and 2b.3).
 *
 * The failure being prevented is a HUMAN one: reading "0 findings" and concluding the design system
 * is clean when the screen audit never ran. Everything here defends that distinction.
 */

let dir = "";
const A_RAN = "2026-08-07T10:00:00.000Z";
const B_RAN = "2026-08-07T12:00:00.000Z";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function project(): Promise<void> {
  await write(".sdd-de/project.yaml", "framework: react\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n");
  await write("src/tokens.css", ":root {\n  --color-primary: #1d4ed8;\n}\n");
  await write(".sdd-de/components.json", JSON.stringify([{ name: "Button", level: "atom" }]));
  await write("src/components/Button.tsx", `export const Button = () => <button style={{ color: "#1d4ed8" }} />;`);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-audit-report-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("an audit that has not run is NOT a clean audit (task 2c.5)", () => {
  it("starts with both audits explicitly not-run", async () => {
    const report = await readAuditReport(dir);
    expect(hasRun(report.componentCreation)).toBe(false);
    expect(hasRun(report.screenGeneration)).toBe(false);
    expect(describeCoverage(report).join(" ")).toContain("NOT RUN");
    expect(describeCoverage(report).join(" ")).toContain("This is not a clean result");
  });

  it("says INCOMPLETE — not clean — when only audit A has run", async () => {
    // The trap: with only audit A run, "no screen findings" and "nobody looked at the screens"
    // would render identically unless the report insists on the difference.
    const report = await runComponentCreationAudit(dir, { ranAt: A_RAN });
    const verdict = auditVerdict(report);
    expect(verdict.verdict).toBe("incomplete");
    expect(verdict.reason).toContain("screen-generation has not run");
    expect(verdict.reason).toContain("half-checked, not passing");
  });

  it("reads a corrupt report as not-run rather than clean", async () => {
    await write(AUDIT_REPORT_PATH, "{ not json");
    expect(hasRun((await readAuditReport(dir)).componentCreation)).toBe(false);
  });
});

describe("the two audits are recorded independently (task 2c.5)", () => {
  it("running B does not overwrite A's record", async () => {
    // Separate questions asked at separate moments; one must never invalidate the other.
    await runComponentCreationAudit(dir, { ranAt: A_RAN });
    const report = await runScreenGenerationAudit(dir, { ranAt: B_RAN });

    expect(report.componentCreation.ranAt).toBe(A_RAN);
    expect(report.screenGeneration.ranAt).toBe(B_RAN);
    expect(report.componentCreation.findings.length).toBeGreaterThan(0);
  });

  it("never merges the finding lists into one number", async () => {
    await runComponentCreationAudit(dir, { ranAt: A_RAN });
    const report = await runScreenGenerationAudit(dir, { ranAt: B_RAN });

    const verdict = auditVerdict(report);
    // Which stage a finding came from decides the fix, so the count is always per audit.
    expect(verdict.reason).toContain("at component creation");
    expect(verdict.reason).toContain("at screen generation");
  });

  it("persists across reads, so 'when did this last run' survives a restart", async () => {
    await runComponentCreationAudit(dir, { ranAt: A_RAN });
    expect((await readAuditReport(dir)).componentCreation.ranAt).toBe(A_RAN);
  });
});

describe("a generated-page finding is weaker evidence (task 2b.3)", () => {
  it("marks a validation-page audit as `generated` and says what it cannot prove", async () => {
    await write("src/__vortspec_validation__/Atoms.tsx", `export default () => <button style={{ color: "#1d4ed8" }} />;`);

    const report = await runComponentCreationAudit(dir, {
      ranAt: A_RAN,
      validationPages: ["src/__vortspec_validation__/Atoms.tsx"],
    });

    expect(report.componentCreation.evidence).toBe("generated");
    const prose = describeCoverage(report).join(" ");
    expect(prose).toContain("not that they are used correctly in context");
  });

  it("marks a real-source audit as `observed`, with no such qualifier", async () => {
    const report = await runComponentCreationAudit(dir, { ranAt: A_RAN });
    expect(report.componentCreation.evidence).toBe("observed");
    expect(describeCoverage(report)[0]).not.toContain("not that they are used correctly");
  });
});

describe("a full cycle shows both, and neither is mistaken for the other (task 2c.5 VALIDATE)", () => {
  it("reports each audit with its own scope, subject and timestamp", async () => {
    await write(
      "src/pages/Landing.tsx",
      `import { Button } from "../components/Button";\nexport const Landing = () => <Button/>;`,
    );

    await runComponentCreationAudit(dir, { ranAt: A_RAN });
    const report = await runScreenGenerationAudit(dir, { ranAt: B_RAN });

    expect(report.componentCreation.scope).toBe("component-creation");
    expect(report.screenGeneration.scope).toBe("screen-generation");
    expect(report.screenGeneration.subjects).toContain("src/pages/Landing.tsx");
    // Every finding carries the scope it was produced under — they cannot be confused downstream.
    for (const finding of report.componentCreation.findings) expect(finding.scope).toBe("component-creation");
    for (const finding of report.screenGeneration.findings) expect(finding.scope).toBe("screen-generation");

    const lines = describeCoverage(report);
    expect(lines[0]).toContain("Component creation");
    expect(lines[1]).toContain("Screen generation");
  });

  it("only says CLEAN when both ran and neither found anything", async () => {
    await write("src/components/Button.tsx", `export const Button = () => <button className="text-[var(--color-primary)]" />;`);
    await write(
      "src/pages/Landing.tsx",
      `import { Button } from "../components/Button";\nexport const Landing = () => <Button/>;`,
    );

    await runComponentCreationAudit(dir, { ranAt: A_RAN });
    const report = await runScreenGenerationAudit(dir, { ranAt: B_RAN });

    expect(auditVerdict(report).verdict).toBe("clean");
    expect(auditVerdict(report).reason).toContain("Both audits ran");
  });
});
