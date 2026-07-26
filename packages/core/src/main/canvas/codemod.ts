/**
 * Deterministic JSX codemods for instant Playground edits (change: instant-playground-edits).
 *
 * Pure `string → string` transforms over a component's source: given an ANCHOR (the
 * `data-source` line/column React stamps on each element in dev) they locate the exact JSX
 * element and rewrite it — set an attribute, replace inline text, or perform a structural
 * op (insert / move / duplicate / delete). No AI. ts-morph preserves imports and formatting.
 *
 * Kept side-effect-free (no fs) so they are fully unit-testable; the IPC layer reads the
 * file, calls these, and writes back under the existing snapshot mechanism.
 */
import { Project, Node, SyntaxKind, ts, type JsxOpeningElement, type JsxSelfClosingElement } from "ts-morph";
import type { Anchor, AttrValue } from "@vortspec/core/canvas-edit";

export type { Anchor, AttrValue };

export interface Resolvability {
  resolvable: boolean;
  reason?: string;
}

type JsxLike = Node; // JsxElement | JsxSelfClosingElement | JsxFragment

function sourceFileOf(text: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
  });
  return project.createSourceFile("edit.tsx", text, { overwrite: true });
}

function posOf(sf: ReturnType<typeof sourceFileOf>, anchor: Anchor): number {
  // React stamps 1-based line + 0-based column of the opening `<`.
  return ts.getPositionOfLineAndCharacter(sf.compilerNode, Math.max(0, anchor.line - 1), Math.max(0, anchor.column));
}

/** Climb from the position to the nearest JSX element/self-closing/fragment. */
function jsxAt(sf: ReturnType<typeof sourceFileOf>, anchor: Anchor): JsxLike | undefined {
  let node: Node | undefined = sf.getDescendantAtPos(posOf(sf, anchor));
  while (node && !Node.isJsxElement(node) && !Node.isJsxSelfClosingElement(node) && !Node.isJsxFragment(node)) {
    node = node.getParent();
  }
  return node ?? undefined;
}

function openingOf(el: JsxLike): JsxOpeningElement | JsxSelfClosingElement {
  if (Node.isJsxElement(el)) return el.getOpeningElement();
  if (Node.isJsxSelfClosingElement(el)) return el; // self-closing IS its own opening
  throw new CodemodError("This element can't take attributes.");
}

/**
 * Is the anchored element a statically-resolvable, direct JSX node — not rendered inside a
 * `.map()`/loop, a ternary, or an `&&`/`||` short-circuit? Only resolvable elements are safe
 * to rewrite deterministically; the rest are handed to the assistant.
 */
export function checkResolvability(text: string, anchor: Anchor): Resolvability {
  const sf = sourceFileOf(text);
  const el = jsxAt(sf, anchor);
  if (!el) return { resolvable: false, reason: "Couldn't locate this element's JSX in source." };

  const MAP_RE = /^(map|flatMap|forEach|filter|reduce)$/;
  const isMapCallback = (fn: Node): boolean => {
    const p = fn.getParent();
    if (!p || !Node.isCallExpression(p)) return false;
    const expr = p.getExpression();
    return Node.isPropertyAccessExpression(expr) && MAP_RE.test(expr.getName());
  };

  let n: Node | undefined = el.getParent();
  while (n) {
    if (Node.isCallExpression(n)) {
      const expr = n.getExpression();
      if (Node.isPropertyAccessExpression(expr) && MAP_RE.test(expr.getName())) {
        return { resolvable: false, reason: "It's rendered inside a list (.map()), so there's no single JSX node to edit." };
      }
    }
    if (Node.isConditionalExpression(n)) {
      return { resolvable: false, reason: "It's rendered inside a conditional (a ternary)." };
    }
    if (Node.isBinaryExpression(n)) {
      const op = n.getOperatorToken().getKind();
      if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
        return { resolvable: false, reason: "It's rendered inside a conditional (&& / ||)." };
      }
    }
    if (Node.isFunctionDeclaration(n) || Node.isArrowFunction(n) || Node.isFunctionExpression(n)) {
      // A function scope. If it's a `.map()` (etc.) render callback, keep climbing so the
      // enclosing call is caught next iteration; otherwise this is the component boundary — stop.
      if (!isMapCallback(n)) break;
    }
    n = n.getParent();
  }
  return { resolvable: true };
}

/** The className string of an opening element, when it's a plain string literal (not an expression). */
function classNameOf(open: JsxOpeningElement | JsxSelfClosingElement): string | undefined {
  const attr = open.getAttribute("className");
  if (!attr || !Node.isJsxAttribute(attr)) return undefined;
  const init = attr.getInitializer();
  if (init && Node.isStringLiteral(init)) return init.getLiteralValue();
  if (init && Node.isJsxExpression(init)) {
    const expr = init.getExpression();
    if (expr && Node.isStringLiteral(expr)) return expr.getLiteralValue();
  }
  return undefined;
}

/**
 * The LOW-CONFIDENCE fallback matcher (change: instant-playground-edits, task 1.4): locate a JSX
 * element by its tag + className signature (what `classSignature`/the fingerprint encodes) — the
 * path used when a `data-source` anchor is absent or stale. Returns the anchor of the UNIQUE match,
 * or null when zero or many match (ambiguous → hand off, never guess). The high-confidence path is
 * the anchor itself; this exists so the two can be cross-checked and to survive a lost anchor.
 */
export function matchBySignature(text: string, sig: { tag: string; className?: string }): Anchor | null {
  const sf = sourceFileOf(text);
  const hits: (JsxOpeningElement | JsxSelfClosingElement)[] = [];
  sf.forEachDescendant((node) => {
    if (!Node.isJsxElement(node) && !Node.isJsxSelfClosingElement(node)) return;
    const open = openingOf(node);
    if (open.getTagNameNode().getText() !== sig.tag) return;
    if (sig.className !== undefined && classNameOf(open) !== sig.className) return;
    hits.push(open);
  });
  if (hits.length !== 1) return null;
  const start = hits[0].getStart();
  const { line, character } = sf.compilerNode.getLineAndCharacterOfPosition(start);
  return { line: line + 1, column: character };
}

/**
 * Resolve the anchor to actually edit (design-review DR-2): trust the `data-source` line:col, but
 * VERIFY the element there matches the expected identity (tag + className the selection carried). If
 * it doesn't — a stale/offset anchor, the class of bug that made writes silently miss — re-locate by
 * class signature (`matchBySignature`). Returns the raw anchor when there's nothing to verify against,
 * the re-located anchor on a unique signature match, or null when it can't be trusted (→ withhold).
 */
export function resolveEditAnchor(
  text: string,
  anchor: Anchor,
  expect?: { tag?: string; className?: string },
): Anchor | null {
  if (!expect || (!expect.tag && expect.className === undefined)) return anchor;
  const sf = sourceFileOf(text);
  const el = jsxAt(sf, anchor);
  if (el) {
    const open = openingOf(el);
    const tagOk = !expect.tag || open.getTagNameNode().getText() === expect.tag;
    const clsOk = expect.className === undefined || classNameOf(open) === expect.className;
    if (tagOk && clsOk) return anchor; // the raw anchor points at the right element — use it
  }
  // Anchor is stale or points at the wrong node → fall back to the identity matcher.
  if (!expect.tag) return null; // can't re-locate without a tag
  return matchBySignature(text, { tag: expect.tag, className: expect.className });
}

function requireEl(text: string, anchor: Anchor): { sf: ReturnType<typeof sourceFileOf>; el: JsxLike } {
  const sf = sourceFileOf(text);
  const el = jsxAt(sf, anchor);
  if (!el) throw new CodemodError("Couldn't locate this element's JSX in source.");
  return { sf, el };
}

export class CodemodError extends Error {}

function initializerText(v: AttrValue): string {
  return v.kind === "string" ? JSON.stringify(v.value) : `{${v.value}}`;
}

/** Set (or add) a JSX attribute on the anchored element. Covers prop, className, and CVA variant. */
export function setJsxAttr(text: string, anchor: Anchor, name: string, value: AttrValue): string {
  const { sf, el } = requireEl(text, anchor);
  const open = openingOf(el);
  const existing = open.getAttribute(name);
  if (existing && Node.isJsxAttribute(existing)) {
    existing.setInitializer(initializerText(value));
  } else {
    open.addAttribute({ name, initializer: initializerText(value) });
  }
  return sf.getFullText();
}

/** Convenience wrappers so the caller's intent is explicit at the call site. */
export const setClassName = (text: string, a: Anchor, className: string): string =>
  setJsxAttr(text, a, "className", { kind: "string", value: className });
export const setCvaVariant = (text: string, a: Anchor, prop: string, value: string): string =>
  setJsxAttr(text, a, prop, { kind: "string", value });

/** CSS property name → React inline-style key (camelCase), leaving CSS custom props (`--x`) as-is. */
function cssToStyleKey(prop: string): string {
  return prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}
const isIdent = (k: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
const styleKeyLiteral = (k: string): string => (isIdent(k) ? k : JSON.stringify(k));

/**
 * Merge CSS declarations into the anchored element's inline `style={{}}` object — the deterministic,
 * literal-value write for a freeform style edit (no token, no class inference, no AI). Adds a `style`
 * attribute when absent; updates/adds each property when present. Withholds (throws) only when the
 * element already has a non-object `style` (e.g. `style={theme.x}`) we can't safely merge into.
 */
export function setInlineStyle(text: string, anchor: Anchor, css: Record<string, string>): string {
  const { sf, el } = requireEl(text, anchor);
  const open = openingOf(el);
  const entries = Object.entries(css);
  if (entries.length === 0) return sf.getFullText();
  const existing = open.getAttribute("style");
  if (existing && Node.isJsxAttribute(existing)) {
    const init = existing.getInitializer();
    const expr = init && Node.isJsxExpression(init) ? init.getExpression() : undefined;
    if (!expr || !Node.isObjectLiteralExpression(expr)) {
      throw new CodemodError("This element's style isn't an inline object, so it can't be edited in place.");
    }
    for (const [prop, value] of entries) {
      const key = cssToStyleKey(prop);
      const match = expr.getProperties().find((p) => {
        if (!Node.isPropertyAssignment(p) && !Node.isShorthandPropertyAssignment(p)) return false;
        return p.getName().replace(/^['"]|['"]$/g, "") === key;
      });
      if (match && Node.isPropertyAssignment(match)) match.setInitializer(JSON.stringify(value));
      else expr.addPropertyAssignment({ name: styleKeyLiteral(key), initializer: JSON.stringify(value) });
    }
  } else {
    const obj = entries.map(([p, v]) => `${styleKeyLiteral(cssToStyleKey(p))}: ${JSON.stringify(v)}`).join(", ");
    open.addAttribute({ name: "style", initializer: `{{ ${obj} }}` });
  }
  return sf.getFullText();
}

/** Replace the anchored element's inline text (leaf text/expression children) with `newText`. */
export function setTextNode(text: string, anchor: Anchor, newText: string): string {
  const { sf, el } = requireEl(text, anchor);
  if (!Node.isJsxElement(el)) throw new CodemodError("This element has no text body to edit.");
  const kids = el.getJsxChildren().filter((c) => !Node.isJsxText(c) || c.getText().trim().length > 0);
  const nonText = kids.filter((c) => !Node.isJsxText(c));
  if (nonText.length > 0) throw new CodemodError("This element has child elements, not just text.");
  const open = el.getOpeningElement();
  const close = el.getClosingElement();
  // Replace everything between the tags with the escaped text.
  sf.replaceText([open.getEnd(), close.getStart()], escapeJsxText(newText));
  return sf.getFullText();
}

function escapeJsxText(s: string): string {
  return s.replace(/[{}<>]/g, (c) => `{${JSON.stringify(c)}}`);
}

/** Insert a known component as a child of the anchored element at `index`, ensuring its import. */
export function insertComponent(
  text: string,
  anchor: Anchor,
  spec: { name: string; importFrom?: string; index?: number; namedImport?: boolean },
): string {
  const { sf, el } = requireEl(text, anchor);
  if (!Node.isJsxElement(el) && !Node.isJsxFragment(el)) {
    throw new CodemodError("Can only insert into a container element, not a self-closing one.");
  }
  const children = el.getJsxChildren().filter((c) => !(Node.isJsxText(c) && c.getText().trim() === ""));
  const at = Math.max(0, Math.min(spec.index ?? children.length, children.length));
  const snippet = `<${spec.name} />`;
  const open = openingOf(el);
  const anchorNode = children[at];
  if (anchorNode) sf.insertText(anchorNode.getStart(), `${snippet}\n`);
  else sf.insertText(open.getEnd(), `\n${snippet}\n`);
  if (spec.importFrom) ensureImport(sf, spec.name, spec.importFrom, spec.namedImport ?? true);
  return sf.getFullText();
}

/** Remove the anchored element (and its now-empty line). */
export function deleteNode(text: string, anchor: Anchor): string {
  const { sf, el } = requireEl(text, anchor);
  const start = lineStart(sf, el.getStart());
  const end = lineEnd(sf, el.getEnd());
  sf.replaceText([start, end], "");
  return sf.getFullText();
}

/** Insert a copy of the anchored element immediately after it. */
export function duplicateNode(text: string, anchor: Anchor): string {
  const { sf, el } = requireEl(text, anchor);
  const clone = el.getText();
  sf.insertText(lineEnd(sf, el.getEnd()), `\n${indentOf(sf, el.getStart())}${clone}`);
  return sf.getFullText();
}

/** Move the element at `from` to be a child of the element at `to`, at `index` (same file). */
export function moveNode(text: string, from: Anchor, to: Anchor, index?: number): string {
  const sf = sourceFileOf(text);
  const src = jsxAt(sf, from);
  const dst = jsxAt(sf, to);
  if (!src) throw new CodemodError("Couldn't locate the element being moved.");
  if (!dst || (!Node.isJsxElement(dst) && !Node.isJsxFragment(dst))) {
    throw new CodemodError("The move target must be a container element.");
  }
  if (dst.getStart() <= src.getStart() && dst.getEnd() >= src.getEnd()) {
    // no-op-ish: already inside target — allow (reorder handled by index), but guard the trivial case
  }
  const moved = src.getText();
  // Remove the source line first, then insert into the target (positions computed before edits).
  const rmStart = lineStart(sf, src.getStart());
  const rmEnd = lineEnd(sf, src.getEnd());
  const children = dst.getJsxChildren().filter((c) => !(Node.isJsxText(c) && c.getText().trim() === ""));
  const at = Math.max(0, Math.min(index ?? children.length, children.length));
  const insertPos = children[at] ? children[at].getStart() : openingOf(dst).getEnd();
  // Apply the insert first if it comes before the removal, else removal first — to keep offsets valid.
  if (insertPos <= rmStart) {
    sf.insertText(insertPos, `${moved}\n`);
    const shift = moved.length + 1;
    sf.replaceText([rmStart + shift, rmEnd + shift], "");
  } else {
    sf.replaceText([rmStart, rmEnd], "");
    const shift = rmEnd - rmStart;
    sf.insertText(insertPos - shift, `${moved}\n`);
  }
  return sf.getFullText();
}

/**
 * Move the element at `from` to sit immediately before/after the SIBLING element at `target`
 * (the drag-drop case — deterministic, no AI). Both anchors must resolve to real JSX nodes and
 * neither may be the other's ancestor. Same-file only (the caller guards cross-file drops).
 */
export function moveNodeRelative(text: string, from: Anchor, target: Anchor, position: "before" | "after"): string {
  const sf = sourceFileOf(text);
  const src = jsxAt(sf, from);
  const dst = jsxAt(sf, target);
  if (!src) throw new CodemodError("Couldn't locate the element being moved.");
  if (!dst) throw new CodemodError("Couldn't locate the drop target.");
  if (src === dst) throw new CodemodError("The element is already there.");
  if (src.getStart() <= dst.getStart() && src.getEnd() >= dst.getEnd()) {
    throw new CodemodError("Can't move an element into itself.");
  }
  const moved = src.getText();
  const indent = indentOf(sf, dst.getStart());
  const rmStart = lineStart(sf, src.getStart());
  const rmEnd = lineEnd(sf, src.getEnd());
  // Insertion point: the start of the target's line (before) or the end of it (after).
  const insertPos = position === "before" ? lineStart(sf, dst.getStart()) : lineEnd(sf, dst.getEnd());
  const block = `${indent}${moved}\n`;
  // Order the two edits so earlier offsets aren't invalidated by the later one.
  if (insertPos <= rmStart) {
    sf.insertText(insertPos, block);
    const shift = block.length;
    sf.replaceText([rmStart + shift, rmEnd + shift], "");
  } else {
    sf.replaceText([rmStart, rmEnd], "");
    const shift = rmEnd - rmStart;
    sf.insertText(insertPos - shift, block);
  }
  return sf.getFullText();
}

/**
 * From a mapped element's anchor, resolve the LOCAL array literal the `.map()` iterates — the one
 * deterministically-editable data source for a list (change: instant-playground-edits). Returns the
 * `ArrayLiteralExpression` for `[...].map(...)` or a local `const items = [...]` in the same file;
 * null when the data isn't a local literal (props / state / an API / a chained `.filter().map()`),
 * where reordering by rendered index would be ambiguous — those still hand off to the assistant.
 */
/** Whether a `.map()` callback renders exactly one JSX element per item (so rendered index = array
 *  index). Rejects a conditional (ternary / `&&`), a fragment (0..N children), or multiple returns. */
function mapRendersOneElement(call: import("ts-morph").CallExpression): boolean {
  const cb = call.getArguments()[0];
  if (!cb || (!Node.isArrowFunction(cb) && !Node.isFunctionExpression(cb))) return false;
  const body = cb.getBody();
  let ret: Node | undefined;
  if (Node.isBlock(body)) {
    const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    if (returns.length !== 1) return false; // conditional / multiple returns → index may not align
    ret = returns[0].getExpression();
  } else {
    ret = body;
  }
  while (ret && Node.isParenthesizedExpression(ret)) ret = ret.getExpression();
  return !!ret && (Node.isJsxElement(ret) || Node.isJsxSelfClosingElement(ret));
}

function mappedArrayLiteral(sf: ReturnType<typeof sourceFileOf>, anchor: Anchor): import("ts-morph").ArrayLiteralExpression | null {
  const el = jsxAt(sf, anchor);
  if (!el) return null;
  let n: Node | undefined = el.getParent();
  let call: import("ts-morph").CallExpression | undefined;
  while (n) {
    if (Node.isCallExpression(n)) {
      const expr = n.getExpression();
      if (Node.isPropertyAccessExpression(expr) && expr.getName() === "map") {
        call = n;
        break;
      }
    }
    n = n.getParent();
  }
  if (!call) return null;
  // The rendered index only equals the ARRAY index when the callback renders exactly ONE element per
  // item, unconditionally. A ternary/`&&`/fragment/multi-return callback can skip or emit multiple
  // elements, so a by-index list edit could hit the wrong item — withhold and hand off instead.
  if (!mapRendersOneElement(call)) return null;
  const access = call.getExpression();
  if (!Node.isPropertyAccessExpression(access)) return null;
  const mapped = access.getExpression();
  // `[...].map(...)` — an inline literal.
  if (Node.isArrayLiteralExpression(mapped)) return mapped;
  // `items.map(...)` where `items` is a local `const items = [...]` in THIS file (only local, so
  // props/imports/state — not resolvable here — correctly fall through to the assistant).
  if (Node.isIdentifier(mapped)) {
    const decl = sf.getVariableDeclaration(mapped.getText());
    const init = decl?.getInitializer();
    if (init && Node.isArrayLiteralExpression(init)) return init;
  }
  return null;
}

/** The rendered-order element texts of a list's backing array (for the host to build a preview). */
export function listItems(text: string, anchor: Anchor): string[] | null {
  const sf = sourceFileOf(text);
  const arr = mappedArrayLiteral(sf, anchor);
  return arr ? arr.getElements().map((e) => e.getText()) : null;
}

/** Remove the `index`-th item from a mapped element's backing LOCAL array literal. */
export function removeArrayItem(text: string, anchor: Anchor, index: number): string {
  const sf = sourceFileOf(text);
  const arr = mappedArrayLiteral(sf, anchor);
  if (!arr) throw new CodemodError("This list isn't backed by a local array, so its items can't be edited in place.");
  const els = arr.getElements();
  if (index < 0 || index >= els.length) throw new CodemodError("That list item is out of range.");
  arr.removeElement(index);
  return sf.getFullText();
}

/** Reorder a mapped element's backing LOCAL array: move item `from` to final index `to`. */
export function reorderArrayItem(text: string, anchor: Anchor, from: number, to: number): string {
  const sf = sourceFileOf(text);
  const arr = mappedArrayLiteral(sf, anchor);
  if (!arr) throw new CodemodError("This list isn't backed by a local array, so its items can't be reordered in place.");
  const texts = arr.getElements().map((e) => e.getText());
  if (from < 0 || from >= texts.length) throw new CodemodError("That list item is out of range.");
  const [moved] = texts.splice(from, 1);
  texts.splice(Math.max(0, Math.min(to, texts.length)), 0, moved);
  const raw = arr.getText();
  if (/\n/.test(raw)) {
    // Preserve a one-item-per-line array's shape.
    const m = raw.match(/\[\s*\n([ \t]*)/);
    const indent = m ? m[1] : "  ";
    arr.replaceWithText(`[\n${texts.map((t) => indent + t).join(",\n")},\n]`);
  } else {
    arr.replaceWithText(`[${texts.join(", ")}]`);
  }
  return sf.getFullText();
}

// ── helpers ───────────────────────────────────────────────────────────────
function ensureImport(sf: ReturnType<typeof sourceFileOf>, name: string, from: string, named: boolean): void {
  const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === from);
  if (existing) {
    if (named) {
      if (!existing.getNamedImports().some((n) => n.getName() === name)) existing.addNamedImport(name);
    } else if (!existing.getDefaultImport()) {
      existing.setDefaultImport(name);
    }
    return;
  }
  sf.addImportDeclaration(named ? { moduleSpecifier: from, namedImports: [name] } : { moduleSpecifier: from, defaultImport: name });
}

function lineStart(sf: ReturnType<typeof sourceFileOf>, pos: number): number {
  const text = sf.getFullText();
  let i = pos;
  while (i > 0 && text[i - 1] !== "\n") i--;
  return i;
}
function lineEnd(sf: ReturnType<typeof sourceFileOf>, pos: number): number {
  const text = sf.getFullText();
  let i = pos;
  while (i < text.length && text[i] !== "\n") i++;
  return i < text.length ? i + 1 : i; // include the newline
}
function indentOf(sf: ReturnType<typeof sourceFileOf>, pos: number): string {
  const text = sf.getFullText();
  const start = lineStart(sf, pos);
  const m = text.slice(start).match(/^[ \t]*/);
  return m ? m[0] : "";
}
