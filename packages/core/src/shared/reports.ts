import type { ComponentUsage, RelationshipGraph, ShadowFinding } from "./relationship-graph";
import type { GovernanceViolation } from "./governance-eval";

/**
 * The generated audit reports — OpenSpec change: agentic-design-system, tasks 4.5 and 4.6.
 *
 * PURE — no fs. `main/inspector/reports.ts` writes them.
 *
 * Markdown, and committed, for the same reason the TOON artifacts are: a report nobody can read in a
 * diff is a report nobody reads. These are derived entirely from the group 2 graph and the group 4
 * violations — no second scan, no model — so regenerating them is free and they cannot disagree with
 * the index they came from.
 *
 * **Adoption is reported as its STATE, never as a bare ratio.** `efficiency` is
 * `instanceCount / importCount`, which does not exist for a component nothing imports; sorting a
 * report by it is precisely where `0` gets read as "worst adopted" when the truth is "no score".
 * Every table here leads with `adoption` and treats efficiency as the detail it is.
 */

/** A section that found nothing still appears, saying so. */
const NOTHING = "_Nothing found._";

export interface AdoptionReportInput {
  projectName: string;
  graph: RelationshipGraph;
  shadows: readonly ShadowFinding[];
  generatedAt: string;
}

/** `reports/adoption.md` — who uses what, and what nothing uses. */
export function adoptionReport(input: AdoptionReportInput): string {
  const components = input.graph.components.filter((c) => c.designSystem);
  const byState = (state: ComponentUsage["adoption"]) =>
    components.filter((c) => c.adoption === state).sort((a, b) => a.name.localeCompare(b.name));

  const unimported = byState("unimported");
  const neverRendered = byState("imported-never-rendered");
  const adopted = byState("adopted");

  const lines: string[] = [
    `# Adoption — ${input.projectName}`,
    "",
    `Generated ${input.generatedAt} from \`.vortspec/ai/index.toon\`. Do not hand-edit.`,
    "",
    "## Summary",
    "",
    `- ${components.length} design-system components`,
    `- ${adopted.length} adopted (rendered at least once)`,
    `- ${neverRendered.length} imported but never rendered`,
    `- ${unimported.length} unimported — new or dead; the graph cannot tell which`,
    `- ${input.shadows.length} shadow implementations`,
    "",
    "## Imported but never rendered",
    "",
    // Listed FIRST among the problems because it is the only one that is unambiguously waste: the
    // import is paid for on every build and buys nothing. `unimported` may just be new.
    "An import that renders nothing costs build time and buys nothing. This is the actionable list.",
    "",
  ];

  if (!neverRendered.length) lines.push(NOTHING, "");
  else {
    lines.push("| Component | Imported by |", "|---|---|");
    for (const c of neverRendered)
      lines.push(`| ${c.name} | ${c.importedBy.length ? c.importedBy.join(", ") : "—"} |`);
    lines.push("");
  }

  lines.push(
    "## Unimported",
    "",
    "Nothing imports these. That is either a component just built or one nobody kept using — the graph does not know which, and does not guess.",
    "",
  );
  if (!unimported.length) lines.push(NOTHING, "");
  else {
    lines.push("| Component | Tier | File |", "|---|---|---|");
    for (const c of unimported) lines.push(`| ${c.name} | ${c.tier ?? "—"} | ${c.path} |`);
    lines.push("");
  }

  lines.push(
    "## Adopted",
    "",
    "`renders / imports` is how much rendering each import buys. It exists only for a component something imports.",
    "",
  );
  if (!adopted.length) lines.push(NOTHING, "");
  else {
    lines.push("| Component | Tier | Imports | Renders | renders / imports |", "|---|---|---|---|---|");
    for (const c of [...adopted].sort(
      (a, b) => b.instanceCount - a.instanceCount || a.name.localeCompare(b.name),
    ))
      lines.push(
        `| ${c.name} | ${c.tier ?? "—"} | ${c.importCount} | ${c.instanceCount} | ${
          c.efficiency === undefined ? "—" : c.efficiency.toFixed(2)
        } |`,
      );
    lines.push("");
  }

  lines.push(
    "## Shadow implementations",
    "",
    "Files that reproduce a component's token signature without importing it — the duplicate that gets built when nobody knew the component existed.",
    "",
  );
  if (!input.shadows.length) lines.push(NOTHING, "");
  else {
    lines.push("| Component | Shadowed by | Overlap | Shared tokens |", "|---|---|---|---|");
    for (const shadow of [...input.shadows].sort(
      (a, b) => b.overlap - a.overlap || a.component.localeCompare(b.component),
    ))
      lines.push(
        `| ${shadow.component} | ${shadow.file} | ${Math.round(shadow.overlap * 100)}% | ${shadow.sharedTokens.join(", ")} |`,
      );
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export interface ViolationReportInput {
  projectName: string;
  violations: readonly GovernanceViolation[];
  /** Rules that need a model and have not been judged yet — reported, never counted as clean. */
  deferredRules?: readonly { rule: string; component: string }[];
  generatedAt: string;
}

/** `reports/token-violations.md` — grouped by component, because that is who fixes them. */
export function tokenViolationReport(input: ViolationReportInput): string {
  const byComponent = new Map<string, GovernanceViolation[]>();
  for (const violation of input.violations) {
    const list = byComponent.get(violation.component) ?? [];
    list.push(violation);
    byComponent.set(violation.component, list);
  }

  const errors = input.violations.filter((v) => v.severity === "error").length;
  const lines: string[] = [
    `# Token violations — ${input.projectName}`,
    "",
    `Generated ${input.generatedAt}. Do not hand-edit.`,
    "",
    `${input.violations.length} violation(s) across ${byComponent.size} component(s) — ${errors} error(s), ${input.violations.length - errors} warning(s).`,
    "",
  ];

  if (!input.violations.length) lines.push(NOTHING, "");

  for (const component of [...byComponent.keys()].sort()) {
    const found = byComponent.get(component)!;
    // Errors first within a component: the reader is fixing this file now, and the ordering is the
    // only thing telling them what to fix first.
    const ordered = [...found].sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.rule.localeCompare(b.rule),
    );
    lines.push(`## ${component}`, "");
    if (ordered[0]?.file) lines.push(`\`${ordered[0].file}\``, "");
    for (const violation of ordered) {
      lines.push(
        `- **${violation.severity}** · \`${violation.rule}\` — ${violation.message}`,
        // The correction is its own line rather than appended to the message: it is the part that
        // gets acted on, and a finding whose fix is buried mid-sentence gets read as a complaint.
        `  - Fix: ${violation.correction}`,
      );
    }
    lines.push("");
  }

  const deferred = input.deferredRules ?? [];
  if (deferred.length) {
    lines.push(
      "## Not yet judged",
      "",
      // Stated, never omitted. A report that silently dropped the judgment rules would read as a
      // clean bill of health for checks that simply have not run.
      "These rules need a model to decide and have not been judged. They are neither passing nor failing.",
      "",
      "| Component | Rule |",
      "|---|---|",
    );
    for (const item of [...deferred].sort(
      (a, b) => a.component.localeCompare(b.component) || a.rule.localeCompare(b.rule),
    ))
      lines.push(`| ${item.component} | \`${item.rule}\` |`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
