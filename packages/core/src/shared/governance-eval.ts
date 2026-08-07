import {
  BACKGROUND_PROPERTIES,
  FOREGROUND_PROPERTIES,
  TYPOGRAPHY_PROPERTIES,
  isElevationToken,
  tokenRole,
  type GovernanceConfig,
  type GovernanceRule,
} from "./governance";
import { opaqueUtilities, tokenApplications, type TokenApplication } from "./token-application";

/**
 * Deterministic evaluation of the governance rules — OpenSpec change: agentic-design-system, task 4.3.
 *
 * PURE — no fs, no model.
 *
 * The contract that makes this worth having: **a rule marked `judgment` is never evaluated here.**
 * It is collected into `deferred` and handed to the model pass. Guessing at one with a regex would
 * produce a confident finding about taste, which is worse than no finding — someone would fix it.
 *
 * Everything reported here is a placement a person can check in one line of source, which is the
 * standard an `error`-severity finding has to meet.
 */

export interface GovernanceViolation {
  /** The rule that fired — a finding cites this, and a team disables by it. */
  rule: string;
  kind: GovernanceRule["kind"];
  severity: GovernanceRule["severity"];
  component: string;
  file: string | null;
  /** What is wrong, naming the token and the property it landed on. */
  message: string;
  /** What to do instead, carried from the rule (task 4.2). */
  correction: string;
}

/** A rule that needs the model, with the evidence already gathered for it. */
export interface DeferredCheck {
  rule: string;
  component: string;
  file: string | null;
  /** The applications the model needs to judge — never the whole file. */
  evidence: TokenApplication[];
}

/**
 * A component whose styling the rules could not read (task 6.7).
 *
 * Reported so an unevaluable rule is never counted as passing. "We checked and it is fine" and "we
 * could not check" are different claims, and only one of them earns a clean report.
 */
export interface CoverageGap {
  component: string;
  file: string | null;
  /** The classes that hide a token behind a scale key. */
  opaque: string[];
  /** Which properties are affected, so a reader can see which rules went unevaluated. */
  properties: string[];
  reason: string;
}

export interface GovernanceResult {
  violations: GovernanceViolation[];
  deferred: DeferredCheck[];
  /** Components the rules could not fully evaluate. */
  coverageGaps: CoverageGap[];
}

export interface GovernanceSubject {
  component: string;
  file: string | null;
  source: string;
}

/** A literal box-shadow value — anything that is not a bare token reference. */
const LITERAL_SHADOW = /box-shadow\s*:\s*(?![^;{}\n]*(?:var\(\s*--|\$[a-zA-Z]))[^;{}\n]+/gi;

/** A typography declaration whose value carries no token. */
function literalTypographyProperties(source: string): Set<string> {
  const out = new Set<string>();
  for (const property of TYPOGRAPHY_PROPERTIES) {
    const camel = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const re = new RegExp(`(?:${property}|${camel})\\s*:\\s*([^;{}\\n]+)`, "g");
    for (const match of source.matchAll(re)) {
      const value = match[1] ?? "";
      if (!/var\(\s*--|\$[a-zA-Z]|--[\w-]/.test(value)) out.add(property);
    }
  }
  return out;
}

export function evaluateGovernance(
  subjects: readonly GovernanceSubject[],
  config: GovernanceConfig,
): GovernanceResult {
  const violations: GovernanceViolation[] = [];
  const deferred: DeferredCheck[] = [];
  const coverageGaps: CoverageGap[] = [];
  const active = config.rules.filter((rule) => rule.enabled);
  const byId = new Map(active.map((rule) => [rule.id, rule]));

  const fire = (id: string, subject: GovernanceSubject, message: string): void => {
    const rule = byId.get(id);
    // A disabled rule fires nothing — including for a violation another rule's pass detected.
    if (!rule || rule.evaluation !== "deterministic") return;
    violations.push({
      rule: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      component: subject.component,
      file: subject.file,
      message,
      correction: rule.correction,
    });
  };

  for (const subject of subjects) {
    const applications = tokenApplications(subject.source);

    for (const application of applications) {
      const role = tokenRole(application.token, config.vocabulary);

      // hierarchy — a role landing on the property belonging to the other role.
      if (role === "background" && FOREGROUND_PROPERTIES.has(application.property))
        fire(
          "hierarchy/background-token-on-text",
          subject,
          `--${application.token} is a surface token but is applied to \`${application.property}\`.`,
        );
      if (role === "foreground" && BACKGROUND_PROPERTIES.has(application.property))
        fire(
          "hierarchy/foreground-token-on-surface",
          subject,
          `--${application.token} is a foreground token but is applied to \`${application.property}\`.`,
        );

      // elevation — a box-shadow taking a token that is not an elevation token.
      if (application.property === "box-shadow" && !isElevationToken(application.token, config.vocabulary))
        fire(
          "elevation/shadow-outside-the-scale",
          subject,
          `--${application.token} is not an elevation token but sets \`box-shadow\`.`,
        );
    }

    // elevation — a literal shadow, which references no token at all and so has no application.
    for (const match of subject.source.matchAll(LITERAL_SHADOW))
      fire(
        "elevation/shadow-outside-the-scale",
        subject,
        `A literal box-shadow (\`${match[0].slice(0, 60).trim()}\`) is outside the elevation scale.`,
      );

    // typography — tokenized in part, literal in the rest.
    const typographyApplied = new Set(
      applications
        .filter((a) => (TYPOGRAPHY_PROPERTIES as readonly string[]).includes(a.property))
        .map((a) => a.property),
    );
    if (typographyApplied.size) {
      const literals = literalTypographyProperties(subject.source);
      for (const property of literals)
        fire(
          "typography/composite-applied-piecemeal",
          subject,
          `\`${property}\` is a literal while ${[...typographyApplied].sort().join(", ")} come from tokens — the type style will not move as a unit.`,
        );
    }

    // Styling the rules cannot read (task 6.7). A theme-mapped utility names a property but resolves
    // its token at build time, so nothing here can say which token landed on it. Recorded as a gap
    // rather than passed over, because a component whose colours are all invisible to the hierarchy
    // rule would otherwise appear in the report as clean.
    const opaque = opaqueUtilities(subject.source);
    if (opaque.length)
      coverageGaps.push({
        component: subject.component,
        file: subject.file,
        opaque: opaque.map((utility) => utility.className),
        properties: [...new Set(opaque.map((utility) => utility.property))].sort(),
        reason:
          "Theme-mapped utilities resolve their token at build time, so no rule can see which token landed on these properties.",
      });

    // The judgment rules: gathered with their evidence, never decided here.
    for (const rule of active) {
      if (rule.evaluation !== "judgment") continue;
      const evidence = evidenceFor(rule, applications, config);
      if (evidence.length)
        deferred.push({ rule: rule.id, component: subject.component, file: subject.file, evidence });
    }
  }

  return { violations, deferred, coverageGaps };
}

/**
 * The applications a judgment rule needs looked at — never the whole file.
 *
 * A model asked to judge one placement with one placement in front of it is answering a bounded
 * question. Handing it the component's whole source turns the same call into an open-ended review
 * that costs more and wanders, which is the cost failure task 4.3 exists to avoid.
 */
function evidenceFor(
  rule: GovernanceRule,
  applications: readonly TokenApplication[],
  config: GovernanceConfig,
): TokenApplication[] {
  if (rule.family === "semantic-color")
    return applications.filter((a) => isIntent(a.token, config));
  if (rule.family === "elevation") {
    const elevations = applications.filter(
      (a) => isElevationToken(a.token, config.vocabulary) || a.property === "box-shadow",
    );
    // Only worth a model call when there is genuinely more than one to reconcile.
    return new Set(elevations.map((a) => a.token)).size > 1 ? elevations : [];
  }
  return [];
}

function isIntent(token: string, config: GovernanceConfig): boolean {
  const name = token.toLowerCase();
  return config.vocabulary.intent.some((fragment) =>
    new RegExp(`(^|[-_])${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name),
  );
}
