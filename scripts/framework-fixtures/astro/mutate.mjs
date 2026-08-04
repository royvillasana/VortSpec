/**
 * Mutation driver — isolated.
 *
 * WRONG v1: back up verify.mjs to a fixed `.verify.bak`, mutate it in place, restore afterwards.
 * ACTUAL: two overlapping invocations collided. The second read a source the first had already
 *   mutated, reported ANCHOR MISSING, and then "restored" from a backup that was itself
 *   poisoned. It left TWO resident mutants in the canonical fixture — V10's source AND
 *   `hasAttr` stuck at `return false`, a permanently dead measurement — and neither run
 *   produced a complete table. Shared mutable state with no isolation, in the durable artifact
 *   built to prove the harness was sound.
 * RIGHT: never write to the canonical file at all. Each invocation copies the whole fixture
 *   directory into its own `mkdtemp`, mutates the COPY, and removes it. Canonical `verify.mjs`
 *   is opened read-only. Concurrent invocations cannot interact.
 *
 * A missing anchor is now a FATAL error, not a warning. The old behaviour printed a warning and
 * carried on, which yields a table that looks complete for a mutation that never applied — the
 * same "reports green, proves nothing" shape this driver exists to detect.
 *
 * The table is printed only after every row has completed. A partial table is not a result.
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CANONICAL = join(ROOT, 'verify.mjs');
const SOURCE = readFileSync(CANONICAL, 'utf8'); // read once, never written

const CHECKED_CLEAN = '  return run.status === 0;';
const FAILED_WITH = "  return run.status !== 0 && new RegExp(`error ts\\\\(${code}\\\\):`).test(stripAnsi(run.out));";
const FILES = "  const m = /Result \\((\\d+) files?\\)/.exec(stripAnsi(run.out));";
const STRIP = "const stripAnsi = (s) => s.replace(/\\u001b\\[[0-9;]*[A-Za-z]/g, '');";
const A5_NO_TSCONFIG = "  rmSync(join(dir, 'tsconfig.json'));";

const MUTANTS = [
  ['checkedClean -> always true', CHECKED_CLEAN, '  return true;'],
  ['checkedClean -> always false', CHECKED_CLEAN, '  return false;'],
  ['failedWith -> exit-code only (drop the ts() match)', FAILED_WITH, '  return run.status !== 0;'],
  ['failedWith -> UPPERCASE TS#### (the shape that cannot fire)', FAILED_WITH,
    "  return run.status !== 0 && new RegExp(`TS${code}`).test(stripAnsi(run.out));"],
  ['failedWith -> always true', FAILED_WITH, '  return true;'],
  ['failedWith -> always false', FAILED_WITH, '  return false;'],
  ['filesChecked -> always 5 (hide the scope narrowing)', FILES, '  const m = [null, "5"];'],
  ['stripAnsi -> identity', STRIP, 'const stripAnsi = (s) => s;'],
  ['A7: declare a CARET instead of an exact pin', '"astro": "5.14.1"', '"astro": "^5.14.1"', 'package.json'],
  ['A5: stop deleting the tsconfig (erase the finding)', A5_NO_TSCONFIG,
    "  // tsconfig deliberately NOT removed"],
];

/** Fail loudly and immediately: an anchor that no longer matches means the table would lie. */
for (const [label, from, , target = 'verify.mjs'] of MUTANTS) {
  if (!readFileSync(join(ROOT, target), 'utf8').includes(from)) {
    console.error(`FATAL: anchor missing for "${label}".`);
    console.error('The mutation could not be applied, so any table printed would be incomplete');
    console.error('while looking complete. Update the anchor to match verify.mjs and re-run.');
    process.exit(1);
  }
}

// A full sweep runs the compiler ~13 times and takes minutes. MUTATE_ONLY=<n> runs the first n
// rows — used to prove the WRITE PROTOCOL cheaply (e.g. against a read-only canonical) without
// re-running the whole matrix. It never changes how a row is measured, only how many run, and
// the printed table says so, because a 1-row table must not be mistaken for the full sweep.
// MUTATE_ROWS=<a>-<b> runs an inclusive 1-based slice; MUTATE_ONLY=<n> the first n.
// A slice exists because one uninterrupted sweep exceeds a 10-minute command ceiling, and a
// killed sweep produces NOTHING -- worse than a partial that admits what it covered.
function selection() {
  const rows = process.env.MUTATE_ROWS;
  if (rows) {
    const m = /^(\d+)-(\d+)$/.exec(rows.trim());
    if (!m) { console.error(`FATAL: MUTATE_ROWS must look like "3-7", got "${rows}"`); process.exit(1); }
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a < 1 || b > MUTANTS.length || a > b) {
      console.error(`FATAL: MUTATE_ROWS ${a}-${b} outside 1-${MUTANTS.length}`); process.exit(1);
    }
    return { rows: MUTANTS.slice(a - 1, b), label: `rows ${a}-${b}` };
  }
  const n = Number(process.env.MUTATE_ONLY ?? MUTANTS.length);
  return { rows: MUTANTS.slice(0, n), label: `rows 1-${Math.min(n, MUTANTS.length)}` };
}
const { rows: SELECTED, label: RANGE } = selection();

const rows = [];
for (const [label, from, to, target = 'verify.mjs'] of SELECTED) {
  const dir = mkdtempSync(join(tmpdir(), 'astro-mutate-'));
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
    for (const f of ['verify.mjs', 'package.json']) {
      const body = readFileSync(join(ROOT, f), 'utf8');
      writeFileSync(join(dir, f), f === target ? body.replace(from, to) : body);
    }
    const r = spawnSync('node', ['verify.mjs'], { cwd: dir, encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    rows.push({
      label,
      status: r.status,
      score: /(\d+\/\d+) cases behaved/.exec(out)?.[1] ?? 'THREW',
      failed: [...out.matchAll(/^FAIL {2}(\S+)/gm)].map((m) => m[1]),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Only now, with every row complete, is there a table worth printing.
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('Mutant', 48)} exit  score   caught`);
for (const r of rows) {
  console.log(`${pad(r.label, 48)} ${pad(r.status, 5)} ${pad(r.score, 7)} [${r.failed.join(' ')}]`);
}

if (SELECTED.length < MUTANTS.length) {
  console.log(`\n*** PARTIAL: ${RANGE} -- ${SELECTED.length} of ${MUTANTS.length} rows. NOT the full sweep. ***`);
}

const survivors = rows.filter((r) => r.status === 0);
const restored = spawnSync('node', ['verify.mjs'], { cwd: ROOT, encoding: 'utf8' });
const restoredScore = /(\d+\/\d+) cases behaved/.exec(restored.stdout ?? '')?.[1] ?? 'THREW';
console.log(`\n${pad('CANONICAL (untouched by this driver)', 48)} ${pad(restored.status, 5)} ${restoredScore}`);

if (survivors.length > 0) {
  console.error(`\n${survivors.length} mutant(s) SURVIVED — the harness cannot detect them:`);
  for (const r of survivors) console.error(`  - ${r.label}`);
}
process.exit(survivors.length === 0 && restored.status === 0 ? 0 : 1);
