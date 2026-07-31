import { Project, SyntaxKind, type ObjectLiteralExpression, type PropertyAssignment } from "ts-morph";
import type { ThemeOverrides } from "./theme-overrides";

/**
 * Format-aware token writers + a materializer (change: consume-component-libraries). The token
 * editor's write path was CSS-only (`--name:` regex) — a JS/TS theme object, SCSS, or JSON token
 * file silently no-op'd. These write a value into a token file of ANY of the four formats, and the
 * materializer emits the durable override overlay as CSS. All pure + best-effort (null on no-match /
 * parse failure), so a malformed source never throws or corrupts.
 */
export type TokenFormat = "css" | "scss" | "json" | "ts";

export function detectTokenFormat(filename: string): TokenFormat {
  if (/\.scss$/i.test(filename)) return "scss";
  if (/\.json$/i.test(filename)) return "json";
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filename)) return "ts";
  return "css";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** CSS custom property: replace `--name: <old>;` in place. Returns null if the var isn't present. */
export function writeCssVar(content: string, name: string, value: string): string | null {
  const bare = name.replace(/^--/, "");
  const re = new RegExp(`(--${escapeRe(bare)}\\s*:\\s*)([^;]*)(;)`);
  return re.test(content) ? content.replace(re, `$1${value}$3`) : null;
}

/** SCSS variable: replace `$name: <old>;` in place. Returns null if the var isn't present. */
export function writeScssVar(content: string, name: string, value: string): string | null {
  const bare = name.replace(/^[$-]+/, "");
  const re = new RegExp(`(\\$${escapeRe(bare)}\\s*:\\s*)([^;]*)(;)`);
  return re.test(content) ? content.replace(re, `$1${value}$3`) : null;
}

/**
 * W3C-style / plain JSON design tokens: set a dotted `path` (creating intermediate objects). A leaf
 * that's an object with a `value` key keeps that shape (`{ "value": … }`); otherwise the leaf is the
 * value directly. Returns null only on invalid JSON.
 */
export function writeJsonToken(content: string, path: string, value: string): string | null {
  let root: unknown;
  try {
    root = JSON.parse(content || "{}");
  } catch {
    return null;
  }
  if (typeof root !== "object" || root === null) root = {};
  const segs = path.split(".").filter(Boolean);
  let node = root as Record<string, unknown>;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (typeof node[s] !== "object" || node[s] === null) node[s] = {};
    node = node[s] as Record<string, unknown>;
  }
  const leafKey = segs[segs.length - 1];
  const existing = node[leafKey];
  if (existing && typeof existing === "object" && "value" in (existing as object)) {
    (existing as Record<string, unknown>).value = value;
  } else {
    node[leafKey] = value;
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

/** Navigate a dotted property path through nested object literals; returns the leaf property assignment. */
function navigateObject(obj: ObjectLiteralExpression, segs: string[]) {
  let cur: ObjectLiteralExpression | undefined = obj;
  for (let i = 0; i < segs.length; i++) {
    if (!cur) return undefined;
    const prop: PropertyAssignment | undefined = cur.getProperty(segs[i])?.asKind(SyntaxKind.PropertyAssignment);
    if (!prop) return undefined;
    if (i === segs.length - 1) return prop;
    cur = prop.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
  }
  return undefined;
}

/**
 * JS/TS theme object: set a dotted property `path` (e.g. `palette.primary.main`) to `value` in the
 * first object literal that carries the path. Preserves surrounding code. Returns null if not found.
 */
export function writeTsThemeToken(content: string, path: string, value: string): string | null {
  try {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile("theme.ts", content);
    const segs = path.split(".").filter(Boolean);
    for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
      const leaf = navigateObject(obj, segs);
      if (leaf) {
        // Quote a non-numeric/non-boolean/non-var value as a string literal.
        const isLiteral = /^(-?\d+(\.\d+)?|true|false)$/.test(value.trim());
        leaf.setInitializer(isLiteral ? value.trim() : JSON.stringify(value));
        return sf.getFullText();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Dispatch a write by the token file's format. `key` is the format-appropriate key (var name / path). */
export function writeToken(
  format: TokenFormat,
  content: string,
  key: string,
  value: string,
): string | null {
  switch (format) {
    case "css":
      return writeCssVar(content, key, value);
    case "scss":
      return writeScssVar(content, key, value);
    case "json":
      return writeJsonToken(content, key, value);
    case "ts":
      return writeTsThemeToken(content, key, value);
  }
}

/**
 * Materialize the durable overlay's GLOBAL token overrides as an override stylesheet — a base
 * `:root { … }` plus one block per theme mode. This is the applier for CSS-variable sources
 * (shadcn / built / Astryx runtime) and the enterprise/consumed overlay (resolved on top, never
 * mutating the real source). Per-component overrides are materialized per library elsewhere.
 */
export function materializeCssOverlay(overrides: ThemeOverrides, rootSelector = ":root"): string {
  const base: string[] = [];
  const byMode = new Map<string, string[]>();
  for (const [name, o] of Object.entries(overrides.tokens)) {
    const line = `  --${name}: ${o.value};`;
    if (o.mode) (byMode.get(o.mode) ?? byMode.set(o.mode, []).get(o.mode)!).push(line);
    else base.push(line);
  }
  const blocks: string[] = [];
  if (base.length) blocks.push(`${rootSelector} {\n${base.join("\n")}\n}`);
  for (const [mode, lines] of byMode) {
    // A mode selector: `.dark`, `[data-theme="dark"]` etc. — default to a class.
    const sel = mode.startsWith(".") || mode.startsWith("[") ? mode : `.${mode}`;
    blocks.push(`${sel} {\n${lines.join("\n")}\n}`);
  }
  const header = "/* VortSpec design-system personalization — generated from .vortspec/theme-overrides.json */";
  return blocks.length ? `${header}\n${blocks.join("\n\n")}\n` : "";
}

/** kebab-case a possibly-camelCase CSS property name (`fontWeight` → `font-weight`); pass-through if already kebab. */
function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Escape a value for use inside a double-quoted CSS attribute selector. */
function attrEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Emit one CSS rule `sel { prop: val; … }` from a decl bag; "" when the bag is empty. */
function cssRule(sel: string, bag: Record<string, string>): string {
  const decls = Object.entries(bag)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `  ${kebab(k)}: ${v};`);
  return decls.length ? `${sel} {\n${decls.join("\n")}\n}` : "";
}

/**
 * Materialize the durable overlay's PER-COMPONENT overrides as scoped CSS — the source-agnostic
 * per-component lever (change: consume-component-libraries, task 12.7). Keyed on `data-component` (the same
 * marker the light stand-ins and compiled output carry), so one override reaches every instance of a
 * component regardless of how it was introduced:
 * - `base`            → `[data-component="X"] { … }`
 * - `variants[a][o]`  → `[data-component="X"][data-a="o"] { … }`   (e.g. `[data-variant="ghost"]`)
 * - `slots[s]`        → `[data-component="X"] [data-slot="s"] { … }`
 * This is the applier for every CSS-based source (light canvas, enterprise overlay, shadcn, Astryx runtime
 * CSS). Theme-object libraries (MUI/Chakra/…) apply per-component overrides through their own
 * `theme.components` lever — generated by the per-library recipes, not this CSS.
 */
export function materializeComponentCss(overrides: ThemeOverrides): string {
  const blocks: string[] = [];
  for (const [name, o] of Object.entries(overrides.components)) {
    const sel = `[data-component="${attrEscape(name)}"]`;
    if (o.base) {
      const r = cssRule(sel, o.base);
      if (r) blocks.push(r);
    }
    for (const [axis, opts] of Object.entries(o.variants ?? {})) {
      for (const [option, bag] of Object.entries(opts)) {
        const r = cssRule(`${sel}[data-${kebab(attrEscape(axis))}="${attrEscape(option)}"]`, bag);
        if (r) blocks.push(r);
      }
    }
    for (const [slot, bag] of Object.entries(o.slots ?? {})) {
      const r = cssRule(`${sel} [data-slot="${attrEscape(slot)}"]`, bag);
      if (r) blocks.push(r);
    }
  }
  if (!blocks.length) return "";
  const header = "/* VortSpec per-component personalization — generated from .vortspec/theme-overrides.json */";
  return `${header}\n${blocks.join("\n\n")}\n`;
}
