import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { AuditFinding, DesignAudit, InspectorToken } from "@vortspec/core/inspector";
import { enforceScope } from "@vortspec/core/audit-scope";
import { getInspectorTokens } from "./token-parser";
import { getInspectorComponents, stripComments } from "./component-reader";
import { normValue } from "./figma-reconcile";

/**
 * AUDIT A — the component-creation audit (OpenSpec change: agentic-design-system, task 2c.2).
 *
 * Runs when components exist and screens do not, which is the moment token discipline is cheapest to
 * fix: a hardcoded value caught here is a one-line change in one file, and the same value caught
 * after five screens consume the component is a migration.
 *
 * Its question is narrow on purpose — *does this component implement its tokens correctly?* — and
 * everything that needs a screen to be meaningful is refused by `enforceScope`, not merely omitted.
 * At this point every component is "unused" and no shadow implementation can exist; emitting either
 * would be noise, and a report with noise in it is one people learn to scroll past.
 */

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
/**
 * A CSS length literal, with its property.
 *
 * Colors were the only thing the audit checked, which left the larger half of a design system
 * unguarded: `padding: 16px` in a project that defines `--spacing-4: 16px` is exactly the same
 * failure as a hardcoded hex, and it is far more common because a spacing value looks innocuous.
 */
const DIMENSION_RE = new RegExp(
  // The property, in CSS kebab-case OR the camelCase a JSX inline style uses — both are how a
  // component actually writes it, and matching only one silently halves the audit's reach.
  String.raw`\b(padding|paddingTop|paddingRight|paddingBottom|paddingLeft|padding-top|padding-right|padding-bottom|padding-left` +
    String.raw`|margin|marginTop|marginRight|marginBottom|marginLeft|margin-top|margin-right|margin-bottom|margin-left` +
    String.raw`|gap|rowGap|columnGap|row-gap|column-gap` +
    String.raw`|borderRadius|border-radius|borderWidth|border-width` +
    String.raw`|width|height|minWidth|maxWidth|minHeight|maxHeight|min-width|max-width|min-height|max-height` +
    String.raw`|top|right|bottom|left|inset|fontSize|font-size|lineHeight|line-height)` +
    // An optional quote: `padding: 16px` in CSS, `padding: "16px"` in a JSX style object.
    String.raw`\s*:\s*["']?(-?(?:\d*\.)?\d+(?:px|rem|em))\b`,
  "g",
);
/** `0`, `1px` hairlines and `100%` are not design decisions a token should name. */
const TRIVIAL_DIMENSIONS = new Set(["0", "0px", "0rem", "1px", "100%", "auto"]);
const MAX_FINDINGS = 500;

export interface ComponentAuditOptions {
  /**
   * Files to audit instead of the component roster — the generated validation pages (group 2b).
   * When given, findings are attributed to `validation-page`, which the report must show as weaker
   * evidence than a real screen (task 2b.3).
   */
  validationPages?: readonly string[];
}

/**
 * Build audit A.
 *
 * The subject is the component SOURCES by default. Passing `validationPages` audits the generated
 * pages instead, which is what makes this runnable on a project that has never had a screen — the
 * whole point of group 2b.
 */
export async function buildComponentCreationAudit(
  projectPath: string,
  options: ComponentAuditOptions = {},
): Promise<DesignAudit> {
  const [toks, comps] = await Promise.all([
    getInspectorTokens(projectPath),
    getInspectorComponents(projectPath),
  ]);
  const tokens = toks.tokens;
  const components = comps.components;
  // The pages are ADDITIONAL, never a substitute. A generated page renders `<Button />`; the
  // hardcoded value lives in Button's own source, so auditing only the pages would report a clean
  // design system while every violation sat one file away. Each target carries its OWN subject, so
  // a page finding is still never presented as equal evidence to a source one.
  const auditsPages = (options.validationPages?.length ?? 0) > 0;

  const colorByValue = valueIndex(tokens, (token) => token.type === "color");
  // Spacing and radius share the length space, so one index serves both — the message names the
  // token that already holds the value, which is the actionable half.
  const lengthByValue = valueIndex(tokens, (token) => token.type === "spacing" || token.type === "radius");

  const findings: AuditFinding[] = [];

  let drifted = 0;
  for (const token of tokens) {
    if (token.drift !== "drifted") continue;
    drifted++;
    findings.push({
      scope: "component-creation",
      subject: auditsPages ? "validation-page" : "component-source",
      component: "(tokens)",
      file: toks.tokenFile,
      severity: "warning",
      kind: "token-drift",
      message: `--${token.name} drifted from the design source (code ${token.resolvedValue} vs ${token.figmaValue ?? "?"})`,
    });
  }

  const targets: { name: string; file: string; subject: "component-source" | "validation-page" }[] = [
    ...components
      .filter((component) => component.file)
      .map((c) => ({ name: c.name, file: c.file!, subject: "component-source" as const })),
    ...(options.validationPages ?? []).map((file) => ({
      name: file.split("/").pop() ?? file,
      file,
      subject: "validation-page" as const,
    })),
  ];

  for (const target of targets) {
    if (findings.length >= MAX_FINDINGS) break;
    // Comments stripped so a hex in `/* brand #1a73e8 */` is not flagged as an implementation.
    const source = stripComments(await readFile(join(projectPath, target.file), "utf8").catch(() => ""));

    const seenColors = new Set<string>();
    for (const match of source.matchAll(HEX_RE)) {
      const value = normValue(match[0]);
      const token = colorByValue.get(value);
      if (!token || seenColors.has(value)) continue;
      seenColors.add(value);
      findings.push({
        scope: "component-creation",
        subject: target.subject,
        component: target.name,
        file: target.file,
        severity: "error",
        kind: "hardcoded-color",
        message: `hardcodes ${match[0]} — use var(--${token})`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }

    const seenLengths = new Set<string>();
    for (const match of source.matchAll(DIMENSION_RE)) {
      const [, property, literal] = match;
      if (TRIVIAL_DIMENSIONS.has(literal)) continue;
      const token = lengthByValue.get(normValue(literal));
      const key = `${property}:${literal}`;
      if (!token || seenLengths.has(key)) continue;
      seenLengths.add(key);
      findings.push({
        scope: "component-creation",
        subject: target.subject,
        component: target.name,
        file: target.file,
        severity: "error",
        kind: "hardcoded-color",
        message: `${property} hardcodes ${literal} — use var(--${token})`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
  }

  // The backstop behind the scope declaration. Anything a rule produced that this audit must not
  // emit is dropped HERE, so a future rule cannot leak a screen-only finding into audit A.
  const { kept } = enforceScope(findings, "component-creation");
  kept.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return {
    findings: kept,
    summary: { components: components.length, findings: kept.length, drifted },
  };
}

/** value → the first token that already names it. */
function valueIndex(
  tokens: readonly InspectorToken[],
  predicate: (token: InspectorToken) => boolean,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const token of tokens) {
    if (!predicate(token)) continue;
    const value = normValue(token.resolvedValue);
    if (value && !index.has(value)) index.set(value, token.name);
  }
  return index;
}
