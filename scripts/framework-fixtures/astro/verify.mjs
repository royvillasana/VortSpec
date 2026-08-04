/**
 * Astro framework fixture — repeatable, self-asserting.
 *
 * THE MATCHER WAS ESTABLISHED BEFORE IT WAS WRITTEN, not after.
 *
 * `astro check` emits `error ts(2339):` — lowercase, parenthesised. It does NOT emit `TS2339`.
 * The `failedWith(run, "TS####")` shape shared by the Vue, Angular and Nuxt fixtures could
 * therefore never match here, and every declared failure would have degraded silently to
 * "exited non-zero" — which is the exact defect V10 exists to catch, arriving through the
 * matcher instead of through the predicate.
 *
 * That is now three of five tools where "non-zero means type errors" or "codes look like TS####"
 * is false: `svelte-check` emits no numeric codes at all, `nuxi typecheck` exits non-zero with no
 * TS diagnostic when a tsconfig is missing, and `astro check` uses a different code format.
 * Assuming the shape is no longer defensible; it has been wrong more often than right.
 *
 * Run: node verify.mjs -> non-zero if any case does not behave as declared.
 */
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const results = [];

/** `artifact` is REQUIRED — a case that cannot show its evidence is a crash, not a boolean. */
function record(id, what, ok, detail, artifact) {
  if (typeof artifact !== 'string' || artifact.length === 0) {
    throw new Error(`case ${id} recorded without an artifact — every case must show its evidence`);
  }
  results.push({ id, what, ok, detail, artifact });
}

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

/** Measurement 1. Asserted true by some cases and false by others, so a constant fails. */
function checkedClean(run) {
  return run.status === 0;
}

/**
 * Measurement 2. A declared failure must be THE declared failure.
 * Note the format: `error ts(2339):` — established by running the tool, not assumed.
 * Asserted FALSE by A6-unrelated, which fails for a different reason entirely.
 */
function failedWith(run, code) {
  return run.status !== 0 && new RegExp(`error ts\\(${code}\\):`).test(stripAnsi(run.out));
}

/** Measurement 3. How many files the checker actually looked at — the coverage question. */
function filesChecked(run) {
  const m = /Result \((\d+) files?\)/.exec(stripAnsi(run.out));
  return m ? Number(m[1]) : -1;
}

const BADGE_OK = `---
interface Props { count: number }
const { count } = Astro.props;
---
<span>{count}</span>
`;

const BADGE_FRONTMATTER_ERROR = `---
interface Props { count: number }
const { count } = Astro.props;
const bad: string = count.toUpperCase();
---
<span>{bad}</span>
`;

const PAGE_OK = `---
import Badge from '../components/Badge.astro';
---
<html><body><Badge count={3} /></body></html>
`;

const PAGE_BAD_PROP = `---
import Badge from '../components/Badge.astro';
---
<html><body><Badge count="definitely not a number" /></body></html>
`;

const PAGE_MISSING_IMPORT = `---
import Badge from '../components/DoesNotExist.astro';
---
<html><body><Badge count={3} /></body></html>
`;

const UTIL_OK = 'export const fmt = (n: number): string => String(n);\n';
const UTIL_ERROR = 'export const fmt = (n: number): string => n.toUpperCase();\n';

const TSCONFIG = JSON.stringify(
  { extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist'] },
  null,
  2,
);

/**
 * A throwaway Astro project reusing this fixture's installed toolchain.
 * `tsconfig: false` omits tsconfig.json entirely — that is a real project shape, not a mutation.
 */
function project({ badge = BADGE_OK, page = PAGE_OK, util = UTIL_OK, tsconfig = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'astro-case-'));
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  mkdirSync(join(dir, 'src/components'), { recursive: true });
  mkdirSync(join(dir, 'src/pages'), { recursive: true });
  mkdirSync(join(dir, 'src/utils'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ "name": "case", "private": true, "type": "module" }\n');
  writeFileSync(join(dir, 'astro.config.mjs'), "import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n");
  if (tsconfig) writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(dir, 'src/components/Badge.astro'), badge);
  writeFileSync(join(dir, 'src/pages/index.astro'), page);
  writeFileSync(join(dir, 'src/utils/format.ts'), util);
  return dir;
}

function run(dir, bin, args) {
  const r = spawnSync('npx', [bin, ...args], { cwd: dir, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { status: r.status ?? -1, out: out || '(no output)' };
}

const sync = (dir) => run(dir, 'astro', ['sync']);
const check = (dir) => run(dir, 'astro', ['check']);

function withProject(opts, fn) {
  const dir = project(opts);
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A0 — not always-red. Also the case that catches a broken FIXTURE rather than a broken tool:
// Honey's SK0 caught two of their own misconfigurations inside ten minutes this way.
withProject({}, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A0-clean', 'a clean synced project checks clean', checkedClean(r) && filesChecked(r) === 5,
    `exit=${r.status} files=${filesChecked(r)}`, r.out);
});

// A1 — not always-green, and the case that fixed the matcher.
withProject({ badge: BADGE_FRONTMATTER_ERROR }, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A1-frontmatter', 'a type error in the frontmatter is reported as ts(2339)',
    failedWith(r, 2339), `exit=${r.status}`, r.out);
});

// A2 — the profile's stated reason, with the Vue trap avoided.
// A real `.ts` is present, so tsc cannot exit non-zero on TS18003 "No inputs were found" and be
// mistaken for evidence that it parsed anything.
withProject({ badge: BADGE_FRONTMATTER_ERROR }, (dir) => {
  sync(dir);
  const byTsc = run(dir, 'tsc', ['--noEmit']);
  record('A2-tsc-blind', 'plain tsc exits CLEAN while the .astro error goes unreported',
    checkedClean(byTsc), `exit=${byTsc.status}`, byTsc.out);
});

// A3 — the sync pair. Nuxt self-prepares, SvelteKit does not; Astro is the third instance.
withProject({}, (dir) => {
  sync(dir);
  rmSync(join(dir, '.astro'), { recursive: true, force: true });
  const absent = !existsSync(join(dir, '.astro'));
  const r = check(dir);
  const regenerated = existsSync(join(dir, '.astro/types.d.ts'));
  record('A3-selfprepare', 'with .astro/ DELETED, astro check regenerates it and still checks clean',
    absent && checkedClean(r) && regenerated, `exit=${r.status} regenerated=${regenerated}`, r.out);
});

// A4 — the cross-component hand-off. Angular failed this; Vue passed it.
withProject({ page: PAGE_BAD_PROP }, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A4-prop', 'a wrong-typed prop parent -> child is caught as ts(2322)',
    failedWith(r, 2322), `exit=${r.status}`, r.out);
});

// A5 — THE FINDING. Without tsconfig.json, `astro check` silently narrows its own scope.
// The same project, the same error, the same command: reported with a tsconfig, invisible
// without one. Not a crash and not a warning — a clean exit over 2 files instead of 5.
withProject({ util: UTIL_ERROR }, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A5-ts-with-tsconfig', 'an error in a .ts file IS reported when tsconfig.json exists',
    failedWith(r, 2339) && filesChecked(r) === 5, `exit=${r.status} files=${filesChecked(r)}`, r.out);
});

withProject({ util: UTIL_ERROR, tsconfig: false }, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A5-ts-no-tsconfig', 'the SAME error is NOT reported without tsconfig.json — 2 files, exit 0',
    checkedClean(r) && filesChecked(r) === 2, `exit=${r.status} files=${filesChecked(r)}`, r.out);
});

// A6 — the false polarity for `failedWith`. A different failure must not satisfy a declared one.
// Without this single case, an always-true failedWith passes every failure case above.
withProject({ page: PAGE_MISSING_IMPORT }, (dir) => {
  sync(dir);
  const r = check(dir);
  record('A6-unrelated', 'a missing import fails, but is NOT the declared ts(2322)',
    !checkedClean(r) && !failedWith(r, 2322), `exit=${r.status}`, r.out);
});

// ── report ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(20)} ${r.what}  [${r.detail}]`);
  if (!r.ok) console.log(`      ── artifact ──\n${stripAnsi(r.artifact).split('\n').map((l) => '      ' + l).join('\n')}`);
}
console.log(`\n${results.length - failed}/${results.length} cases behaved as declared.`);
process.exit(failed === 0 ? 0 : 1);
