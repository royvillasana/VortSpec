// Nuxt profile fixture — tests the CLAIMS in framework-profiles.ts `nuxt`, by compiling.
//
// Claims under test, quoted from the profile:
//   (a) typecheckCmd: "npx nuxi typecheck"
//   (b) "NOT plain `vue-tsc`: Nuxt generates `.nuxt/` types for auto-imports, routes and
//        composables, so a bare vue-tsc run reports errors on code that is actually fine"
//   (c) idioms.pitfalls: "`tsc` cannot parse `.vue` — the check is `vue-tsc`."
//
// Measurement discipline carried from Bumble's Vue fixture:
//   - a declared failure must produce its SPECIFIC diagnostic, not merely a non-zero exit
//     (`vue-tsc` exits 2, not 1 — any `status === 1` check passes everything)
//   - ANSI escapes are removed inside the predicate, not by weakening the pattern
//   - at least one case must require a measurement to come back FALSE, or an always-true
//     mutant passes the whole matrix
import { spawnSync } from 'node:child_process';
import { writeFileSync, renameSync, existsSync } from 'node:fs';

const ESC = String.fromCharCode(27);
const stripAnsi = (s) => s.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '');
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: process.cwd(), timeout: 300000 });
  return { status: r.status, out: stripAnsi((r.stdout || '') + (r.stderr || '')) };
};
/** Requires the SPECIFIC diagnostic. Exit code alone is not a measurement. */
const failedWith = (r, code) => r.status !== 0 && new RegExp('\\b' + code + '\\b').test(r.out);
/** The false polarity: nothing reported and a zero exit. */
// A real diagnostic, not the word 'error' anywhere. TypeScript's own hint —
// "…make compiler errors easier to read" — contains it, so the loose test called a
// CLEAN run dirty and handed N4 a PASS it had not earned. Require TSxxxx or 'error TS'.
const DIAG = /error TS\d+|\bTS\d{4,5}\b/;
const compiledClean = (r) => r.status === 0 && !DIAG.test(r.out);

const results = [];
const check = (id, label, pass, detail) => {
  results.push({ id, pass, label });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(22)} ${label}`);
  if (detail) console.log(`        ${detail}`);
};

const hide = (p) => { if (existsSync(p)) renameSync(p, p + '.off'); };
const show = (p) => { if (existsSync(p + '.off')) renameSync(p + '.off', p); };

console.log('=== N0: baseline — the clean project must COMPILE CLEAN (false polarity) ===');
hide('components/BadTypeBadge.vue');
const n0 = run('npx', ['nuxi', 'typecheck']);
check('N0-clean', 'nuxi typecheck on the clean project exits 0 with no error',
  compiledClean(n0), `exit=${n0.status}`);

console.log('\n=== N3: auto-import — <CleanBadge> used with NO import statement ===');
check('N3-autoimport', 'nuxi typecheck accepts the auto-imported component',
  compiledClean(n0), `same run as N0; exit=${n0.status}`);

console.log('\n=== N4: THE profile claim — bare vue-tsc on the SAME clean project ===');
const n4 = run('npx', ['vue-tsc', '--noEmit']);
check('N4-vuetsc-bare', 'bare vue-tsc does NOT compile the auto-import project clean',
  !compiledClean(n4), `exit=${n4.status}  ${n4.out.split('\n').filter(l=>/error/i.test(l))[0] || '(no error line)'}`);

console.log('\n=== N1: a real SFC type error must be caught, with its diagnostic ===');
show('components/BadTypeBadge.vue');
const n1 = run('npx', ['nuxi', 'typecheck']);
check('N1-sfc-error', 'nuxi typecheck reports TS2322 for number-assigned-to-string in an SFC',
  failedWith(n1, 'TS2322'), `exit=${n1.status}`);

console.log('\n=== N2: plain tsc on the same broken project (profile: "tsc cannot parse .vue") ===');
writeFileSync('tsconfig.probe.json', JSON.stringify({
  compilerOptions: { noEmit: true, strict: true, module: 'esnext', target: 'esnext', moduleResolution: 'bundler' },
  include: ['utils/**/*.ts', 'components/**/*.vue', 'pages/**/*.vue']
}, null, 2));
const n2 = run('npx', ['tsc', '-p', 'tsconfig.probe.json']);
check('N2-tsc-blind', 'plain tsc does NOT report the TS2322 that nuxi typecheck found',
  !failedWith(n2, 'TS2322'), `exit=${n2.status}  TS18003=${/TS18003/.test(n2.out)}`);

console.log('\n=== exit codes actually observed ===');
console.log(`  nuxi typecheck (clean)  exit=${n0.status}`);
console.log(`  nuxi typecheck (error)  exit=${n1.status}   <- 'status === 1' checks would MISS this if it is 2`);
console.log(`  vue-tsc bare            exit=${n4.status}`);
console.log(`  tsc plain               exit=${n2.status}`);

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f=>f.id).join(', ')); process.exit(1); }
