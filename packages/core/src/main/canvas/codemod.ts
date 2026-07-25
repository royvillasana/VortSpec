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
