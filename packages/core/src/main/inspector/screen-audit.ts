import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { AuditFinding, DesignAudit } from "@vortspec/core/inspector";
import { enforceScope } from "@vortspec/core/audit-scope";
import { describeShadow } from "@vortspec/core/relationship-graph";
import { getInspectorTokens } from "./token-parser";
import { stripComments } from "./component-reader";
import { normValue } from "./figma-reconcile";
import { buildRelationshipIndex } from "./relationship-index";

/**
 * AUDIT B — the screen-generation audit (OpenSpec change: agentic-design-system, task 2c.3).
 *
 * Runs after a screen is generated into the project's chosen framework and styling. Its question is
 * NOT the one audit A asks. Audit A asks whether a component implements its tokens correctly; this
 * asks whether a SCREEN composes components correctly, and whether the conversion that produced it
 * preserved the token discipline the light page had.
 *
 * Everything here is structurally invisible to audit A, which is why the two are separate:
 *
 *  • A SHADOW implementation — markup that reproduces a component instead of importing it — cannot
 *    occur against a generated validation page, because that page always imports. It is introduced
 *    by the conversion, which is precisely when a model writes markup rather than reaching for a
 *    component it did not know existed.
 *  • "Unused" only means something once screens exist. Before that, everything is unused.
 *  • A hardcoded value in a SCREEN is usually the conversion having inlined a literal, not an
 *    authoring mistake in a component — so the same finding points at a different fix.
 *
 * The subject is the graph's PAGE nodes: files that render design-system components without being
 * part of the design system. That is the definition the relationship index already computes, so a
 * screen is whatever the project actually renders from, not a path convention this module invents.
 */

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const MAX_FINDINGS = 500;

export interface ScreenAuditResult extends DesignAudit {
  /** The screens audited — page nodes in the relationship graph. */
  screens: string[];
}

/**
 * Build audit B.
 *
 * Builds the relationship index rather than reading a stale one: a screen audit is run right after a
 * conversion, and the whole point is to judge what was just generated. Reading a pre-conversion
 * index would report on code that no longer exists.
 */
export async function buildScreenGenerationAudit(
  projectPath: string,
  options: { generatedAt?: string } = {},
): Promise<ScreenAuditResult> {
  const [{ graph, shadows }, toks] = await Promise.all([
    buildRelationshipIndex(projectPath, options),
    getInspectorTokens(projectPath).catch(() => null),
  ]);

  const tokens = toks?.tokens ?? [];
  const colorByValue = new Map<string, string>();
  for (const token of tokens) {
    if (token.type !== "color") continue;
    const value = normValue(token.resolvedValue);
    if (value && !colorByValue.has(value)) colorByValue.set(value, token.name);
  }

  const screens = graph.components.filter((component) => !component.designSystem);
  const findings: AuditFinding[] = [];

  // 1. Shadow implementations — the finding this audit exists for.
  for (const shadow of shadows) {
    findings.push({
      scope: "screen-generation",
      subject: "user-screen",
      component: shadow.component,
      file: shadow.file,
      severity: "warning",
      kind: "shadow-implementation",
      message: describeShadow(shadow),
    });
  }

  // 2. Components the design system carries that no screen renders. Meaningful ONLY here: before
  //    screens exist every component is unused, which is why audit A refuses this rule.
  for (const component of graph.components) {
    if (!component.designSystem) continue;
    if (component.adoption === "adopted") continue;
    findings.push({
      scope: "screen-generation",
      subject: "user-screen",
      component: component.name,
      file: component.path,
      severity: "warning",
      kind: "unused",
      message:
        component.adoption === "imported-never-rendered"
          ? `imported by ${component.importedBy.length} file(s) and rendered by none — the import is left over, or the screen reimplemented it`
          : "no screen renders this component",
    });
  }

  // 3. Hardcoded values in the SCREENS themselves. In a screen this is the conversion having
  //    inlined a literal the light page carried as a token reference — a different fix from the
  //    same finding in a component, which is why the message says so.
  for (const screen of screens) {
    if (findings.length >= MAX_FINDINGS) break;
    const source = stripComments(await readFile(join(projectPath, screen.path), "utf8").catch(() => ""));
    const seen = new Set<string>();
    for (const match of source.matchAll(HEX_RE)) {
      const value = normValue(match[0]);
      const token = colorByValue.get(value);
      if (!token || seen.has(value)) continue;
      seen.add(value);
      findings.push({
        scope: "screen-generation",
        subject: "user-screen",
        component: screen.name,
        file: screen.path,
        severity: "error",
        kind: "hardcoded-color",
        message: `the generated screen hardcodes ${match[0]} — use var(--${token}); the conversion inlined a value the design system already names`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
  }

  const { kept } = enforceScope(findings, "screen-generation");
  kept.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return {
    findings: kept,
    screens: screens.map((screen) => screen.path).sort(),
    summary: {
      components: graph.components.filter((component) => component.designSystem).length,
      findings: kept.length,
      drifted: 0,
    },
  };
}
