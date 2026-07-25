/**
 * Stamp `data-source="relPath:line:column"` onto every JSX opening element (change:
 * instant-playground-edits, task 1.1). This is the anchor the canvas bridge reads off a
 * rendered DOM node and hands to the codemods — line/column are recorded in the ORIGINAL
 * source's coordinates (1-based line, 0-based column of `<`), exactly what `codemod.ts`
 * expects, so the DOM anchor round-trips to the right JSX node.
 *
 * Pure `string → string` so it's unit-testable and framework-harness-agnostic. Whether this
 * runs as a Vite/Babel dev plugin injected into the project's build, or as a runtime pass, is
 * the integration seam (task 1.2) — this function is the transform either path uses.
 */
import { Project, Node, ts } from "ts-morph";

const ATTR = "data-source";

/** Add `data-source` to each JSX opening element that lacks one. `relPath` is project-relative. */
export function stampDataSource(code: string, relPath: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
  });
  const sf = project.createSourceFile("stamp.tsx", code, { overwrite: true });
  const full = sf.getFullText();

  // Collect (opening element, original line, original column) BEFORE mutating, so the stamped
  // coordinates reflect the untouched source the codemods will parse.
  const targets: { openStart: number; line: number; column: number }[] = [];
  sf.forEachDescendant((node) => {
    let open: Node | undefined;
    if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) open = node;
    if (!open) return;
    // Skip if it already carries a data-source (idempotent) or isn't a host/component element.
    const openEl = open as import("ts-morph").JsxOpeningElement | import("ts-morph").JsxSelfClosingElement;
    if (openEl.getAttribute(ATTR)) return;
    // `.getStart()` is the `<` for BOTH a JsxOpeningElement and a JsxSelfClosingElement.
    const { line, column } = lineCol(full, openEl.getStart());
    targets.push({ openStart: openEl.getEnd(), line, column });
  });

  if (targets.length === 0) return code;

  // Insert from the BACK so earlier offsets stay valid as we mutate.
  const escaped = relPath.replace(/"/g, '\\"');
  targets
    .sort((a, b) => b.openStart - a.openStart)
    .forEach((t) => {
      // Insert right after the tag name / existing attrs, before `>` or `/>`.
      const insertPos = attrInsertPos(sf.getFullText(), t.openStart);
      sf.insertText(insertPos, ` ${ATTR}="${escaped}:${t.line}:${t.column}"`);
    });

  return sf.getFullText();
}

/** Parse a `data-source` attribute value into a project-relative file + anchor. */
export function parseDataSource(value: string | null | undefined): { file: string; line: number; column: number } | null {
  if (!value) return null;
  const m = value.match(/^(.*):(\d+):(\d+)$/);
  if (!m) return null;
  return { file: m[1], line: Number(m[2]), column: Number(m[3]) };
}

/** 1-based line, 0-based column of `<` — the same anchor shape codemod.ts consumes. */
function lineCol(text: string, pos: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: pos - lineStart };
}

/** Find the position just before the closing `>`/`/>` of an opening tag, given its end offset. */
function attrInsertPos(text: string, openEnd: number): number {
  // openEnd is the element's end. Walk back over `>` and any `/`, and trailing whitespace.
  let i = openEnd - 1;
  while (i > 0 && (text[i] === ">" || text[i] === "/" || text[i] === " " || text[i] === "\n" || text[i] === "\t")) i--;
  return i + 1;
}
