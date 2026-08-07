/**
 * Context-aware parsing of CSS custom properties — the pure text half of reading a stylesheet as a
 * design source.
 *
 * CSS expresses what a design tool calls a "mode" as a SELECTOR SCOPE (`:root`, `.dark`,
 * `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`), so each `--var: value;` is
 * collected under the context it was declared in rather than merged into one map. A brace-matched
 * scan tracks the enclosing prelude stack; isolated here so it can be swapped for a full CSS AST
 * later.
 *
 * Lives in `shared/` — and is re-exported from `main/inspector/token-parser.ts`, which is where it
 * used to live, so every existing importer is untouched — because the canonical-token ingest
 * (OpenSpec change: agentic-design-system, task 7.10) reads a stylesheet as a design source and must
 * stay fs-free. Same move, and the same reason, as `mapDtcgType` in task 7.3.
 */

/** The canonical key for the default (light / mode-less) code context. */
export const DEFAULT_CONTEXT = ":root";

export interface CssContextParse {
  /** Context keys found, `:root` first when present. */
  contexts: string[];
  /** Token names in first-seen order (union across contexts). */
  order: string[];
  /** token name → (context key → raw value). */
  raw: Map<string, Map<string, string>>;
}

/** Collapse an at-rule/selector prelude stack to a single canonical context key. */
function contextKeyFor(stack: string[]): string {
  const joined = stack.join(" | ").toLowerCase();
  if (/prefers-color-scheme\s*:\s*dark/.test(joined)) return "@media (prefers-color-scheme: dark)";
  for (let i = stack.length - 1; i >= 0; i--) {
    const p = stack[i].trim();
    if (!p) continue;
    if (p.startsWith("@")) {
      if (/^@theme\b/.test(p)) return DEFAULT_CONTEXT; // Tailwind v4 @theme is the default context
      continue; // other at-rules (@media light, @supports) — look further out for a selector
    }
    return normalizeSelector(p);
  }
  return DEFAULT_CONTEXT;
}

/** Canonicalize a selector prelude to its context key (root-ish selectors → `:root`). */
function normalizeSelector(sel: string): string {
  const first = sel.split(",")[0].trim().replace(/\s+/g, " ");
  if (first === ":root" || first === "html" || first === "*" || first === ":where(:root)") {
    return DEFAULT_CONTEXT;
  }
  // `:scope` only appears inside an `@scope (…)` at-rule, where it IS the scoping root — that is where a
  // themed library (e.g. Astryx) declares its base token values, so it is this file's default context.
  if (first === ":scope" || first === ":where(:scope)") return DEFAULT_CONTEXT;
  return first;
}

export function parseCssContexts(css: string): CssContextParse {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments
  const raw = new Map<string, Map<string, string>>();
  const order: string[] = [];
  const contextsSeen = new Set<string>();
  const stack: string[] = [];
  let buf = "";
  const record = (ctx: string, name: string, value: string) => {
    let byCtx = raw.get(name);
    if (!byCtx) {
      byCtx = new Map();
      raw.set(name, byCtx);
      order.push(name);
    }
    byCtx.set(ctx, value.trim()); // last declaration in a context wins
    contextsSeen.add(ctx);
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      stack.pop();
      buf = "";
    } else if (ch === ";") {
      const decl = buf.trim();
      const m = decl.match(/^--([\w-]+)\s*:\s*([\s\S]+)$/);
      if (m) record(contextKeyFor(stack), m[1], m[2]);
      buf = "";
    } else {
      buf += ch;
    }
  }
  const contexts = [...contextsSeen];
  contexts.sort((a, b) => (a === DEFAULT_CONTEXT ? -1 : b === DEFAULT_CONTEXT ? 1 : 0));
  return { contexts, order, raw };
}

/**
 * Resolve a `var(--x)` reference to a concrete value within a context: look up the referenced token
 * in the same context first, then fall back to the default context, mirroring the CSS cascade.
 * Bounded to avoid reference cycles.
 */
export function resolveInContext(
  value: string,
  ctx: string,
  parse: CssContextParse,
  depth = 0,
): string {
  if (depth > 10) return value.trim();
  const match = value.trim().match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if (!match) return value.trim();
  const byCtx = parse.raw.get(match[1]);
  const referenced = byCtx?.get(ctx) ?? byCtx?.get(DEFAULT_CONTEXT);
  if (referenced !== undefined) return resolveInContext(referenced, ctx, parse, depth + 1);
  return (match[2] ?? value).trim();
}

/** The custom property a value references (`var(--x)` → `x`), or undefined when it is a literal. */
export function cssVarReference(value: string): string | undefined {
  const m = value.trim().match(/^var\(\s*--([\w-]+)\s*(?:,\s*[^)]*)?\)$/);
  return m ? m[1] : undefined;
}
