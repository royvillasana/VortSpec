import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  auditReportSchema,
  notRun,
  type AuditReport,
  type EvidenceStrength,
} from "@vortspec/core/audit-report";
import { buildComponentCreationAudit } from "./component-audit";
import { buildScreenGenerationAudit } from "./screen-audit";

/**
 * Running and persisting the two audits — OpenSpec change: agentic-design-system, task 2c.5.
 *
 * Persisted because "when did each last run" is part of the answer. An audit A from before the
 * screens were generated is not wrong, but it is OLD, and a report that cannot say so lets a stale
 * pass stand in for a current one.
 *
 * Each audit is stored under its own key and updated INDEPENDENTLY: running one must never
 * overwrite or invalidate the other's record, because they are separate questions asked at separate
 * moments.
 */

export const AUDIT_REPORT_PATH = ".vortspec/ai/reports/audits.json";

/** Read the persisted report, or the honest starting state: both audits not-run. */
export async function readAuditReport(projectPath: string): Promise<AuditReport> {
  const empty: AuditReport = {
    componentCreation: notRun("component-creation", "observed"),
    screenGeneration: notRun("screen-generation", "observed"),
  };
  const raw = await readFile(join(projectPath, AUDIT_REPORT_PATH), "utf8").catch(() => null);
  if (raw === null) return empty;
  try {
    const parsed = auditReportSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : empty;
  } catch {
    // A corrupt report reads as NOT RUN, never as clean — the same rule the shape itself enforces.
    return empty;
  }
}

async function persist(projectPath: string, report: AuditReport): Promise<void> {
  const path = join(projectPath, AUDIT_REPORT_PATH);
  await mkdir(join(projectPath, ".vortspec/ai/reports"), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

/**
 * Run audit A and record it, leaving audit B's record untouched.
 *
 * `validationPages` sets the evidence to `generated`, which the report must show as weaker than a
 * real screen (task 2b.3): a generated page proves a component renders and which tokens it
 * resolves, never that it is used correctly in context.
 */
export async function runComponentCreationAudit(
  projectPath: string,
  options: { ranAt?: string; validationPages?: readonly string[] } = {},
): Promise<AuditReport> {
  const audit = await buildComponentCreationAudit(projectPath, {
    validationPages: options.validationPages,
  });
  const evidence: EvidenceStrength = options.validationPages?.length ? "generated" : "observed";
  const previous = await readAuditReport(projectPath);
  const report: AuditReport = {
    ...previous,
    componentCreation: {
      scope: "component-creation",
      ranAt: options.ranAt ?? new Date().toISOString(),
      subjects: [...new Set(audit.findings.map((finding) => finding.file ?? ""))].filter(Boolean).sort(),
      evidence,
      findings: audit.findings,
    },
  };
  await persist(projectPath, report);
  return report;
}

/** Run audit B and record it, leaving audit A's record untouched. */
export async function runScreenGenerationAudit(
  projectPath: string,
  options: { ranAt?: string } = {},
): Promise<AuditReport> {
  const audit = await buildScreenGenerationAudit(projectPath, { generatedAt: options.ranAt });
  const previous = await readAuditReport(projectPath);
  const report: AuditReport = {
    ...previous,
    screenGeneration: {
      scope: "screen-generation",
      ranAt: options.ranAt ?? new Date().toISOString(),
      // The screens themselves, not just the files with findings: a report has to be able to say
      // WHAT was examined, or "no findings" is unreadable.
      subjects: audit.screens,
      evidence: "observed",
      findings: audit.findings,
    },
  };
  await persist(projectPath, report);
  return report;
}
