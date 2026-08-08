/**
 * Which CSS property a token was applied to — OpenSpec change: agentic-design-system, task 4.3.
 *
 * Governance v2 asks "is this token used with INTENT", and every one of its rules needs the same
 * fact the existence checks never needed: not *which* tokens a component references, but *where each
 * one landed*. `--color-surface` is correct on a background and wrong on text, and `tokensUsed`
 * cannot tell those apart because it returns a flat list of names.
 *
 * PURE — no fs.
 *
 * Three syntaxes, because a project uses one of them and would otherwise be ungoverned:
 *  - CSS / CSS-in-JS declarations: `color: var(--x)`
 *  - JSX inline style objects: `{{ backgroundColor: "var(--x)" }}` (camelCase)
 *  - Tailwind arbitrary values: `bg-[var(--x)]`, where the UTILITY implies the property
 *
 * What this deliberately does NOT do is resolve a token's value or judge whether the use is right.
 * It reports placements; `governance.ts` decides what they mean. Keeping the two apart is what lets a
 * rule change without touching the parser, and lets the parser be tested on syntax alone.
 */

export interface TokenApplication {
  /** Token name WITHOUT the leading `--`. */
  token: string;
  /** Canonical CSS property, kebab-case (`background-color`, never `backgroundColor`). */
  property: string;
  /** How it was written — useful when a finding has to quote the offending line back. */
  syntax: "css" | "jsx-style" | "tailwind";
}

/**
 * Tailwind utility prefix → the CSS property it sets.
 *
 * Longest-first at match time: `border-t` must not be read as `border`, and `text` must not swallow
 * `text-decoration`. Only utilities whose property is UNAMBIGUOUS are listed — `ring` and `divide`
 * expand to several declarations, so guessing one would put a made-up property into a finding.
 */
const TAILWIND_PROPERTY: Record<string, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
  outline: "outline-color",
  fill: "fill",
  stroke: "stroke",
  shadow: "box-shadow",
  rounded: "border-radius",
  p: "padding",
  px: "padding-inline",
  py: "padding-block",
  pt: "padding-top",
  pr: "padding-right",
  pb: "padding-bottom",
  pl: "padding-left",
  m: "margin",
  mx: "margin-inline",
  my: "margin-block",
  mt: "margin-top",
  mr: "margin-right",
  mb: "margin-bottom",
  ml: "margin-left",
  gap: "gap",
  w: "width",
  h: "height",
  "min-w": "min-width",
  "min-h": "min-height",
  "max-w": "max-width",
  "max-h": "max-height",
  "font": "font-family",
  "leading": "line-height",
  "tracking": "letter-spacing",
  z: "z-index",
  opacity: "opacity",
};

/** `backgroundColor` → `background-color`. Already-kebab input passes through unchanged. */
export function kebabProperty(property: string): string {
  return property
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/^-+/, "")
    .toLowerCase();
}

/**
 * `--x` / `$x` inside a `var()` or raw. Returns the bare name.
 *
 * `$x` is included because Sass projects write tokens that way, and a token invisible to the parser
 * is a token no rule can govern.
 */
const TOKEN_IN_VALUE = /(?:var\(\s*)?--([\w-]+)|\$([a-zA-Z][\w-]*)/;

/** A `property: value` declaration in CSS or a CSS-in-JS/JSX style object. */
const DECLARATION = /(^|[{;,\s])(-{0,2}[a-zA-Z][\w-]*)\s*:\s*([^;{}\n]+)/g;

/** A value carrying a Tailwind arbitrary utility — a class list, not a declaration. */
const CLASS_LIST_VALUE = /[a-z]+-\[/;

/** A Tailwind arbitrary value: `bg-[var(--x)]`, `min-h-[--x]`, `text-[$x]`. */
const TAILWIND_ARBITRARY = /(?:^|[\s"'`:{])(-?[a-z]+(?:-[a-z]+)?)-\[([^\]]+)\]/g;

/**
 * Every token application in a source file.
 *
 * Deduped on `token|property|syntax`: a component that sets the same token on the same property in
 * three variants has made ONE design decision, and reporting it three times would make a finding's
 * severity a function of how many variants a component happens to have.
 */
export function tokenApplications(source: string): TokenApplication[] {
  const out: TokenApplication[] = [];
  const seen = new Set<string>();
  const push = (token: string, property: string, syntax: TokenApplication["syntax"]): void => {
    const prop = kebabProperty(property);
    if (!token || !prop) return;
    const key = `${token}|${prop}|${syntax}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ token, property: prop, syntax });
  };

  for (const match of source.matchAll(DECLARATION)) {
    const property = match[2] ?? "";
    const value = match[3] ?? "";
    // A custom-property DEFINITION (`--brand: var(--blue)`) is not a placement — nothing is being
    // styled. Treating it as one would report every alias in a token file as a governance violation.
    if (property.startsWith("--")) continue;
    // A value holding a Tailwind arbitrary utility is a CLASS LIST, not a declaration. Without this,
    // every key of a CVA variants object (`a: "bg-[var(--x)]"`) parses as a CSS property named `a`,
    // and one design decision spread across n variants is reported n times under n invented
    // properties. The Tailwind pass below reads these correctly.
    if (CLASS_LIST_VALUE.test(value)) continue;
    const token = TOKEN_IN_VALUE.exec(value);
    if (!token) continue;
    const name = token[1] ?? token[2] ?? "";
    push(name, property, /[A-Z]/.test(property) ? "jsx-style" : "css");
  }

  for (const match of source.matchAll(TAILWIND_ARBITRARY)) {
    const utility = match[1] ?? "";
    const value = match[2] ?? "";
    const token = TOKEN_IN_VALUE.exec(value);
    if (!token) continue;
    // Longest prefix wins, so `min-h-[…]` resolves to `min-height` rather than to nothing, and a
    // utility not in the table is SKIPPED rather than guessed — a made-up property in a finding is
    // worse than a missing finding, because someone will act on it.
    const property = TAILWIND_PROPERTY[utility];
    if (!property) continue;
    push(token[1] ?? token[2] ?? "", property, "tailwind");
  }

  return out.sort((a, b) => a.token.localeCompare(b.token) || a.property.localeCompare(b.property));
}

/** A styling decision the rules cannot read: a utility that sets a property from a scale key. */
export interface OpaqueUtility {
  /** The class as written, e.g. `bg-primary`. */
  className: string;
  /** The CSS property it sets. */
  property: string;
}

/** A theme-mapped utility: `bg-primary`, `text-lg` — a known prefix with a bare scale key. */
const THEME_UTILITY = /(?:^|[\s"'`])(-?[a-z]+(?:-[a-z]+)?)-([a-z0-9][\w.]*)(?=$|[\s"'`])/g;

/** Layout and state utilities whose value is not a design token, so their opacity is not a gap. */
const NOT_A_TOKEN_VALUE = new Set(["auto", "full", "none", "screen", "px", "0", "fit", "min", "max"]);

/**
 * Styling this file makes that the governance rules CANNOT read (task 6.7).
 *
 * `bg-[var(--color-surface)]` names a token and a property, so every rule can be evaluated against
 * it. `bg-primary` names a scale key that Tailwind resolves at build time — the property is known,
 * the TOKEN is not, so a hierarchy rule has nothing to compare. Those components must be reported as
 * reduced coverage rather than counted as passing, which is the difference between "we checked and
 * it is fine" and "we could not check".
 *
 * Deliberately conservative. Only utilities whose property is already in the table count, and values
 * that are plainly not design tokens (`auto`, `full`, `screen`) are excluded — over-reporting here
 * would put every layout class into a coverage warning and the warning would stop being read.
 */
export function opaqueUtilities(source: string): OpaqueUtility[] {
  const out: OpaqueUtility[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(THEME_UTILITY)) {
    const utility = match[1] ?? "";
    const value = match[2] ?? "";
    const property = TAILWIND_PROPERTY[utility];
    if (!property || NOT_A_TOKEN_VALUE.has(value)) continue;
    const className = `${utility}-${value}`;
    if (seen.has(className)) continue;
    seen.add(className);
    out.push({ className, property });
  }
  return out.sort((a, b) => a.className.localeCompare(b.className));
}
