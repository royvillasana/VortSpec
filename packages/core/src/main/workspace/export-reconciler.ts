/**
 * Export-convention reconciler (change: styling-foundation-gate).
 *
 * Generated components mix `export default` and named exports, and the generated
 * stories + sibling-component imports guess the wrong shape (`icon.tsx` exports
 * default but is imported as `{ Icon }`; `button.tsx` exports default but is imported
 * as `{ Button }`). Storybook then fails with MISSING_EXPORT. This repairs a single
 * source file's SINGLE-specifier relative imports to match each target module's actual
 * exports, switching between named and default form. It is deliberately conservative:
 * bare, namespace, and multi-name imports are never touched, and a name is only
 * rewritten when it is the target's export in the OPPOSITE form.
 *
 * Pure: the caller supplies each module's exports (resolved from disk) via `lookup`,
 * so the logic is unit-testable without a filesystem.
 */

export interface ModuleExports {
  /** The default export's local name, if any (e.g. `export default Icon`). */
  default: string | null;
  /** The set of named exports. */
  named: Set<string>;
}

/** Extract the export shape from a module's source text. */
export function parseModuleExports(src: string): ModuleExports {
  const def = src.match(/export\s+default\s+(?:function\s+|class\s+)?([A-Za-z0-9_]+)/);
  const named = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g))
    named.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g))
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && name !== "default") named.add(name);
    }
  return { default: def ? def[1] : null, named };
}

export interface ReconcileChange {
  /** The relative specifier whose import was rewritten. */
  from: string;
  /** Human description of the fix. */
  detail: string;
}

/**
 * Rewrite `src`'s single-specifier relative imports to match the resolved target's
 * export shape. `lookup(rel)` returns the target module's exports, or null when it
 * cannot be resolved (in which case the import is left untouched). Returns the new
 * source and the list of changes (empty when nothing changed).
 */
export function reconcileImports(
  src: string,
  lookup: (rel: string) => ModuleExports | null,
): { code: string; changes: ReconcileChange[] } {
  const changes: ReconcileChange[] = [];
  const re =
    /^import\s+(?:\{\s*([A-Za-z0-9_]+)\s*\}|([A-Za-z0-9_]+))\s+from\s+(["'])(\.[^"']+)\3;?[ \t]*$/gm;
  const code = src.replace(re, (full, named, def, q, rel) => {
    const exp = lookup(rel);
    if (!exp) return full;
    const local = named || def;
    const isNamed = exp.named.has(local);
    const isDefault = exp.default === local;
    if (named && !isNamed && isDefault) {
      changes.push({ from: rel, detail: `{ ${local} } → ${local} (default)` });
      return `import ${local} from ${q}${rel}${q};`;
    }
    if (def && !isDefault && isNamed) {
      changes.push({ from: rel, detail: `${local} → { ${local} } (named)` });
      return `import { ${local} } from ${q}${rel}${q};`;
    }
    return full;
  });
  return { code, changes };
}
