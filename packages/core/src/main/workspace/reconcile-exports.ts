import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { readProjectConfig } from "./config-manager";
import { parseModuleExports, reconcileImports, type ModuleExports } from "./export-reconciler";

/**
 * Filesystem runner for the export reconciler (change: styling-foundation-gate).
 *
 * Walks the project's component sources and repairs single-specifier relative imports
 * (stories + cross-component) to match each target module's actual exports, so mixed
 * default/named conventions don't fail the Storybook build with MISSING_EXPORT. Pure
 * matching logic lives in `export-reconciler.ts`; this only supplies filesystem I/O.
 * Idempotent: a project with consistent exports is left unchanged.
 */

const SRC_EXT = /\.(tsx?|jsx?)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "storybook-static", ".next"]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".storybook") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...(await walk(p)));
    } else if (SRC_EXT.test(e.name)) out.push(p);
  }
  return out;
}

export interface ReconcileSummary {
  filesChanged: number;
  changes: { file: string; detail: string }[];
}

/**
 * Reconcile export/import shapes across the project's `component_dir` (falling back to
 * `src`). Returns the files changed and a per-change description. Best-effort.
 */
export async function reconcileProjectExports(projectPath: string): Promise<ReconcileSummary> {
  const config = await readProjectConfig(projectPath);
  const rootRel = config?.componentDir && existsSync(join(projectPath, config.componentDir))
    ? config.componentDir
    : "src";
  const root = join(projectPath, rootRel);
  const files = await walk(root);

  const exportCache = new Map<string, ModuleExports | null>();
  async function exportsFor(absPath: string): Promise<ModuleExports | null> {
    if (exportCache.has(absPath)) return exportCache.get(absPath) ?? null;
    let res: ModuleExports | null = null;
    try {
      res = parseModuleExports(await readFile(absPath, "utf8"));
    } catch {
      res = null;
    }
    exportCache.set(absPath, res);
    return res;
  }

  const summary: ReconcileSummary = { filesChanged: 0, changes: [] };
  for (const file of files) {
    let src: string;
    try {
      src = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // Pre-resolve every relative single-specifier import target's exports (async),
    // then run the pure reconciler with a synchronous lookup over that map.
    const resolved = new Map<string, ModuleExports | null>();
    const relRe = /import\s+(?:\{\s*[A-Za-z0-9_]+\s*\}|[A-Za-z0-9_]+)\s+from\s+["'](\.[^"']+)["']/g;
    for (const m of src.matchAll(relRe)) {
      const rel = m[1];
      if (resolved.has(rel)) continue;
      const target = resolveModule(dirname(file), rel);
      resolved.set(rel, target ? await exportsFor(target) : null);
    }
    const { code, changes } = reconcileImports(src, (rel) => resolved.get(rel) ?? null);
    if (changes.length) {
      await writeFile(file, code, "utf8").catch(() => undefined);
      summary.filesChanged += 1;
      for (const c of changes) summary.changes.push({ file, detail: c.detail });
    }
  }
  return summary;
}

/** Resolve a relative import specifier to an on-disk module file. */
function resolveModule(fromDir: string, rel: string): string | null {
  const base = join(fromDir, rel);
  for (const c of [
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(c)) return c;
  }
  return null;
}
