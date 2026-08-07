#!/usr/bin/env node
/**
 * CI gate for the design-system relationship index — OpenSpec change:
 * agentic-design-system, task 2.9.
 *
 * A STALE index is worse than no index. Every reader — the grounded-run digest, the token reverse
 * index, the adoption report — treats it as authoritative, so a component added after the last
 * build reads as "does not exist" and an agent will confidently create a duplicate. That is the
 * false negative the §1.6 benchmark measures, arriving through the back door, and nothing about a
 * stale artifact LOOKS wrong.
 *
 * Exit 1 only when the index EXISTS and is out of date. An ABSENT index passes: a project that has
 * not opted in has nothing to be out of date with, and failing there would make every repo without
 * one red for a reason its authors never chose.
 *
 * SELF-CONTAINED on purpose. `@vortspec/core` exports TypeScript source and the repo has no TS
 * runner at its root, so importing `indexStaleness` here would mean adding a build step to a check
 * whose whole value is being cheap enough to run on every push. The logic it duplicates is a
 * `generatedAt` read and an mtime comparison; `relationship-index.test.ts` spawns this script and
 * asserts it agrees with `checkIndexFreshness`, so the two cannot drift apart silently.
 *
 *   node scripts/check-index-freshness.mjs [projectPath]
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const SKIP = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo", "coverage", ".vortspec", ".sdd-de",
]);
const SOURCE_EXTS = [".svelte", ".astro", ".html", ".tsx", ".jsx", ".vue", ".ts", ".js"];
const NAMES_SHOWN = 10;

const projectPath = process.argv[2] ?? process.cwd();

const raw = await readFile(join(projectPath, ".vortspec/ai/index.toon"), "utf8").catch(() => null);
if (raw === null) {
  console.log("No design-system index has been built yet (.vortspec/ai/index.toon is absent).");
  process.exit(0);
}

const generatedAt = raw.match(/^generatedAt: (.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const stamp = generatedAt ? Date.parse(generatedAt) : NaN;
if (!generatedAt || Number.isNaN(stamp)) {
  console.log("The design-system index has no readable generatedAt stamp — rebuild it.");
  process.exit(1);
}

/** Files whose mtime is newer than the stamp. Floored to ms: an ISO stamp has no finer precision,
 *  so a file written at …991.4ms must not read as newer than an index stamped …991. */
const changed = [];
async function walk(relative, depth) {
  if (depth > 12) return;
  let entries;
  try {
    entries = await readdir(join(projectPath, relative), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const here = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(here, depth + 1);
    else if (SOURCE_EXTS.some((extension) => entry.name.endsWith(extension))) {
      const info = await stat(join(projectPath, here)).catch(() => null);
      if (info && Math.floor(info.mtimeMs) > stamp) changed.push({ path: here, mtime: info.mtimeMs });
    }
  }
}
await walk("src", 0);

if (changed.length === 0) {
  console.log(`The design-system index is current (generated ${generatedAt}).`);
  process.exit(0);
}

changed.sort((a, b) => b.mtime - a.mtime);
const names = changed.slice(0, NAMES_SHOWN).map((entry) => entry.path);
const rest = changed.length - names.length;
// NAMED, because "the index is stale" is not actionable and "these four components changed" is.
console.log(
  `The design-system index is stale: ${changed.length} file${changed.length === 1 ? "" : "s"} changed since ${generatedAt}` +
    ` (${names.join(", ")}${rest > 0 ? `, +${rest} more` : ""}).` +
    " Rebuild it so a run does not read a component that no longer matches its source.",
);
process.exit(1);
