import { curateTailwindTheme, flattenCanonicalTokens, type TailwindThemeExtension } from "./token-emitters";
import type { DesignTokenDocument } from "./design-tokens";

/**
 * Token discipline is STYLING-SPECIFIC — OpenSpec change: agentic-design-system, task 2c.4.
 *
 * A screen is generated into the framework AND the styling the project chose, and the conversion's
 * output fails differently per target. Each of these is a real token-discipline failure that the
 * other styling cannot physically produce:
 *
 *  • **Tailwind** — `bg-[var(--color-primary)]` when the emitted theme already maps `bg-primary` to
 *    that token. It renders correctly, so nothing catches it, and the project quietly grows two
 *    ways to say the same thing: the curated scale the design system publishes, and arbitrary
 *    values that bypass it. A CSS-modules project has no utility classes and cannot fail this way.
 *  • **CSS / CSS modules / SCSS** — a raw literal where `var(--token)` was available. Tailwind
 *    projects express this differently (an arbitrary value), which is why one rule cannot serve both.
 *  • **CSS-in-JS (styled-components, emotion)** — a literal inside a styled template instead of a
 *    `theme` lookup, where the theme object is the emitted token file.
 *
 * Running one styling's rule against another's output is how an audit produces findings that cannot
 * be acted on. So the rule set is SELECTED by styling, and a styling with no rule of its own
 * produces none rather than borrowing someone else's.
 *
 * PURE — no fs.
 */

export interface StylingViolation {
  /** The literal as written in the generated screen. */
  found: string;
  /** What it should have been, in this styling's own idiom. */
  expected: string;
  /** The design token behind it. */
  token: string;
  message: string;
}

/** Tailwind utility prefixes → the theme scale they read, for suggesting the scale key. */
const PREFIX_SCALE: Record<string, keyof TailwindThemeExtension> = {
  bg: "colors", text: "colors", border: "colors", ring: "colors", fill: "colors", stroke: "colors",
  outline: "colors", divide: "colors", accent: "colors", caret: "colors", decoration: "colors",
  from: "colors", via: "colors", to: "colors", placeholder: "colors",
  p: "spacing", px: "spacing", py: "spacing", pt: "spacing", pr: "spacing", pb: "spacing", pl: "spacing",
  m: "spacing", mx: "spacing", my: "spacing", mt: "spacing", mr: "spacing", mb: "spacing", ml: "spacing",
  gap: "spacing", w: "spacing", h: "spacing", size: "spacing",
  rounded: "borderRadius", shadow: "boxShadow", opacity: "opacity", z: "zIndex",
  font: "fontFamily", leading: "lineHeight", tracking: "letterSpacing", duration: "transitionDuration",
};

/** `bg-[var(--color-primary)]`, `p-[16px]`, `text-[#1d4ed8]` — a utility with an arbitrary value. */
const ARBITRARY_RE = /\b([a-z][a-z-]*)-\[([^\]\s]+)\]/g;

/**
 * Tailwind: an arbitrary value where the curated theme already publishes a scale key.
 *
 * The theme is derived from the SAME canonical artifact the emitter uses (task 7.6), so the
 * suggestion is never a guess about what the project's Tailwind config contains — it is what the
 * config actually holds.
 */
export function findTailwindViolations(
  source: string,
  canonical: DesignTokenDocument,
): StylingViolation[] {
  const theme = curateTailwindTheme(flattenCanonicalTokens(canonical));
  const out: StylingViolation[] = [];
  const seen = new Set<string>();

  for (const match of source.matchAll(ARBITRARY_RE)) {
    const [whole, prefix, inner] = match;
    const scale = PREFIX_SCALE[prefix];
    if (!scale || seen.has(whole)) continue;
    // The token this arbitrary value is reaching for, whether written as var() or as the literal.
    const tokenName = inner.match(/^var\(--([\w-]+)\)$/)?.[1];
    const key = tokenName ? scaleKeyFor(theme, scale, tokenName) : null;
    if (!key) continue;
    seen.add(whole);
    out.push({
      found: whole,
      expected: `${prefix}-${key}`,
      token: tokenName!,
      message:
        `${whole} bypasses the theme — use \`${prefix}-${key}\`, which the emitted Tailwind config ` +
        `already maps to var(--${tokenName}). An arbitrary value renders correctly, so nothing else ` +
        `catches it, and the project ends up with two ways to say the same thing.`,
    });
  }
  return out;
}

/** The scale key whose value references this token, or null. */
function scaleKeyFor(
  theme: TailwindThemeExtension,
  scale: keyof TailwindThemeExtension,
  token: string,
): string | null {
  const group = theme[scale];
  if (!group) return null;
  const needle = `var(--${token})`;
  for (const [key, value] of Object.entries(group)) {
    if (typeof value === "string") {
      if (value === needle) return key;
      continue;
    }
    for (const [nested, nestedValue] of Object.entries(value))
      // `colors.primary.DEFAULT` is written `bg-primary`; a named shade keeps its suffix.
      if (nestedValue === needle) return nested === "DEFAULT" ? key : `${key}-${nested}`;
  }
  return null;
}

/** `theme.color.primary` — how a CSS-in-JS screen should reach a token. */
const CSS_IN_JS_LITERAL = /(?:background|color|border-radius|padding|margin|gap)\s*:\s*(#[0-9a-fA-F]{3,8}|-?(?:\d*\.)?\d+(?:px|rem))/g;

/**
 * CSS-in-JS: a literal inside a styled template where the theme object holds the value.
 *
 * Separate from the plain-CSS rule because the FIX is different — a `theme` lookup rather than a
 * `var()` — and a message that suggests the wrong idiom is a message people ignore.
 */
export function findCssInJsViolations(
  source: string,
  valueToToken: ReadonlyMap<string, string>,
): StylingViolation[] {
  const out: StylingViolation[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(CSS_IN_JS_LITERAL)) {
    const literal = match[1];
    const token = valueToToken.get(literal.toLowerCase());
    if (!token || seen.has(literal)) continue;
    seen.add(literal);
    out.push({
      found: literal,
      expected: `\${({ theme }) => theme["${token}"]}`,
      token,
      message: `the styled template hardcodes ${literal} — read it from the theme (${token}); the conversion dropped the token reference`,
    });
  }
  return out;
}

/** Which styling approaches have a rule of their own. Anything else produces NO findings. */
export function stylingHasRule(styling: string | undefined): boolean {
  const key = (styling ?? "").toLowerCase();
  return key === "tailwind" || key === "tailwindcss" || key === "styled-components" || key === "emotion";
}
