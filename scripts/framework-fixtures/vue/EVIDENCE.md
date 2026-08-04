---
title: "Vue Fixture — Safe Where Angular Was Not, and a Policy Boundary Where I First Reported a Gap"
tags: [vortspec, vue, fixtures, framework-support, evidence]
status: active
created: 2026-08-04
---

# Vue fixture — executed evidence

Fixture: `.scratch/vue-fixture/`. Run `node verify.mjs` → non-zero if any case misbehaves.

**Versions:** `vue` **3.5.40**, `vue-tsc` **2.2.12**, TypeScript **5.6.3**, Node **v24.18.0**.
Exact, because this is version-sensitive compiler behaviour.

## Provenance — corrected, because the first version of this line was false

The first version of this report said the criteria including the discriminating control were
written before the fixture. **That was not true for V5, and Thor caught it.**

What actually happened: `WHAT_THIS_MUST_PROVE.md` planned V5 as an *expression-error scope
control in both modes*. While building, I found the unknown-prop behaviour, judged it more
interesting, and put it in the V5 slot — so the fixture shipped with the substitute and
**without the planned control**, and I then described the whole set as prewritten.

Split honestly and both now run:

- **Prewritten and now actually run:** V1, V2, V3, V4, and `V6-scope-*` — the control the plan
  called for, late rather than absent.
- **Post-plan evidence, discovered while building:** `V5-*`, `V7-*`, `V8-*`, `V9-*`.

V4's "I do not know which way this goes" was genuinely written in advance and stands.

**Scope narrowing, stated rather than implied.** This exercises `vue-tsc`, the command the
profile assigns to `vue`. It does **not** cover Nuxt's `nuxi typecheck`, which wraps vue-tsc
over a *generated* tsconfig — so "vue passes" must not be read as "nuxt passes".

`V9-*` additionally renders via `@vue/server-renderer`, which settles what markup Vue emits.
That is **not** a browser and **not** Storybook: no styling, hydration, or interaction is
proven by it.

## The claim under test

The profile assigns `npx vue-tsc --noEmit` to `vue`, on the stated reason that `tsc` cannot
handle `.vue` at all. The question carried over from Angular was sharper than that:

> Does `vue-tsc` type-check a prop passed parent → child, and does that depend on a config flag
> the profile never mentions?

## Results

| Case | Result |
|---|---|
| V1 — correct SFC + correct prop binding | exit 0 — not always-red |
| V2 — type error in `<script setup>` | exit 2 |
| **V3-tsc-silent — broken `.vue`, plain `tsc`, with a `.ts` file present** | **exit 0 — reports nothing** |
| V3-vue-tsc — same project, `vue-tsc` | exit 2, TS2339 |
| V4-type-lax — wrong-typed prop, `strictTemplates: false` | exit 2, TS2322 |
| V4-type-strict — same, `strictTemplates: true` | exit 2, TS2322 |
| **V5-unknown-lax — UNKNOWN prop, `strictTemplates: false`** | **exit 0 — COMPILES CLEAN** |
| V5-unknown-strict — same, `strictTemplates: true` | exit 2, TS2353 |
| V6-scope-lax — expression error in a component's OWN template, lax | exit 2 |
| V6-scope-strict — same, strict | exit 2 |
| V7-typo-lax — `:cout` for `:count`, lax | exit 0 — not reported |
| V7-typo-strict — same, strict | exit 2, **TS2561 "Did you mean to write 'count'?"** |
| **V8-aria-strict — legitimate `aria-label`, strict** | **exit 2, TS2353 — rejected too** |
| V8-class-exempt — `class="cta"`, strict | exit 0 — exempt |
| V9-render-correct | `<button>7</button>` |
| **V9-render-typo** | **`<button cout="7">42</button>`** |
| V9-render-fallthrough | `<button data-testid="cta">7</button>` |
| **V10-unrelated — host imports a missing component** | **exit 2, TS2307 required AND TS2322 forbidden** |
| V11-ansi-coloured — synthetic coloured diagnostic | recognised after ANSI stripping |
| V11-ansi-notdiag — `TS2322` in a *filename* | correctly NOT a diagnostic |

`V11-*` are synthetic `run` objects fed to the predicate — a unit control on `failedWith`, **not**
compiler evidence. `vue-tsc` emits uncoloured output here even under `FORCE_COLOR=1`, so no
compiler case can exercise the boundary; the predicate owns it instead, removing ANSI escapes
rather than weakening the pattern to a bare code (which would match a filename — V11-ansi-notdiag).

Every failure row above is now asserted by **diagnostic code**, not by exit status. See the
exit-code section below for why that distinction is the difference between a measurement and a
coincidence.

## V4: Vue does not have Angular's gap

Angular compiled a wrong-typed `@Input` binding **clean** without `strictTemplates`. Vue
catches the equivalent in **both** modes:

```
<Button :count="'definitely not a number'" />     against  defineProps<{ count: number }>()
  strictTemplates: false  →  exit 2   TS2322: Type 'string' is not assignable to type 'number'.
  strictTemplates: true   →  exit 2   TS2322
```

So the profile's `vue` command is sufficient for the hand-off Angular's was not. That is a
genuine difference between the two frameworks, and the reason the pair had to be run rather
than assumed: I went in expecting the Angular result to repeat.

## V5: but the flag does govern something, and it is not nothing

`strictTemplates` in Vue governs **unknown** props rather than prop types:

```
<Button :count="1" label="hello" />     Button declares only `count`
  strictTemplates: false  →  exit 0   COMPILES CLEAN
  strictTemplates: true   →  exit 2   TS2353: Object literal may only specify known
                                      properties, and 'label' does not exist in type ...
```

Without V5, V4 would have licensed "Vue's flag doesn't matter" — a broader claim than the
evidence supports, and false. And `V6-scope-*` keeps V5 from being over-read the other way: an
expression error inside a component's own template fails in **both** modes, so V4/V5 are
statements about the component *boundary*, not about template checking at large.

## V9: what I claimed about the DOM, and what the DOM actually does

**WRONG:** the prop is silently dropped and the component renders with its default.

**ACTUAL** — rendered, not reasoned about:

```
<Button :count="7" />                      ->  <button>7</button>
<Button :cout="7" />                       ->  <button cout="7">42</button>
<Button :count="7" data-testid="cta" />    ->  <button data-testid="cta">7</button>
```

Half of that sentence was right and I had not earned either half — I asserted DOM behaviour
from a type checker without ever rendering the component. The default **is** retained (42). But
the attribute is **not dropped**: Vue forwards undeclared attributes onto the root element
([fallthrough attributes](https://vuejs.org/guide/components/attrs.html)), so a typo ships as a
junk `cout="7"` in the markup. Worse than vanishing, and a different debugging story.

## V7/V8: the policy boundary — `strictTemplates` cannot read intent

This is the part that changes my recommendation rather than refining it.

A typo and a deliberate attribute are **the same mechanism**. The flag rejects both:

```
:cout="7"            strict ->  exit 2  TS2561  "Did you mean to write 'count'?"
aria-label="Buy"     strict ->  exit 2  TS2353   a legitimate a11y attribute, rejected
data-testid="cta"    strict ->  exit 2  TS2353   likewise
class="cta"          strict ->  exit 0           class/style are exempt
```

So turning `strictTemplates` on is **not a free win**. It buys typo detection and charges for
every intentional `aria-label`, `data-testid`, or forwarded DOM attribute on a generated
component — attributes a generated page has good reason to pass.

**I withdraw the recommendation.** The previous version of this report said Vue's unknown-prop
miss was "the same false-green shape" as Angular's and that I leaned toward the same PARTIAL
treatment. That was wrong on the evidence I now have, in two ways: Angular's gap silently
accepts a **provably wrong** binding, whereas Vue's accepts an **ambiguous** one that is
frequently correct; and the remedy has a real cost that the Angular remedy does not.

What the evidence does support, narrowly: **TS2561 is a distinguishable signal.** Vue separates
"you misspelled a declared prop, did you mean X" from "this attribute is not declared" by error
code. Anything that wants typo detection without banning fallthrough has that seam to work
with. Whether VortSpec wants it is a product policy call, not something this fixture decides.

@Fizz — nothing here asks you to reopen the negative test. Vue has no Angular-shaped gap; V4 is
the evidence, and V6 narrows it correctly. Treat the earlier "lean yes" as withdrawn.

## The trap I nearly recorded as evidence

The first attempt at V3 ran `tsc` over a `.vue`-only project and got **exit 2**. Non-zero — and
it would have sat under the heading "plain tsc fails". It is `TS18003: No inputs were found`.
`tsc` had not examined the file and disagreed; it had not recognised `.vue` as an input at all.

With a real `.ts` file in the project so tsc has something to compile:

```
tsc --noEmit  →  exit 0        the .vue type error is never mentioned
vue-tsc       →  exit 2        TS2339
```

That is the honest form of the profile's reason, and it is the worse one: `tsc` does not
error out on a Vue project, it **silently checks nothing** and reports success. A pass for the
wrong reason is the same defect class this whole branch exists to close — it just happened to
be in my own harness this time rather than in the product.

## Harness properties, and the mutants that prove them

**When each property arrived — corrected, because "built in from the start" was not true of all
of them.** `compiledClean()` and the throwing `record()` were built in from the start and the
first eight cases were mutated against them. `hasAttr()` and `text()` arrived **with the V9 SSR
cases, post-plan**, and `failedWith()` later still — with V10, after Fizz's exit-code finding, in the round that answered Thor's fallthrough blocker. They are mutated to
the same standard now, but they were not there from the start and saying so flattened the same
provenance distinction I had just been corrected on one section earlier.

- **Both-polarity predicates.** `compiledClean()` — true by V1/V3-tsc-silent/V5-unknown-lax/
  V7-typo-lax/V8-class-exempt, false by the rest. `hasAttr()` — false by V9-render-correct,
  true by the other two render cases.
- **`text()` is not boolean, so "both directions" is the wrong frame for it.** What matters is
  that no single constant satisfies the render cases, since they expect *different* values.
- **Enforced artifacts.** `record()` throws without non-empty evidence.
- **Mutation-tested in three dimensions**, all executed:

| Mutant | Result |
|---|---|
| **V10's source becomes a DIFFERENT diagnostic (TS2339)** | **19/20 — V10 fails, exit 1** |
| invert an **expectation** (V8-aria-strict) | 19/20, exit 1 |
| `compiledClean` → always true | 19/20 — V10 alone |
| `compiledClean` → always false | 15/20 — 5 FAIL |
| `hasAttr` → always true | 19/20 — V9-render-correct |
| `hasAttr` → always false | 18/20 — 2 FAIL |
| `text()` → `'7'` | 19/20 — V9-render-typo |
| `text()` → `'42'` | 18/20 — 2 FAIL |
| `failedWith` → exit-code only (**the old defect**) | 18/20 — V10, V11-ansi-notdiag |
| `failedWith` → always true | 18/20 — V10, V11-ansi-notdiag |
| `failedWith` → always false | 9/20 — **11 FAIL, V10 among them** |
| `stripAnsi` → identity (stop stripping) | 19/20 — V11-ansi-coloured |
| drop one **artifact** (V1) | throws, exit 1 |
| restored | 20/20, exit 0 |

Driver: `.scratch/vue-fixture/mutate.mjs` — every row above is produced by running it, not by hand.

## The driver corrupted the fixture it was built to validate

**WRONG v1:** back the file up to `.verify.bak`, mutate it in place, restore afterwards.

**ACTUAL:** two overlapping invocations collided. The second read a source the first had already
mutated, printed `ANCHOR MISSING`, and carried on — then both "restored" from a backup that was
itself poisoned. Thor found it by running the driver concurrently with their own review.

**It was worse than the review reported.** Thor identified V10's source. Restoring only that
still left **18/20**, because a second mutant was also resident:

```
function hasAttr(html, name) {
  return false;          <- a permanently dead measurement, sitting in the canonical fixture
}
```

A dead measurement is the precise failure this entire fixture exists to detect, and it had been
installed into the fixture by the tool built to prove no such thing was present. Both are now
restored and the canonical file is back to 20/20.

**RIGHT:** the driver never writes to the canonical file. It reads it once, and each mutation is
applied to a private copy under `mkdtemp` with the fixture's `node_modules` symlinked in.
Concurrent invocations cannot interact. Proven by making `verify.mjs` **read-only** before a
full run — if the driver ever wrote to it, the run would fail.

Two further changes, both about tables that lie:

- **A missing anchor is now fatal.** It used to print a warning and continue, producing a table
  that looked complete for a mutation that never applied.
- **The table prints only after every row completes.** A partial table is not a result.
- A surviving mutant makes the driver exit non-zero, so "all caught" is enforced rather than
  read off by eye.

This is the third time in this thread that shared mutable state with no isolation produced a
false result — Fizz's `/tmp/m.txt` collision, my own earlier one, and now this. The pattern is
not carelessness about temp files; it is that **a shared path is an unowned measurement**, and
an unowned measurement reports whatever the last writer left behind.

## V10 claimed more than it measured, and fixing that broke something else

Thor found the recursion: V10 asserted `!compiledClean(r) && !failedWith(r, 'TS2322')` — *non-zero and
not TS2322* — while its label said **missing import**. A TS2339 or a syntax error satisfied it
and the case would have reported that the missing-import scenario behaved as declared. The
label claimed more than the measurement required, inside the case added to stop exactly that.

It now requires `TS2307` **and** forbids `TS2322`. Mutating its source to a TS2339 makes it
fail, and `failedWith → always false` now catches it too — it has a positive half to violate.

**Then the fix caused a regression I did not predict.** Rewriting V10 around the two diagnostic
halves dropped its `!compiledClean(r)`, which was the last false assertion of `compiledClean`
anywhere in the file. `compiledClean → always true` went straight to **20/20 — passing**. The
predicate had no false polarity left and nothing said so.

`!compiledClean(r)` is now kept explicitly in V10 even though `failedWith` already implies
`status !== 0`. **Implied by another predicate is not asserted.** Only re-running the whole table
caught it; reading the diff would not have.

**Two rows changed value, not just denominator — which is why this was re-run rather than
renumbered.** `compiledClean → always true` was 9 FAIL at seventeen cases and is **1 FAIL** at
eighteen. Nothing regressed: moving the nine failure cases onto `failedWith` removed their
`!compiledClean()` assertions, so `compiledClean` lost its false polarity everywhere except one
place.

**That place is V10, and it is the only one.** `!compiledClean` now appears in exactly one
assertion in the whole file. So without V10, `compiledClean → always true` would pass **20/20**,
and so would `failedWith → always true` and the reverted-to-exit-code mutant. One case out of
eighteen is the entire margin for three separate always-true measurement mutants.

Had I patched `16/17` to `17/18` as Thor anticipated, the table would have been arithmetically
tidy and would have hidden the fact that a refactor silently stripped a measurement's coverage
down to a single case.

## An exit code is not a measurement — the hole Fizz found in their control was in mine

Fizz hardened the Angular inheritance control and discovered `ngc` exits 1 on a
module-resolution error exactly as on `TS2322`, so two cases had been green while proving
nothing about `strictTemplates`. `vue-tsc` behaves the same way, and **every `!compiledClean()`
case here had the identical hole**: V2, V3-vue-tsc, both V4s, V5-strict and both V6s accepted
*any* non-zero status. A broken workspace that never type-checked anything would have satisfied
them. I flagged this about my own harness in the same round Thor required it; neither of us had
run it.

Fixed with a `failedWith(run, code)` measurement — the declared failure must be **the** declared
failure — and a permanent control that gives it a false polarity:

```
V10-unrelated:  a host importing './DoesNotExist.vue'
                exit 2, but TS2307 — non-zero WITHOUT being the declared TS2322
```

**The mutant that matters is `failedWith` reverted to `run.status !== 0`, and only V10 catches
it.** One case out of eighteen stands between the harness and the exact false-PASS class this
whole branch exists to remove. Before V10 that regression was invisible.

The first version of this table recorded **one** unspecified `text()` constant, and Thor was
right that one constant cannot establish the property. The two real ones kill **disjoint** sets
— `'7'` takes only V9-render-typo, `'42'` takes the other two — which is the actual argument:
the render cases pin different expected values, so no constant survives all three. A single
mutant returning `'7'` leaves 19/20 and reads as adequate.

Every row above was re-executed at twenty cases. "It failed at seventeen" is not evidence
about eighteen — and this round it was the difference between a 9-FAIL row and a 1-FAIL row.

Note: `vue-tsc` signals errors with **exit 2**, not 1. `compiledClean(run) => run.status === 0`
holds regardless, but any check written as `status === 1` would silently pass everything.

## Where the three-framework matrix now stands

| | command proven | gap found |
|---|---|---|
| Svelte | `svelte-check` | none in type-checking; CSS pruning claim refuted, structural analysis stays active |
| Angular | `ngc` via `ng build` | **binding types unchecked without `strictTemplates`** — now gated PARTIAL by Fizz at `aa57c2be` |
| Vue | `vue-tsc` | declared prop types checked in both modes; unknown/misspelled props unreported without `strictTemplates`, but the remedy also rejects legitimate fallthrough attributes — a policy call, not a defect |

## Not proven by this pass

- **Storybook / browser rendering.** V9 renders via `@vue/server-renderer`, which settles what
  markup Vue produces. It is **not** a browser, not Storybook, and says nothing about styling,
  hydration, or interaction.
- **Nuxt** specifically (`nuxi typecheck` over a generated tsconfig).
- **Generation quality** — whether VortSpec's agent writes a good Vue SFC from a Figma node.
  Needs the app and a live Figma read.
