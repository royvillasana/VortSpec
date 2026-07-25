/**
 * The standalone, self-contained source-stamp — the entry esbuild bundles into
 * `vortspec-stamp.mjs`, which ships in VortSpec's resources and is copied into a project's
 * `.vortspec/` at dev-server start so the project's OWN Vite can import it (issue #56, option 1).
 *
 * Uses the raw TypeScript parser (NOT ts-morph) so the bundle stays small and each per-transform
 * stamp is a single lightweight parse — no language service, no Project. The output matches
 * `stamp-source.ts` exactly: `data-source="relPath:1-based-line:0-based-column-of-<"`, the anchor
 * the codemods consume. Only deps: `typescript` (inlined by esbuild) + `node:path`.
 */
import ts from "typescript";
import { relative } from "node:path";

const ATTR = "data-source";

/** Add `data-source` to every JSX opening element lacking one. Pure `string → string`. */
export function stampSource(code: string, relPath: string): string {
  const sf = ts.createSourceFile("stamp.tsx", code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TSX);
  const inserts: { pos: number; text: string }[] = [];
  const escaped = relPath.replace(/"/g, '\\"');

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const has = node.attributes.properties.some(
        (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === ATTR,
      );
      if (!has) {
        const start = node.getStart(sf); // the `<`
        const { line, character } = sf.getLineAndCharacterOfPosition(start);
        // Insert after the last attribute (or the tag name), before `>` / `/>`.
        inserts.push({ pos: node.attributes.end, text: ` ${ATTR}="${escaped}:${line + 1}:${character}"` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (inserts.length === 0) return code;
  // Apply back-to-front so earlier offsets stay valid.
  inserts.sort((a, b) => b.pos - a.pos);
  let out = code;
  for (const ins of inserts) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  return out;
}

/** A minimal Vite-plugin structural type (no `vite` dependency). */
export interface VitePluginLike {
  name: string;
  apply?: "serve" | "build";
  enforce?: "pre" | "post";
  transform?: (code: string, id: string) => { code: string; map: null } | null;
}

/** The dev-only Vite plugin (serve + pre) that stamps the project's own JSX. */
export function vortspecSourceStamp(opts?: { root?: string }): VitePluginLike {
  const root = opts?.root ?? process.cwd();
  return {
    name: "vortspec:source-stamp",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.[jt]sx$/.test(file) || file.includes("/node_modules/")) return null;
      const out = stampSource(code, relative(root, file));
      return out === code ? null : { code: out, map: null };
    },
  };
}
