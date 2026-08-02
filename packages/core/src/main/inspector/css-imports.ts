import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Resolve a token file's `@import` chain (change: design-system-token-editor).
 *
 * A CONSUMED library's token file usually declares almost nothing itself — it `@import`s the vendor's
 * theme (`@import '@astryxdesign/theme-neutral/theme.css';`) and keeps only the project's own overrides.
 * Reading just the entry file therefore found ZERO tokens, so the Tokens tab and the Design System palette
 * were empty and a lever had no live value to show. The same holds for an owned design system split across
 * partials (`@import './primitives.css';`).
 *
 * This flattens the chain into one CSS text in true source order — so the cascade is preserved and the
 * importing file still wins over what it imports — plus the ordered per-file segments (for attributing a
 * token to the file that declares it) and the list of files read (for cache fingerprinting and snapshots).
 *
 * `@import` CONDITIONS (`layer(...)`, `supports(...)`, media queries) are dropped: they scope where a rule
 * applies, not what a custom property's value is, and keeping them would nest declarations under contexts
 * that aren't real token modes.
 */

/** One contiguous run of CSS from a single file, in cascade order. */
export interface CssSegment {
  /** Project-relative path of the file this text came from. */
  file: string;
  /** That file's own CSS for this run (its `@import` statements removed — they became their own segments). */
  text: string;
}

export interface ResolvedCss {
  /** The flattened CSS: every resolvable `@import` inlined where it stood. */
  css: string;
  /** Per-file runs in cascade order (a file appears more than once if it imports mid-file). */
  segments: CssSegment[];
  /** Project-relative paths actually read, entry first, deduped — the scan's real inputs. */
  files: string[];
  /** Specifiers that could not be resolved on disk (informational; they are simply left out). */
  unresolved: string[];
}

/** Backstops so a pathological or cyclic import graph can't stall a scan. */
const MAX_FILES = 50;
const MAX_DEPTH = 8;
const MAX_BYTES = 4_000_000;

/**
 * `@import` in all the forms CSS allows: `@import "x.css";`, `@import url(x.css);`,
 * `@import url("x.css") layer(theme) screen;`. Capture group 2 or 4 is the specifier.
 */
const IMPORT_RE = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)[^;]*;/g;

export async function resolveCssImports(projectPath: string, entryRel: string): Promise<ResolvedCss> {
  const segments: CssSegment[] = [];
  const files: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const budget = { files: MAX_FILES, bytes: MAX_BYTES };

  async function visit(rel: string, depth: number): Promise<void> {
    const abs = join(projectPath, rel);
    if (seen.has(abs) || depth > MAX_DEPTH || budget.files <= 0) return;
    seen.add(abs);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      return;
    }
    budget.files--;
    budget.bytes -= text.length;
    if (budget.bytes < 0) return;
    files.push(rel);

    const dir = dirname(abs);
    let cursor = 0;
    IMPORT_RE.lastIndex = 0;
    for (let m = IMPORT_RE.exec(text); m; m = IMPORT_RE.exec(text)) {
      // Emit the file's own CSS that preceded this @import, then the imported subtree in its place.
      const own = text.slice(cursor, m.index);
      if (own.trim()) segments.push({ file: rel, text: own });
      cursor = m.index + m[0].length;
      const spec = (m[2] ?? m[4] ?? "").trim();
      const target = spec ? await resolveSpecifier(projectPath, dir, spec) : null;
      if (target) await visit(target, depth + 1);
      else if (spec) unresolved.push(spec);
    }
    const tail = text.slice(cursor);
    if (tail.trim()) segments.push({ file: rel, text: tail });
  }

  await visit(entryRel, 0);
  return { css: segments.map((s) => s.text).join("\n"), segments, files, unresolved };
}

/** The project-relative path an `@import` specifier points at, or null when it isn't on disk. */
async function resolveSpecifier(projectPath: string, fromDir: string, spec: string): Promise<string | null> {
  // A protocol-qualified import (http:, data:) is not a file — nothing to read.
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;

  if (spec.startsWith(".") || isAbsolute(spec)) {
    const base = spec.startsWith(".") ? resolve(fromDir, spec) : join(projectPath, spec);
    return firstExisting(projectPath, [base, `${base}.css`]);
  }
  return resolvePackageSpecifier(projectPath, fromDir, spec);
}

/**
 * Resolve a bare specifier (`@astryxdesign/theme-neutral/theme.css`, `tailwindcss`) the way a bundler
 * would: find the package in the nearest `node_modules` at or above the importing file, then map the
 * subpath through the package's `exports` (the Astryx theme is published as `"./theme.css"` →
 * `"./dist/theme.css"`, so the literal path alone would miss), falling back to the literal path and then
 * to the `style`/`main` fields.
 */
async function resolvePackageSpecifier(
  projectPath: string,
  fromDir: string,
  spec: string,
): Promise<string | null> {
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const subpath = spec.slice(pkg.length).replace(/^\//, "");

  for (const dir of nodeModulesDirs(projectPath, fromDir)) {
    const pkgDir = join(dir, pkg);
    const manifest = await readJson(join(pkgDir, "package.json"));
    const candidates: string[] = [];
    if (manifest?.exports !== undefined) {
      const key = subpath ? `./${subpath}` : ".";
      const hit = pickExport(manifest.exports, key);
      if (hit) candidates.push(resolve(pkgDir, hit));
    }
    if (subpath) {
      candidates.push(join(pkgDir, subpath), `${join(pkgDir, subpath)}.css`);
    } else {
      for (const field of ["style", "main"]) {
        const v = manifest?.[field];
        if (typeof v === "string" && v.endsWith(".css")) candidates.push(resolve(pkgDir, v));
      }
      candidates.push(join(pkgDir, "index.css"));
    }
    const found = await firstExisting(projectPath, candidates);
    if (found) return found;
  }
  return null;
}

/** Every `node_modules` from the importing file's directory up to (and including) the project root. */
function nodeModulesDirs(projectPath: string, fromDir: string): string[] {
  const out: string[] = [];
  let dir = fromDir;
  for (let i = 0; i < 20; i++) {
    out.push(join(dir, "node_modules"));
    if (dir === projectPath) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const root = join(projectPath, "node_modules");
  if (!out.includes(root)) out.push(root);
  return out;
}

/** Conditions we honor in an `exports` map, most CSS-specific first. */
const EXPORT_CONDITIONS = ["style", "css", "default", "import", "require"];

/**
 * Look `key` (`.` or `./sub/path`) up in a package's `exports`, resolving condition objects and simple
 * `*` patterns. Returns the package-relative target, or null.
 */
export function pickExport(exports: unknown, key: string): string | null {
  if (typeof exports === "string") return key === "." ? exports : null;
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) return null;
  const map = exports as Record<string, unknown>;
  const isSubpathMap = Object.keys(map).some((k) => k === "." || k.startsWith("./"));
  if (!isSubpathMap) return key === "." ? pickCondition(map) : null;

  if (map[key] !== undefined) return pickCondition(map[key]);
  // Pattern keys (`./*`, `./styles/*.css`) — the longest matching prefix wins, as Node does.
  const patterns = Object.keys(map)
    .filter((k) => k.includes("*"))
    .sort((a, b) => b.length - a.length);
  for (const p of patterns) {
    const [pre, post = ""] = p.split("*");
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) {
      const star = key.slice(pre.length, key.length - post.length || undefined);
      const target = pickCondition(map[p]);
      if (target) return target.replace("*", star);
    }
  }
  return null;
}

/** Collapse a conditions object (or plain string) to a single target path. */
function pickCondition(node: unknown, depth = 0): string | null {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || Array.isArray(node) || depth > 8) return null;
  const map = node as Record<string, unknown>;
  for (const c of EXPORT_CONDITIONS) {
    if (map[c] !== undefined) {
      const hit = pickCondition(map[c], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The first candidate that reads, as a project-relative path. Paths outside the project are refused. */
async function firstExisting(projectPath: string, candidates: string[]): Promise<string | null> {
  for (const abs of candidates) {
    const rel = relative(projectPath, abs);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue; // never escape the project
    try {
      await readFile(abs, "utf8");
      return rel;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** True when a project-relative path lives inside a dependency — never write there. */
export function isDependencyPath(rel: string): boolean {
  return rel.split(/[\\/]/).includes("node_modules");
}

/** Project-relative paths, excluding dependencies — the files a snapshot/revert may legitimately touch. */
export function projectOwnedFiles(files: string[]): string[] {
  return files.filter((f) => !isDependencyPath(f));
}
