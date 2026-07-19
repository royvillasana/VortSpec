import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { AuditFinding, DesignAudit } from "@vortspec/core/inspector";
import { getInspectorTokens } from "./token-parser";
import { getInspectorComponents } from "./component-reader";
import { normValue } from "./figma-reconcile";

/**
 * The design-system audit (Plan B4). Because the index already knows every component
 * and every token (B1–B2), finding divergences is a cheap, repeatable scan instead of a
 * manual review: components that hardcode a color a token already names, and tokens whose
 * code value has drifted from their Figma variable. Reads the B2 scan cache, so it's fast.
 */

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const MAX_FINDINGS = 500;

export async function buildDesignAudit(projectPath: string): Promise<DesignAudit> {
  const [toks, comps] = await Promise.all([getInspectorTokens(projectPath), getInspectorComponents(projectPath)]);
  const tokens = toks.tokens;
  const components = comps.components;

  // Color value → the token that already names it (first wins).
  const colorByValue = new Map<string, string>();
  for (const t of tokens) {
    if (t.type !== "color") continue;
    const v = normValue(t.resolvedValue);
    if (v && !colorByValue.has(v)) colorByValue.set(v, t.name);
  }

  const findings: AuditFinding[] = [];

  // Token drift: code value diverged from the matched Figma variable.
  let drifted = 0;
  for (const t of tokens) {
    if (t.drift !== "drifted") continue;
    drifted++;
    findings.push({
      component: "(tokens)",
      file: toks.tokenFile,
      severity: "warning",
      kind: "token-drift",
      message: `--${t.name} drifted from Figma (code ${t.resolvedValue} vs Figma ${t.figmaValue ?? "?"})`,
    });
  }

  // Hardcoded colors: a hex literal in a component that equals a color token's value.
  for (const c of components) {
    if (!c.file || findings.length >= MAX_FINDINGS) continue;
    const src = await readFile(join(projectPath, c.file), "utf8").catch(() => "");
    const seen = new Set<string>();
    for (const m of src.matchAll(HEX_RE)) {
      const hex = m[0];
      const v = normValue(hex);
      const token = colorByValue.get(v);
      if (token && !seen.has(v)) {
        seen.add(v);
        findings.push({
          component: c.name,
          file: c.file,
          severity: "error",
          kind: "hardcoded-color",
          message: `hardcodes ${hex} — use var(--${token})`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
  }

  // Errors (hardcoded) before warnings (drift), so the UI leads with consistency breaks.
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return { findings, summary: { components: components.length, findings: findings.length, drifted } };
}
