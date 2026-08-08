import { assessReadiness, type ReadinessAssessment } from "@vortspec/core/readiness-level";
import { evaluateGovernance, type GovernanceSubject } from "@vortspec/core/governance-eval";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { getInspectorComponents } from "./component-reader";
import { getInspectorTokens } from "./token-parser";
import { metadataStatus } from "./component-metadata";
import { readGovernance } from "./governance-store";
import { readUsageIndex } from "./index-digest";
import { indexStaleness } from "./relationship-index";

/**
 * Gathering the AI-readiness inputs — OpenSpec change: agentic-design-system, tasks 5.1 and 5.4.
 *
 * The scoring lives in `shared/readiness-level.ts`; this reads what the project actually has. Every
 * input comes from an artifact some other group already produces, which is what makes the level a
 * measurement rather than a second opinion: it cannot say the design system is healthier than the
 * index, the metadata and the governance run say it is.
 *
 * **Recomputed on read, never cached (task 5.4).** The level is a function of artifacts that change
 * when the index is rebuilt, so reading it after a rebuild reports the rebuilt state by construction.
 * A cached level would be the one thing on the Design System screen that could quietly disagree with
 * everything beside it.
 */
export async function projectReadiness(projectPath: string): Promise<ReadinessAssessment> {
  const [components, tokens, metadata, governance, usage, staleness] = await Promise.all([
    getInspectorComponents(projectPath).catch(() => null),
    getInspectorTokens(projectPath).catch(() => null),
    metadataStatus(projectPath).catch(() => null),
    readGovernance(projectPath),
    readUsageIndex(projectPath).catch(() => null),
    indexStaleness(projectPath).catch(() => null),
  ]);

  const roster = components?.components ?? [];
  const enabled = governance.config.rules.filter((rule) => rule.enabled);

  // Governance errors, recomputed from the component sources rather than read from the report — the
  // report is written by a separate pass that may not have run, and a level that silently scored a
  // never-audited project as clean would be the most flattering possible lie.
  const subjects: GovernanceSubject[] = [];
  for (const component of roster) {
    if (!component.file) continue;
    const source = await readFile(join(projectPath, component.file), "utf8").catch(() => null);
    if (source === null) continue;
    subjects.push({ component: component.name, file: component.file, source });
  }
  const { violations } = evaluateGovernance(subjects, governance.config);

  // Edges are counted from the usage artifact's `uses`, so "no index" scores as no graph rather than
  // as a graph nobody measured.
  const rosterNames = new Set(roster.map((component) => component.name));
  const edges = (usage ?? []).reduce((total, entry) => total + entry.uses.length, 0);
  const connectedComponents = (usage ?? []).filter(
    (entry) => rosterNames.has(entry.name) && (entry.uses.length > 0 || entry.usedBy.length > 0),
  ).length;

  return assessReadiness({
    components: roster.length,
    withMetadata: (metadata?.complete ?? 0) + (metadata?.incomplete.length ?? 0),
    withCompleteMetadata: metadata?.complete ?? 0,
    tokens: tokens?.tokens.length ?? 0,
    resolvedTokens: (tokens?.tokens ?? []).filter((token) => Boolean(token.resolvedValue)).length,
    connectedComponents,
    edges,
    rules: enabled.length,
    // The seeded defaults are not a decision, and seeding WRITES the file — so the existence of a
    // rules file cannot be the test. `adopted` compares content against the seed.
    rulesAdopted: governance.adopted,
    errors: violations.filter((violation) => violation.severity === "error").length,
    indexFresh: Boolean(staleness?.built && !staleness.stale),
  });
}
