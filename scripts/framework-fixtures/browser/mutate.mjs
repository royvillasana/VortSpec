/**
 * Mutation driver for the browser fixture — isolated, same protocol as vue/astro `mutate.mjs`.
 *
 * WHY THIS EXISTS: the EVIDENCE.md table was applied BY HAND and said so. Thor blocked on it
 * twice, and he was right both times — a disclosed unreproducible claim is still unreproducible.
 * "Someone ran these four rows once on their machine" is exactly the durability problem this whole
 * fixture set was built to remove, so the table that vouches for the fixture cannot itself be the
 * one artifact nobody can re-run.
 *
 * ISOLATION, copied from astro/mutate.mjs rather than reinvented: the canonical files are opened
 * READ-ONLY and never written. Each row copies the fixture into its own `mkdtemp`, mutates the
 * COPY, runs it, and removes it. That driver's own history is the argument — mutating in place
 * left two resident mutants in the canonical fixture and produced a table that looked complete.
 *
 * TWO KINDS OF MUTANT, deliberately mixed:
 *   - SUBJECT mutants change the CSS (the defect itself), asking "would the harness notice if the
 *     bug were fixed or moved?"
 *   - INSTRUMENT mutants change `bg()` (the measurement), asking "is the harness reading the
 *     browser at all, or reporting a constant?" A fixture that only ever mutates its subject
 *     cannot catch a measurement that stopped measuring.
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEST = 'test/rendered-token.test.js';
const CSS = 'src/accordion.css';

/** Read once, never written. */
const SOURCES = {
  [TEST]: readFileSync(join(ROOT, TEST), 'utf8'),
  [CSS]: readFileSync(join(ROOT, CSS), 'utf8'),
};

const BG = 'const bg = (el) => getComputedStyle(el).backgroundColor;';
const AS_BUILT = '.header-as-built {\n  background-color: var(--color-neutral-100);\n}';
const B3_PAINT = "    const painted = bg(render('header-missing-token'));";

const MUTANTS = [
  // SUBJECT: the defect is repaired. B1 asserts the wrong colour is painted and B2 asserts the two
  // differ, so both must go red — if they do not, they were never reading the CSS.
  ['point as-built at the correct token', CSS, AS_BUILT,
    '.header-as-built {\n  background-color: var(--component-accordion-active-item-header-background);\n}'],

  // INSTRUMENT: the measurement returns the Figma value regardless of what the browser painted.
  ['bg() always returns the Figma spec', TEST, BG, "const bg = () => 'rgb(206, 228, 233)';"],

  // INSTRUMENT, other polarity: always the wrong global. B0 is the case that exists to catch this.
  ['bg() always returns the wrong global', TEST, BG, "const bg = () => 'rgb(248, 249, 250)';"],

  // The B3 silence assertion. Without this row, "expected silence" could be a matcher that cannot
  // fire — which is precisely the defect Thor found in B3's first version, where the comment
  // claimed silence and the assertion only checked paint.
  ['emit one console.error during B3', TEST, B3_PAINT,
    "    console.error('synthetic mutant error');\n" + B3_PAINT],
];

/** A missing anchor means the row silently never applied, so the table would lie. Fail loudly. */
for (const [label, file, from] of MUTANTS) {
  if (!SOURCES[file].includes(from)) {
    console.error(`FATAL: anchor missing for "${label}" in ${file}.`);
    console.error('The mutation could not be applied, so any table printed would be incomplete');
    console.error('while looking complete. Update the anchor to match the source and re-run.');
    process.exit(1);
  }
}

/** Chromium launch is the slow part; MUTATE_ONLY=<n> runs the first n rows for a cheap protocol check. */
const N = Number(process.env.MUTATE_ONLY ?? MUTANTS.length);
const SELECTED = MUTANTS.slice(0, N);

function runIn(dir) {
  const r = spawnSync('npx', ['web-test-runner', '--config', 'web-test-runner.config.mjs'],
    { cwd: dir, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // Which named cases failed — the identity of the catch, not just a count. A row that reports
  // "something failed" cannot distinguish the harness catching the mutant from the harness
  // crashing for an unrelated reason.
  //
  // The anchor is `> B1:` because @web/test-runner prints the failure as
  // `❌ <suite name> > B1: <case name>` — the case id is NOT at line start. My first version
  // anchored at line start and matched nothing, so every row printed `caught: []` while the exit
  // codes were correct. A column that can never populate, in the driver written to prove that
  // matchers fire. Taken from real captured output rather than guessed a second time.
  const caught = [...out.matchAll(/>\s*(B\d):/g)].map((m) => m[1]);
  return { status: r.status, caught: [...new Set(caught)].sort(), out };
}

const rows = [];
for (const [label, file, from, to] of SELECTED) {
  const dir = mkdtempSync(join(tmpdir(), 'browser-mutate-'));
  try {
    for (const f of ['package.json', 'web-test-runner.config.mjs']) cpSync(join(ROOT, f), join(dir, f));
    cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(ROOT, 'test'), join(dir, 'test'), { recursive: true });
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, file), SOURCES[file].replace(from, to));
    const r = runIn(dir);
    rows.push({ label, ...r });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('Mutant', 42)} exit  caught`);
for (const r of rows) console.log(`${pad(r.label, 42)} ${pad(r.status, 5)} [${r.caught.join(' ')}]`);

if (SELECTED.length < MUTANTS.length) {
  console.log(`\n*** PARTIAL: ${SELECTED.length} of ${MUTANTS.length} rows. NOT the full sweep. ***`);
}

// The canonical fixture, untouched by this driver. Every row above is a rejection; without this
// the driver could not tell "catches mutants" from "always red".
const canonicalDir = mkdtempSync(join(tmpdir(), 'browser-canonical-'));
let canonical;
try {
  for (const f of ['package.json', 'web-test-runner.config.mjs']) cpSync(join(ROOT, f), join(canonicalDir, f));
  cpSync(join(ROOT, 'src'), join(canonicalDir, 'src'), { recursive: true });
  cpSync(join(ROOT, 'test'), join(canonicalDir, 'test'), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(canonicalDir, 'node_modules'), 'dir');
  canonical = runIn(canonicalDir);
} finally {
  rmSync(canonicalDir, { recursive: true, force: true });
}
console.log(`\n${pad('CANONICAL (unmutated)', 42)} ${pad(canonical.status, 5)} [${canonical.caught.join(' ')}]`);

const survivors = rows.filter((r) => r.status === 0);
if (survivors.length > 0) {
  console.error(`\n${survivors.length} mutant(s) SURVIVED — the harness cannot detect them:`);
  for (const r of survivors) console.error(`  - ${r.label}`);
}
process.exit(survivors.length === 0 && canonical.status === 0 ? 0 : 1);
