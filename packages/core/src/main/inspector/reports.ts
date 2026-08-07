import { basename, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { adoptionReport, tokenViolationReport } from "@vortspec/core/reports";
import { evaluateGovernance, type GovernanceSubject } from "@vortspec/core/governance-eval";
import { isConsumeSource } from "@vortspec/core/setup";
import { AI_DIR } from "@vortspec/core/artifact-paths";
import { buildRelationshipIndex } from "./relationship-index";
import { readGovernance } from "./governance-store";
import { getInspectorComponents } from "./component-reader";
import { readProjectConfig } from "../workspace/config-manager";

/**
 * Generating the audit reports — OpenSpec change: agentic-design-system, tasks 4.5, 4.6 and 4.9.
 *
 * Both reports come from the group 2 graph and the group 4 rules. No second scan and no model, so
 * regenerating is cheap and neither report can disagree with the index it was derived from.
 */

export const REPORTS_DIR = `${AI_DIR}/reports`;
export const ADOPTION_REPORT = `${REPORTS_DIR}/adoption.md`;
export const VIOLATIONS_REPORT = `${REPORTS_DIR}/token-violations.md`;

export interface ReportResult {
  written: string[];
  violations: number;
  deferred: number;
  /** Which rule set was used — a malformed project file falls back and says so. */
  rulesFrom: "project" | "defaults" | "malformed";
  /**
   * True when the design source is CONSUMED (`enterprise`/`library`). Reports are still generated —
   * findings about someone else's library are still findings — but nothing is written INTO the
   * consumed code (task 4.9).
   */
  consumeSource: boolean;
}

/**
 * Where a report may be written.
 *
 * Always inside the VortSpec-owned `.vortspec/` directory, never beside the component it describes.
 * That is what makes task 4.9 hold by construction rather than by remembering: for a consumed
 * library there is no code path here that could write into the vendor's tree, because the only path
 * that exists is `.vortspec/ai/reports/`. A report dropped next to a vendor's component would be an
 * edit to a dependency, which is exactly what a consume source must never receive.
 */
function reportPath(projectPath: string, relative: string): string {
  return join(projectPath, relative);
}

export async function generateReports(
  projectPath: string,
  options: { generatedAt?: string } = {},
): Promise<ReportResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const [config, { config: governance, source: rulesFrom }] = await Promise.all([
    readProjectConfig(projectPath),
    readGovernance(projectPath),
  ]);
  const consumeSource = isConsumeSource(config?.designSource);

  const { graph, shadows } = await buildRelationshipIndex(projectPath, { generatedAt });

  // The governance subjects are the design-system component SOURCES. Pages are excluded on purpose:
  // a screen's own markup is audit B's subject, and reporting it here would mix "our component is
  // wrong" with "this screen used it wrongly" under one heading.
  const roster = await getInspectorComponents(projectPath).catch(() => null);
  const subjects: GovernanceSubject[] = [];
  for (const component of roster?.components ?? []) {
    if (!component.file) continue;
    const source = await readFile(join(projectPath, component.file), "utf8").catch(() => null);
    if (source === null) continue;
    subjects.push({ component: component.name, file: component.file, source });
  }

  const { violations, deferred } = evaluateGovernance(subjects, governance);
  const projectName = basename(projectPath) || "Project";

  await mkdir(join(projectPath, REPORTS_DIR), { recursive: true });
  const written: string[] = [];
  for (const [relative, content] of [
    [ADOPTION_REPORT, adoptionReport({ projectName, graph, shadows, generatedAt })],
    [
      VIOLATIONS_REPORT,
      tokenViolationReport({
        projectName,
        generatedAt,
        violations,
        deferredRules: deferred.map((d) => ({ rule: d.rule, component: d.component })),
      }),
    ],
  ] as const) {
    await writeFile(reportPath(projectPath, relative), content, "utf8");
    written.push(relative);
  }

  return { written, violations: violations.length, deferred: deferred.length, rulesFrom, consumeSource };
}
