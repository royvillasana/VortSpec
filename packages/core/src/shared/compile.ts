/**
 * Deterministic light-page → framework compile (OpenSpec change: light-design-system, group 6). A page
 * authored on the light surface (framework-free HTML with inline resolved-token values + `data-component`
 * markers) is compiled to real framework code by RESTORING identity the light artifacts carry forward:
 *   - token VALUES → the framework token reference, via the recorded name (never invents a token) — 6.2
 *   - `data-component` markers → the real component usage by contract identity (name + variant) — 6.3
 * and a token-discipline lint asserts no known-token literal leaks as a raw value — 6.4.
 *
 * The transform is fully DETERMINISTIC (no AI): every mapping is a lookup the light artifacts already
 * pin. `deterministicCoverage` reports what resolved by lookup vs. what would need a human/AI (6.5).
 *
 * Pure + framework-free (mirrors the other light-design-system core modules). This emits React/CVA JSX
 * first (per the proposal's first-pass scope); the orchestrator adds imports (compose-run knows paths).
 */

/** A node of a light-authored page: a plain element, or a design-system component usage (`component`). */
export interface LightNode {
  tag: string;
  text?: string;
  /** Inline styles carrying RESOLVED token values (the light surface renders from these). */
  styles?: Record<string, string>;
  /** `data-component` — this subtree is a design-system component usage, mapped to the real component. */
  component?: string;
  /** Component props (e.g. `{ variant: "primary" }`). */
  props?: Record<string, string>;
  children?: LightNode[];
}

export interface CompileOptions {
  /** Resolved value → framework token reference, e.g. "#c53434" → "var(--color-brand-primary)". */
  valueToTokenRef: Map<string, string>;
  /** Known token literal values (hex/rem/px). A raw one of these in the output is a discipline leak. */
  knownTokenValues?: Set<string>;
}

export interface CompileResult {
  /** The emitted JSX (a single root expression). */
  code: string;
  /** Distinct design-system components referenced (for imports + the readiness compile gate). */
  usedComponents: string[];
  /** Token-discipline lint: known-token literals that leaked as raw values (empty ⇒ clean) — 6.4. */
  lintIssues: string[];
  /** Deterministic-vs-AI coverage metric — 6.5. */
  deterministicCoverage: {
    tokensRestored: number; // style values swapped to a token reference
    literalsKept: number; // style values with no token (legitimately literal, e.g. layout px)
    componentsMapped: number; // data-component usages resolved by identity
    residual: string[]; // things NOT deterministically resolvable (would need a human/AI)
  };
}

/** camelCase a CSS property for a JSX `style` object (`background-color` → `backgroundColor`). */
function camel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
function jsxText(s: string): string {
  return s.replace(/[<>{}]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" })[c]!);
}
function jsxAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
function indent(depth: number): string {
  return "  ".repeat(depth);
}

interface Acc {
  used: Set<string>;
  tokensRestored: number;
  literalsKept: number;
  componentsMapped: number;
  residual: string[];
  lint: string[];
}

/** Build the JSX `style={{…}}` prop, restoring token references and flagging literal leaks. */
function styleProp(styles: Record<string, string>, opts: CompileOptions, acc: Acc): string {
  const entries: string[] = [];
  for (const [prop, value] of Object.entries(styles)) {
    if (value === "" || value == null) continue;
    const ref = opts.valueToTokenRef.get(value);
    if (ref) {
      entries.push(`${camel(prop)}: ${JSON.stringify(ref)}`);
      acc.tokensRestored++;
    } else {
      entries.push(`${camel(prop)}: ${JSON.stringify(value)}`);
      acc.literalsKept++;
      if (opts.knownTokenValues?.has(value)) {
        acc.lint.push(`${prop}: "${value}" matches a design token but was emitted as a raw value`);
        acc.residual.push(`unmapped token value "${value}" on ${prop}`);
      }
    }
  }
  return entries.length > 0 ? ` style={{ ${entries.join(", ")} }}` : "";
}

/** Emit a component usage `<Name prop="v" … />`, mapped by contract identity (name + props). */
function emitComponent(node: LightNode, opts: CompileOptions, acc: Acc, depth: number): string {
  acc.used.add(node.component!);
  acc.componentsMapped++;
  const attrs = Object.entries(node.props ?? {})
    .map(([k, v]) => ` ${k}="${jsxAttr(v)}"`)
    .join("");
  const kids = node.children ?? [];
  if (kids.length === 0 && !node.text) return `${indent(depth)}<${node.component}${attrs} />`;
  const inner = node.text ? `${indent(depth + 1)}${jsxText(node.text)}` : kids.map((c) => emit(c, opts, acc, depth + 1)).join("\n");
  return `${indent(depth)}<${node.component}${attrs}>\n${inner}\n${indent(depth)}</${node.component}>`;
}

/** Emit a plain element with token-restored inline styles. */
function emitElement(node: LightNode, opts: CompileOptions, acc: Acc, depth: number): string {
  const tag = /^[a-z][a-z0-9-]*$/i.test(node.tag) ? node.tag.toLowerCase() : "div";
  const style = node.styles ? styleProp(node.styles, opts, acc) : "";
  const kids = node.children ?? [];
  if (kids.length === 0 && !node.text) return `${indent(depth)}<${tag}${style} />`;
  const inner = node.text ? `${indent(depth + 1)}${jsxText(node.text)}` : kids.map((c) => emit(c, opts, acc, depth + 1)).join("\n");
  return `${indent(depth)}<${tag}${style}>\n${inner}\n${indent(depth)}</${tag}>`;
}

function emit(node: LightNode, opts: CompileOptions, acc: Acc, depth: number): string {
  return node.component ? emitComponent(node, opts, acc, depth) : emitElement(node, opts, acc, depth);
}

/** Compile a light-authored page tree to framework (React/CVA) JSX. Deterministic — pure lookups. */
export function compileLightPage(root: LightNode, opts: CompileOptions): CompileResult {
  const acc: Acc = { used: new Set(), tokensRestored: 0, literalsKept: 0, componentsMapped: 0, residual: [], lint: [] };
  const code = emit(root, opts, acc, 0);
  return {
    code,
    usedComponents: [...acc.used],
    lintIssues: acc.lint,
    deterministicCoverage: {
      tokensRestored: acc.tokensRestored,
      literalsKept: acc.literalsKept,
      componentsMapped: acc.componentsMapped,
      residual: acc.residual,
    },
  };
}

/** True when the compile resolved everything by lookup — no residual, no leaks (fully deterministic). */
export function isFullyDeterministic(result: CompileResult): boolean {
  return result.deterministicCoverage.residual.length === 0 && result.lintIssues.length === 0;
}
