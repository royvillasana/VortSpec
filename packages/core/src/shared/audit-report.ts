import { z } from "zod";
import { auditFindingSchema, auditScopeSchema } from "./inspector";

/**
 * Reporting the two audits — OpenSpec change: agentic-design-system, task 2c.5 (and 2b.3).
 *
 * The two audits answer different questions against different subjects, so a report that merges
 * their findings into one list destroys the only thing that makes either actionable: WHAT was
 * looked at. "12 findings" is not a fact about a design system unless you know whether anyone
 * looked at the screens.
 *
 * Three rules, each guarding a specific way this gets misread:
 *
 *  1. **The lists are never concatenated.** A total is available per audit, never as one number.
 *  2. **A finding carries its EVIDENCE STRENGTH.** A generated validation page proves a component
 *     renders and which tokens it resolves; it cannot prove the component is used correctly in
 *     context. Presenting that as equal to a real-screen finding overstates what was verified.
 *  3. **An audit that has NOT RUN is reported as not-run, never as clean.** This is the one that
 *     actually bites: with only audit A run, "no screen findings" and "nobody looked at the
 *     screens" render identically unless the report insists on the difference.
 *
 * PURE — no fs.
 */

/** How strongly a finding's subject supports it. */
export const evidenceStrengthSchema = z.enum(["observed", "generated"]);
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>;

/** One audit's result, with everything needed to read it correctly. */
export const auditRunSchema = z.object({
  scope: auditScopeSchema,
  /** ISO stamp of the run, or null when this audit has never run. */
  ranAt: z.string().nullable(),
  /** What was examined — file paths. Empty with `ranAt: null` means "not run", not "nothing found". */
  subjects: z.array(z.string()).default([]),
  /**
   * `observed` — real screens or component sources. `generated` — a validation page VortSpec wrote,
   * which is weaker: it proves a render, not correct use in context.
   */
  evidence: evidenceStrengthSchema,
  findings: z.array(auditFindingSchema).default([]),
});
export type AuditRun = z.infer<typeof auditRunSchema>;

export const auditReportSchema = z.object({
  componentCreation: auditRunSchema,
  screenGeneration: auditRunSchema,
});
export type AuditReport = z.infer<typeof auditReportSchema>;

/** Whether an audit has ever run. `ranAt: null` is the only signal — an empty list is not one. */
export function hasRun(run: AuditRun): boolean {
  return run.ranAt !== null;
}

/**
 * What a report can and cannot claim, in one sentence per audit.
 *
 * Written as prose because the failure this prevents is a HUMAN one: someone reading "0 findings"
 * and concluding the design system is clean when the screen audit never ran.
 */
export function describeCoverage(report: AuditReport): string[] {
  const lines: string[] = [];
  for (const run of [report.componentCreation, report.screenGeneration]) {
    const label = run.scope === "component-creation" ? "Component creation" : "Screen generation";
    if (!hasRun(run)) {
      lines.push(
        `${label}: NOT RUN — nothing has been checked at this stage. This is not a clean result.`,
      );
      continue;
    }
    const qualifier =
      run.evidence === "generated"
        ? " against a generated validation page, which shows that components render and which tokens they resolve — not that they are used correctly in context"
        : "";
    lines.push(
      `${label}: ${run.findings.length} finding${run.findings.length === 1 ? "" : "s"} across ` +
        `${run.subjects.length} file${run.subjects.length === 1 ? "" : "s"}${qualifier} (${run.ranAt}).`,
    );
  }
  return lines;
}

/**
 * A single readiness verdict, and why it is deliberately conservative.
 *
 * `incomplete` whenever either audit has not run. A design system whose components are clean but
 * whose screens were never audited is not "passing" — it is half-checked, and calling that a pass
 * is how a report starts being trusted for something it never established.
 */
export function auditVerdict(report: AuditReport): {
  verdict: "clean" | "findings" | "incomplete";
  reason: string;
} {
  const runs = [report.componentCreation, report.screenGeneration];
  const notRun = runs.filter((run) => !hasRun(run));
  if (notRun.length)
    return {
      verdict: "incomplete",
      reason: `${notRun.map((r) => r.scope).join(" and ")} has not run — the design system is half-checked, not passing.`,
    };
  const total = runs.reduce((sum, run) => sum + run.findings.length, 0);
  if (total > 0)
    return {
      verdict: "findings",
      // Reported per audit, never as one number: which stage they came from decides the fix.
      reason: `${report.componentCreation.findings.length} at component creation, ${report.screenGeneration.findings.length} at screen generation.`,
    };
  return { verdict: "clean", reason: "Both audits ran and neither found anything." };
}

/** An empty run — the honest starting state, distinct from a clean one. */
export function notRun(scope: AuditRun["scope"], evidence: EvidenceStrength): AuditRun {
  return { scope, ranAt: null, subjects: [], evidence, findings: [] };
}
