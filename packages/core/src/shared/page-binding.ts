/**
 * How much of a composed page is actually bound to the design system (change: scoped-style-edits).
 *
 * A light page can look perfectly correct and be completely severed from the design system: styled with
 * the design system's VALUES, copied into names of its own. It renders, so nothing appears wrong — and
 * then a token edit reaches nothing, and "what is this component made of?" has no answer.
 *
 * This makes that measurable rather than trusted to a prompt. It reads the page's `var(--…)` references
 * and its own `--…` declarations and says which are the design system's and which are the page's own.
 *
 * Pure and text-based on purpose: it runs over a page's markup with no browser, no fs and no parse tree,
 * so it can be asserted in a unit test and run over a page before it is ever served.
 */

export interface PageBinding {
  /** Design-system tokens the page references. */
  bound: string[];
  /** Tokens the page references that the design system does not define. */
  unbound: string[];
  /** Tokens the page declares itself, whatever it does with them. */
  declared: string[];
  /**
   * Bound references as a share of all references, 0–1. `null` when the page references no tokens at
   * all — which is not 0% bound, it is a page with nothing to bind, and the difference matters.
   */
  ratio: number | null;
}

/** Every `var(--name…)` reference in the text, in first-seen order. */
export function referencedTokens(css: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of css.matchAll(/var\(\s*--([\w-]+)/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/** Every `--name:` declaration in the text, in first-seen order. */
export function declaredTokens(css: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // A declaration, not a reference: `--x:` preceded by `{`, `;` or a line start.
  for (const m of css.matchAll(/(?:^|[{;])\s*--([\w-]+)\s*:/gm)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/**
 * Split a page's token usage against the design system's vocabulary.
 *
 * A page that declares its own token AND references it counts that reference as unbound — declaring
 * `--radius-pill` locally does not make it part of the design system, and treating it as bound would
 * report the exact severance this function exists to detect as success.
 */
export function pageBinding(html: string, designSystemTokens: readonly string[]): PageBinding {
  const known = new Set(designSystemTokens);
  const referenced = referencedTokens(html);
  const bound = referenced.filter((t) => known.has(t));
  const unbound = referenced.filter((t) => !known.has(t));
  return {
    bound,
    unbound,
    declared: declaredTokens(html),
    ratio: referenced.length === 0 ? null : bound.length / referenced.length,
  };
}
