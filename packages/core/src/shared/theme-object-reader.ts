import { Project, SyntaxKind, type ObjectLiteralExpression, type Node } from "ts-morph";

/**
 * Read a JS/TS theme file's exported object literal as plain data — OpenSpec change:
 * agentic-design-system, task 7.10.
 *
 * The mirror of `writeTsThemeToken` in `token-writers.ts`, which already edits these files with
 * ts-morph. Parsing rather than EVALUATING is not a stylistic preference: a project's `theme.ts` is
 * arbitrary code that may import, call functions, or read the environment, and running it to read
 * design tokens would execute the user's module inside the app process. The parse sees the literals
 * a theme object is actually made of and nothing else.
 *
 * Anything not statically knowable — a spread of an imported object, a computed value, a function
 * call — is simply absent from the result. That is the honest outcome: it is genuinely not a token
 * this reader can see, and inventing a placeholder would put a wrong value in the design system.
 */

/** How deep a theme object is followed. A real one is 3–4 levels; this only stops a pathological file. */
const MAX_DEPTH = 12;

/**
 * The plain nested object behind a theme file's default/named export, or null when the file holds no
 * object literal at all.
 *
 * The chosen literal is the one behind `export default`, else `export const theme`/`tokens`, else
 * the first exported object literal — in that order, because that is the order of how deliberately
 * the author signalled "this is the theme". Never throws: a file that will not parse reads as null,
 * which the caller reports as "no tokens found here" rather than as a crash.
 */
export function readTsThemeObject(content: string): Record<string, unknown> | null {
  try {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile("theme.ts", content);

    const fromDefault = sf
      .getExportAssignments()
      .map((assignment) => objectLiteralOf(assignment.getExpression()))
      .find(Boolean);
    if (fromDefault) return readObjectLiteral(fromDefault, 0);

    const declarations = sf
      .getVariableDeclarations()
      .filter((declaration) => declaration.isExported());
    const named = declarations.find((declaration) =>
      /^(theme|tokens|designTokens)$/i.test(declaration.getName()),
    );
    const literal =
      objectLiteralOf(named?.getInitializer()) ??
      declarations.map((declaration) => objectLiteralOf(declaration.getInitializer())).find(Boolean);
    return literal ? readObjectLiteral(literal, 0) : null;
  } catch {
    return null;
  }
}

/**
 * The object literal an expression really is, seeing through `as const` / `satisfies Theme`.
 *
 * Those assertions are type-level and carry no runtime meaning, but they wrap the literal in the
 * AST — and `as const` is close to universal on a real theme file, so without this the reader would
 * return null for exactly the files it most needs to read.
 */
function objectLiteralOf(node: Node | undefined): ObjectLiteralExpression | undefined {
  if (!node) return undefined;
  const direct = node.asKind(SyntaxKind.ObjectLiteralExpression);
  if (direct) return direct;
  const assertion =
    node.asKind(SyntaxKind.AsExpression) ?? node.asKind(SyntaxKind.SatisfiesExpression);
  return assertion ? objectLiteralOf(assertion.getExpression()) : undefined;
}

function readObjectLiteral(node: ObjectLiteralExpression, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (depth > MAX_DEPTH) return out;
  for (const property of node.getProperties()) {
    const assignment = property.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue; // spread, shorthand, method — not statically a token
    const name = assignment.getName().replace(/^['"]|['"]$/g, "");
    const initializer = assignment.getInitializer();
    if (!initializer) continue;
    const value = readValue(initializer, depth + 1);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** A literal expression → its JS value; undefined for anything not statically knowable. */
function readValue(node: Node, depth: number): unknown {
  const object = node.asKind(SyntaxKind.ObjectLiteralExpression);
  if (object) return readObjectLiteral(object, depth);

  const array = node.asKind(SyntaxKind.ArrayLiteralExpression);
  if (array) {
    const items = array.getElements().map((element) => readValue(element, depth + 1));
    // One unreadable element would make the array silently wrong (a font stack missing its fallback),
    // so the whole value is dropped rather than partially reported.
    return items.some((item) => item === undefined) ? undefined : items;
  }

  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))
    return node.getLiteralValue();
  if (node.isKind(SyntaxKind.NumericLiteral)) return node.getLiteralValue();
  if (node.isKind(SyntaxKind.TrueKeyword)) return true;
  if (node.isKind(SyntaxKind.FalseKeyword)) return false;
  // A negative number is a prefix-unary expression, not a numeric literal — `-1` would otherwise be
  // unreadable, and negative values are ordinary in a theme (letter-spacing, inset offsets).
  const unary = node.asKind(SyntaxKind.PrefixUnaryExpression);
  if (unary && unary.getOperatorToken() === SyntaxKind.MinusToken) {
    const operand = readValue(unary.getOperand(), depth + 1);
    return typeof operand === "number" ? -operand : undefined;
  }
  // `as const`, `satisfies Theme` — the assertion is type-level, so read straight through it.
  const asExpression = node.asKind(SyntaxKind.AsExpression) ?? node.asKind(SyntaxKind.SatisfiesExpression);
  if (asExpression) return readValue(asExpression.getExpression(), depth);
  return undefined;
}
