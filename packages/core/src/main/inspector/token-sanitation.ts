import type {
  DuplicateGroup,
  InspectorTokensResult,
  OrphanToken,
  TokenSanitation,
} from "@vortspec/core/inspector";
import { getInspectorTokens } from "./token-parser";
import { normValue } from "./figma-reconcile";

/**
 * Token sanitation analysis (change: token-fidelity-sanitation). Pure, over an
 * InspectorTokensResult: find code-only tokens (orphans) with where they are
 * used, and value look-alikes (duplicates) that should collapse to one canonical
 * token. No I/O, no mutation — the UI previews these and every action is gated.
 */

/** A name that reads as a raw palette rung (`…-500`, or a hue word). */
function looksPrimitive(name: string): boolean {
  return (
    /(^|[-/])(blue|grey|gray|red|green|yellow|orange|purple|cyan|lime|beige|pink|teal|indigo|neutral|white|black)([-/]|$)/i.test(
      name,
    ) || /[-/]\d{2,3}0?$/.test(name)
  );
}

/** A name that reads as a semantic role (surface/container/text/border/button/…). */
function looksSemantic(name: string): boolean {
  return /(surface|container|border|text|link|button|control|nav|footer|hero|status|brand|accent|muted|default|hover|active|disabled|primary|secondary|body|heading|on-color|highcontrast|breadcrumb|sitemap|servicearea)/i.test(
    name,
  );
}

/**
 * Orphans: code tokens with no Figma counterpart (no match under any resolver
 * signal), each with the components/props that use it. Only meaningful once a
 * Figma export is present — otherwise every token is trivially "code-only".
 */
export function findOrphans(result: InspectorTokensResult): OrphanToken[] {
  if (!result.figmaSynced) return [];
  const orphans: OrphanToken[] = [];
  for (const t of result.tokens) {
    if (t.figmaPath) continue; // matched by name/value/alias/link
    orphans.push({ name: t.name, value: t.resolvedValue, uses: result.usage[t.name] ?? [] });
  }
  return orphans;
}

/**
 * Duplicates: tokens sharing a resolved value under different names, flagged only
 * when a semantic look-alikes a primitive (a flattened alias to reclaim) or two
 * semantics coincide. All-primitive collisions (the same value across brand
 * ramps — e.g. `grey-50` = `#FFFFFF` in every brand) are excluded on purpose.
 */
export function findDuplicates(result: InspectorTokensResult): DuplicateGroup[] {
  const byValue = new Map<string, string[]>();
  for (const t of result.tokens) {
    if (!t.resolvedValue) continue;
    const v = normValue(t.resolvedValue);
    const arr = byValue.get(v) ?? [];
    if (!arr.some((n) => n === t.name)) arr.push(t.name);
    byValue.set(v, arr);
  }
  const groups: DuplicateGroup[] = [];
  for (const [value, names] of byValue) {
    if (names.length < 2) continue;
    const semantics = names.filter((n) => looksSemantic(n) && !looksPrimitive(n));
    const primitives = names.filter((n) => looksPrimitive(n) && !looksSemantic(n));
    if (semantics.length >= 1 && primitives.length >= 1) {
      groups.push({ value, tokens: [...primitives, ...semantics], kind: "semantic-primitive" });
    } else if (semantics.length >= 2) {
      groups.push({ value, tokens: semantics, kind: "semantic-semantic" });
    }
    // else: all-primitive (cross-brand) or single-tier → not a duplicate to collapse.
  }
  return groups;
}

export function analyzeSanitation(result: InspectorTokensResult): TokenSanitation {
  return { orphans: findOrphans(result), duplicates: findDuplicates(result) };
}

/** Compute the sanitation report for a project. */
export async function getTokenSanitation(projectPath: string): Promise<TokenSanitation> {
  return analyzeSanitation(await getInspectorTokens(projectPath));
}
