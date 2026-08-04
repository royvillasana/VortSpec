/**
 * Vue framework fixture — repeatable, self-asserting.
 *
 * Harness properties, and honestly when each arrived:
 *   - `compiledClean()` and the throwing `record()` were built in from the start.
 *   - `hasAttr()` and `text()` arrived WITH the V9 SSR cases, post-plan, in the round that
 *     answered the fallthrough review. Mutated to the same standard now, but not from the start.
 *   - `text()` is not boolean, so "both polarities" is the wrong frame: what it needs is that no
 *     single constant satisfies the render cases, which expect DIFFERENT values. Verified with
 *     '7' (kills V9-render-typo) and '42' (kills the other two) — disjoint, so neither alone
 *     would have shown it. Re-run whenever cases are added.
 *
 * Tests `vue-tsc`, the command the profile assigns to `vue`. It does NOT test Nuxt's
 * `nuxi typecheck`, which wraps vue-tsc over a generated tsconfig — said plainly rather than
 * implied, because "vue passes" must not be read as "nuxt passes".
 *
 * Run: node verify.mjs → exits non-zero if any case does not behave as declared.
 */
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const ROOT = dirname(fileURLToPath(import.meta.url));
const results = [];

/** `artifact` is REQUIRED — a case that cannot show its evidence is a crash, not a boolean. */
function record(id, what, ok, detail, artifact) {
  if (typeof artifact !== 'string' || artifact.length === 0) {
    throw new Error(`case ${id} recorded without an artifact — every case must show its evidence`);
  }
  results.push({ id, what, ok, detail, artifact });
}

/** THE measurement. Asserted true by some cases and false by others, so a constant fails. */
function compiledClean(run) {
  return run.status === 0;
}

/**
 * A declared failure must be THE failure, not any failure. Fizz found that `ngc` exits 1 on a
 * module-resolution error exactly as on a type error, so two cases in their control went green
 * proving nothing. `vue-tsc` has the same property, and every `!compiledClean()` case here had
 * the same hole. An exit code is not a measurement.
 *
 * Asserted FALSE by V10-unrelated, which fails for a different reason and must not satisfy it.
 *
 * ANSI escapes are removed HERE rather than at the call site, so the predicate owns the invariant.
 * `vue-tsc` happens to emit uncoloured output in this environment — even under FORCE_COLOR=1 —
 * so the matching worked by luck of the non-TTY, not by design. Fizz hit the coloured case with
 * `ngc`: the bytes between `error` and `TS2322` are escape sequences, and the tempting fix is to
 * weaken the pattern to the bare code. That would match `TS2322` appearing in a filename. Strip
 * the escapes and keep requiring the `error ` prefix. V11 pins this without depending on a TTY.
 */
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

function failedWith(run, code) {
  return run.status !== 0 && new RegExp(`error ${code}\\b`).test(stripAnsi(run.out));
}

/** Second measurement, for the render cases. Also asserted in both polarities. */
function hasAttr(html, name) {
  return new RegExp(`<button[^>]*\\s${name}=`).test(html);
}

/** The rendered text of the root button — i.e. what value the declared prop actually took. */
function text(html) {
  return (/<button[^>]*>([^<]*)<\/button>/.exec(html) ?? [, ''])[1].trim();
}

/**
 * SSR-render a host template against a Button that declares `count` WITH a default, because
 * "the prop keeps its default" is only observable if a default exists to keep. The type-check
 * cases above deliberately use a defaulted-free `defineProps<{ count: number }>()`; this is a
 * different component for a different question, said plainly rather than blurred.
 */
async function render(hostTemplate) {
  const Button = {
    props: { count: { type: Number, default: 42 } },
    template: '<button>{{ count }}</button>',
  };
  return renderToString(createSSRApp({ components: { Button }, template: hostTemplate }));
}

const BUTTON = `<script setup lang="ts">
defineProps<{ count: number }>();
</script>

<template>
  <button>{{ count }}</button>
</template>
`;

const host = (body) => `<script setup lang="ts">
import Button from './Button.vue';
</script>

<template>
${body}
</template>
`;

const GOOD_HOST = host('  <Button :count="1" />');
const BAD_TYPE_HOST = host(`  <Button :count="'definitely not a number'" />`);
const UNKNOWN_PROP_HOST = host('  <Button :count="1" label="hello" />');
const NEAR_MISS_HOST = host('  <Button :count="1" :cout="7" />');
const ARIA_HOST = host('  <Button :count="1" aria-label="Buy" />');
const CLASS_HOST = host('  <Button :count="1" class="cta" />');
const BAD_EXPR = `<script setup lang="ts">
defineProps<{ n: number }>();
</script>
<template><p>{{ n.toUpperCase() }}</p></template>
`;
/** Fails for a reason that is NOT a type error — the control for `failedWith`. */
const MISSING_IMPORT_HOST = `<script setup lang="ts">
import Button from './DoesNotExist.vue';
</script>
<template><Button :count="1" /></template>
`;
/** An expression error inside a template that binds nothing across a component boundary. */
const BAD_EXPR_SOLO = `<script setup lang="ts">
defineProps<{ count: number }>();
</script>
<template><button>{{ count.toUpperCase() }}</button></template>
`;

function tsconfig(strictTemplates) {
  return JSON.stringify({
    compilerOptions: {
      target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler',
      strict: true, skipLibCheck: true, noEmit: true, jsx: 'preserve',
    },
    vueCompilerOptions: { strictTemplates },
    include: ['src/**/*.ts', 'src/**/*.vue'],
  }, null, 2);
}

function run(bin, files, strictTemplates) {
  const dir = mkdtempSync(join(tmpdir(), 'vue-case-'));
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
    mkdirSync(join(dir, 'src'), { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'src', name), body);
    writeFileSync(join(dir, 'tsconfig.json'), tsconfig(strictTemplates));
    const r = spawnSync('npx', [bin, '--noEmit'], { cwd: dir, encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    return { status: r.status ?? -1, out: out || '(no output)' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// V1 — not always-red.
{
  const r = run('vue-tsc', { 'Button.vue': BUTTON, 'Host.vue': GOOD_HOST }, true);
  record('V1', 'a correct SFC + correct prop binding compiles', compiledClean(r), `exit=${r.status}`, r.out);
}

// V2 — not always-green: an error in <script setup>.
{
  const broken = BUTTON.replace('defineProps<{ count: number }>();',
    'defineProps<{ count: number }>();\nconst bad: number = "a string";');
  const r = run('vue-tsc', { 'Button.vue': broken }, true);
  record('V2', 'a type error in <script setup> fails with TS2322', failedWith(r, 'TS2322'), `exit=${r.status}`, r.out);
}

// V3 — the profile's stated reason, and the trap in proving it.
//
// WRONG: plain tsc fails on a Vue project, so the non-zero exit proves it cannot read .vue.
// ACTUAL: a .vue-only project gives tsc exit 2 as TS18003 "No inputs were found" — tsc never
//   examined the file, so that exit is a pass for the wrong reason, not evidence.
// RIGHT: with a real .ts file present so tsc has an input, tsc exits 0 and never mentions the
//   .vue error. It does not error out; it silently checks nothing. THAT is the silent-skip the
//   per-framework command exists to prevent, and it is the worse of the two readings.
{
  const files = { 'Host.vue': BAD_EXPR, 'util.ts': 'export const ok = 1;\n' };
  const byTsc = run('tsc', files, true);
  record('V3-tsc-silent', 'plain tsc exits CLEAN while a .vue type error goes unreported',
    compiledClean(byTsc), `exit=${byTsc.status}`, byTsc.out);

  const byVueTsc = run('vue-tsc', files, true);
  record('V3-vue-tsc', 'vue-tsc catches the same .vue error as TS2339', failedWith(byVueTsc, 'TS2339'),
    `exit=${byVueTsc.status}`, byVueTsc.out);
}

// V4 — the Angular-analogous pair. Angular silently skipped cross-component binding TYPES
// without its strictTemplates. Vue does not: both modes catch it.
{
  const files = { 'Button.vue': BUTTON, 'Host.vue': BAD_TYPE_HOST };
  const lax = run('vue-tsc', files, false);
  record('V4-type-lax', 'a wrong-typed prop IS caught as TS2322 even WITHOUT strictTemplates (unlike Angular)',
    failedWith(lax, 'TS2322'), `exit=${lax.status}`, lax.out);

  const strict = run('vue-tsc', files, true);
  record('V4-type-strict', 'and with strictTemplates as well, same TS2322', failedWith(strict, 'TS2322'),
    `exit=${strict.status}`, strict.out);
}

// V5 — what Vue's strictTemplates DOES govern. Without this pair, V4 would license the broad
// claim "Vue's flag doesn't matter", which is false: it governs UNKNOWN props, not prop types.
{
  const files = { 'Button.vue': BUTTON, 'Host.vue': UNKNOWN_PROP_HOST };
  const lax = run('vue-tsc', files, false);
  record('V5-unknown-lax', 'an UNKNOWN prop is NOT reported without strictTemplates',
    compiledClean(lax), `exit=${lax.status}`, lax.out);

  const strict = run('vue-tsc', files, true);
  record('V5-unknown-strict', 'the same unknown prop IS reported with strictTemplates as TS2353',
    failedWith(strict, 'TS2353'), `exit=${strict.status}`, strict.out);
}

// V6 — the SCOPE control, and the provenance note that goes with it.
//
// This is the control WHAT_THIS_MUST_PROVE.md planned for the V5 slot and the first pass never
// ran: I found the unknown-prop behaviour mid-build, judged it more interesting, and shipped
// the substitute in its place — then described the criteria as prewritten. The substitute was
// real evidence; the provenance claim was false. Both now exist under honest names.
//
// It narrows V4 exactly as A5-scope narrows A4: an expression error inside ONE component's own
// template, crossing no component boundary. Failing in both modes is what makes V4 a statement
// about bindings rather than about template checking at large.
{
  const files = { 'Button.vue': BAD_EXPR_SOLO };
  const lax = run('vue-tsc', files, false);
  record('V6-scope-lax', 'an expression error in a component\'s own template is TS2339 WITHOUT strictTemplates',
    failedWith(lax, 'TS2339'), `exit=${lax.status}`, lax.out);

  const strict = run('vue-tsc', files, true);
  record('V6-scope-strict', 'and with strictTemplates too — so V4/V5 are about the boundary, not templates at large',
    failedWith(strict, 'TS2339'), `exit=${strict.status}`, strict.out);
}

// V7/V8 — post-plan evidence. THE POLICY BOUNDARY: strictTemplates cannot read intent.
//
// WRONG: an unreported unknown prop is straightforwardly a defect, so turning strictTemplates
//   on is a free win.
// ACTUAL: Vue forwards undeclared attributes to the root element by design — "fallthrough
//   attributes". A typo and a deliberate `aria-label` are THE SAME MECHANISM, and the flag
//   rejects both. It is a policy choice with a real cost, not a free win.
{
  const nearMissLax = run('vue-tsc', { 'Button.vue': BUTTON, 'Host.vue': NEAR_MISS_HOST }, false);
  record('V7-typo-lax', 'a misspelled declared prop (:cout for :count) is NOT reported without strictTemplates',
    compiledClean(nearMissLax), `exit=${nearMissLax.status}`, nearMissLax.out);

  const nearMissStrict = run('vue-tsc', { 'Button.vue': BUTTON, 'Host.vue': NEAR_MISS_HOST }, true);
  const named = /Did you mean to write 'count'/.test(nearMissStrict.out);
  record('V7-typo-strict', 'WITH strictTemplates the typo is TS2561 and names the intended prop',
    failedWith(nearMissStrict, 'TS2561') && named, `exit=${nearMissStrict.status} named=${named}`, nearMissStrict.out);

  // The cost. A legitimate accessibility attribute is rejected by the same flag.
  const aria = run('vue-tsc', { 'Button.vue': BUTTON, 'Host.vue': ARIA_HOST }, true);
  record('V8-aria-strict', 'but strictTemplates ALSO rejects a legitimate aria-label (TS2353) — the cost',
    failedWith(aria, 'TS2353'), `exit=${aria.status}`, aria.out);

  // ...and the exemption, so V8 is not over-read into "every attribute is rejected".
  const cls = run('vue-tsc', { 'Button.vue': BUTTON, 'Host.vue': CLASS_HOST }, true);
  record('V8-class-exempt', 'class is exempt even under strictTemplates — the rejection is not blanket',
    compiledClean(cls), `exit=${cls.status}`, cls.out);
}

// V9 — what actually REACHES THE DOM. Rendered, not reasoned about.
//
// WRONG: an undeclared prop is "silently dropped and the component renders with its default".
// ACTUAL: the default IS retained, but the attribute is not dropped — it is forwarded onto the
//   root element, so a typo ships as a junk DOM attribute rather than vanishing. I asserted the
//   dropped half from the type checker alone, without ever rendering the component.
{
  const correct = await render('<Button :count="7" />');
  record('V9-render-correct', 'a correct binding renders the passed value and adds no attribute',
    text(correct) === '7' && !hasAttr(correct, 'cout'), correct, correct);

  const typo = await render('<Button :cout="7" />');
  record('V9-render-typo', 'a typo leaves the prop at its DEFAULT and leaks the misspelling into the DOM',
    text(typo) === '42' && hasAttr(typo, 'cout'), typo, typo);

  const fall = await render('<Button :count="7" data-testid="cta" />');
  record('V9-render-fallthrough', 'an intentional attribute reaches the root the SAME way — indistinguishable',
    text(fall) === '7' && hasAttr(fall, 'data-testid'), fall, fall);
}

// V10 — the control that gives `failedWith` its false polarity, and the one that would have
// caught the hole. A DIFFERENT failure: the host imports a component that does not exist.
//
// WRONG: a non-zero exit from vue-tsc means the case's intended error was found.
// ACTUAL: vue-tsc exits non-zero for module resolution too. Every `!compiledClean()` assertion
//   above was satisfiable by a broken workspace that never type-checked anything — the same
//   false PASS Fizz found in the Angular control, sitting in mine unexercised.
{
  const r = run('vue-tsc', { 'Host.vue': MISSING_IMPORT_HOST }, true);
  // WRONG v2: "non-zero and not TS2322" is enough to stand for the missing-import scenario.
  // ACTUAL: that admits TS2339, a syntax error, or a broken tsconfig — any of which would report
  //   that the missing-import case behaved as declared. The label claimed more than the
  //   measurement required, inside the case added to stop exactly that. Both halves now.
  // `!compiledClean(r)` is kept EXPLICITLY even though failedWith already implies status !== 0.
  // Dropping it when this case gained its two diagnostic halves removed compiledClean's last
  // false assertion in the whole file, and `compiledClean -> always true` then passed 20/20.
  // Implied by another predicate is not asserted. Caught by re-running the table, not by review.
  record('V10-unrelated', 'a missing import fails as TS2307 specifically, and is NOT the declared TS2322',
    !compiledClean(r) && failedWith(r, 'TS2307') && !failedWith(r, 'TS2322'), `exit=${r.status}`, r.out);
}

// V11 — the predicate owns the ANSI invariant, without depending on a TTY.
//
// vue-tsc emits uncoloured output here even under FORCE_COLOR=1, so no compiler case can
// exercise this. These are synthetic `run` objects fed straight to the predicate — a unit
// control on `failedWith`, NOT compiler evidence, and labelled as such rather than blurred in
// with the eighteen executed cases.
{
  const ESC = '\u001b';
  const coloured = {
    status: 2,
    out: `src/Host.vue:5:23 - ${ESC}[91merror${ESC}[0m${ESC}[90m TS2322: ${ESC}[0mType 'string' is not assignable.`,
  };
  record('V11-ansi-coloured', 'a COLOURED diagnostic is still recognised (escapes stripped, not pattern weakened)',
    failedWith(coloured, 'TS2322'), 'synthetic', coloured.out);

  // The reason for stripping rather than matching a bare code: a filename can contain it.
  const filename = { status: 2, out: `src/TS2322.vue:1:1 - error TS9999: something else entirely.` };
  record('V11-ansi-notdiag', 'the code appearing in a FILENAME is not a diagnostic',
    !failedWith(filename, 'TS2322'), 'synthetic', filename.out);
}

// ── report ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(18)} ${r.what}  [${r.detail}]`);
  if (!r.ok) console.log(`      ── artifact ──\n${r.artifact.split('\n').map((l) => '      ' + l).join('\n')}`);
}
console.log(`\n${results.length - failed}/${results.length} cases behaved as declared.`);
process.exit(failed === 0 ? 0 : 1);
