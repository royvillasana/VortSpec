import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

/**
 * A schema that can validate a cached payload — structurally just `safeParse`, so any
 * Zod schema whose OUTPUT is `T` qualifies (schemas with `.default()` have a different
 * input type, which `ZodType<T>` would reject).
 */
interface PayloadSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/**
 * Persistent scan cache (Plan B2). VortSpec's inspector readers (tokens, components,
 * routes) re-derive their result from disk on every Playground open. This wraps a
 * `compute()` in an mtime/size fingerprint of its INPUT files: when nothing the result
 * depends on has changed since the cached run, the stored payload at
 * `.vortspec/index/<key>.json` is returned without re-reading and re-parsing anything.
 *
 * The cache is derived, never authoritative: it stores only what `compute()` produces,
 * is keyed by a hash of the inputs, and a schema mismatch (after a code change) or any
 * input change is a miss that recomputes — so it can always be deleted safely.
 */

/** Cache envelope version — bump to invalidate every cache after a format change. Also
 * makes a foreign cache file (e.g. shipped in a cloned repo) fail the check and recompute. */
const CACHE_VERSION = 1;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".turbo", "coverage", ".vortspec"]);
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".vue", ".svelte", ".astro", ".json", ".yaml", ".yml"]);
const MAX_WALK = 6000;

/** The inputs whose content determines a scan's result (project-relative paths). */
export interface ScanInput {
  /** Explicit files (config, token file, `.vortspec/*` caches). */
  files?: string[];
  /** Directories walked for source content (e.g. the component dir). */
  dirs?: string[];
  /** Any extra discriminator that isn't a file (e.g. a preferred-collection arg). */
  extra?: string;
}

async function fileSig(abs: string): Promise<string> {
  try {
    const s = await stat(abs);
    return `${Math.round(s.mtimeMs)}:${s.size}`;
  } catch {
    return "0"; // absent — its absence is itself part of the fingerprint
  }
}

async function walkSigs(root: string, rel: string, out: string[], budget: { n: number }): Promise<void> {
  if (budget.n <= 0) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (budget.n <= 0) break;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    // Every entry (dir OR file) costs budget, so a tree of millions of empty/nested
    // directories can't walk forever — the cap engages regardless of match count.
    budget.n--;
    const abs = join(root, e.name);
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      await walkSigs(abs, childRel, out, budget);
    } else if (SOURCE_EXTS.has(e.name.slice(e.name.lastIndexOf(".")))) {
      out.push(`${childRel}=${await fileSig(abs)}`);
    }
  }
}

/** A stable hash of every input's mtime+size — changes iff an input changed. */
async function fingerprint(projectPath: string, input: ScanInput): Promise<string> {
  const parts: string[] = [];
  for (const f of input.files ?? []) parts.push(`f:${f}=${await fileSig(join(projectPath, f))}`);
  for (const d of input.dirs ?? []) {
    const dirOut: string[] = [];
    await walkSigs(join(projectPath, d), d, dirOut, { n: MAX_WALK });
    parts.push(...dirOut);
  }
  if (input.extra) parts.push(`x:${input.extra}`);
  parts.sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex");
}

/** Sanitize a cache key into a safe filename segment. */
function safeKey(key: string): string {
  return key.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "scan";
}

/**
 * Return the cached result when the inputs are unchanged, else run `compute()` and
 * cache it. `schema` (when given) validates the cached payload — a mismatch is treated
 * as a miss, so a format change after a code update self-heals instead of returning stale data.
 */
export async function cachedScan<T>(
  projectPath: string,
  key: string,
  input: ScanInput,
  compute: () => Promise<T>,
  schema?: PayloadSchema<T>,
): Promise<T> {
  const fp = await fingerprint(projectPath, input);
  const cachePath = join(projectPath, ".vortspec/index", `${safeKey(key)}.json`);
  try {
    const raw = JSON.parse(await readFile(cachePath, "utf8"));
    if (raw && raw.v === CACHE_VERSION && raw.fingerprint === fp) {
      if (!schema) return raw.payload as T;
      const parsed = schema.safeParse(raw.payload);
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* no cache / unreadable / wrong version → recompute */
  }
  const payload = await compute();
  await mkdir(dirname(cachePath), { recursive: true }).catch(() => undefined);
  await writeFile(cachePath, `${JSON.stringify({ v: CACHE_VERSION, fingerprint: fp, payload }, null, 2)}\n`, "utf8").catch(() => undefined);
  return payload;
}
