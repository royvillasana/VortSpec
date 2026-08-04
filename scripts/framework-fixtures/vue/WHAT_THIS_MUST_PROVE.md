# What a passing Vue fixture must prove

Written before the fixture. The discriminating controls are chosen from what Angular taught
me one round ago, not invented after review.

## The claim under test

The profile assigns `npx vue-tsc --noEmit` to `vue` (and `npx nuxi typecheck` to `nuxt`, which
wraps it). The reason on record is that `tsc` cannot parse `.vue` at all.

## The control Angular earned

Angular's gate turned out to be **necessary but not sufficient**: it caught template
*expressions* either way, but silently skipped cross-component **binding** types unless
`angularCompilerOptions.strictTemplates` was on. That is precisely the hand-off VortSpec
generates — a component with typed props, and a page that binds to them.

So the question for Vue is not "does `vue-tsc` check the template" — it is:

> **Does `vue-tsc` type-check a prop passed from a parent to a child component, and does that
> depend on a config flag the profile never mentions?**

Vue has its own `vueCompilerOptions.strictTemplates`. If it governs the cross-component
hand-off the way Angular's does, the profile has the same gap for a second framework.

## Proofs

**V1 — not always-red.** A correct SFC with a correct parent binding: exit 0.

**V2 — not always-green.** A type error in `<script setup>`: fails.

**V3 — the parse claim** (parallel to Angular's A3, and the profile's stated reason):
- plain `tsc` over the same project → must PASS, i.e. it cannot see `.vue` at all.
- `vue-tsc` → must FAIL on a template-only expression error.

**V4 — the Angular-analogous discriminating pair.** A wrong-typed **prop binding**
parent → child, compiled with `strictTemplates` off and on. If off passes, Vue has Angular's
gap and the profile is incomplete for two frameworks rather than one.

**V5 — the scope control**, so V4 cannot be over-read. An *expression* error inside the same
template, in both modes. If it fails in both, then whatever V4 shows is specific to binding
checks — the same narrowing `A5-scope` provides for Angular.

I do not know which way V4 goes. Writing that down deliberately: last round I predicted the
config flag would matter, was right for bindings and wrong for expressions, and only the pair
told me which.

---

## Amendment — what was actually built, and where it diverged from this plan

Added after the first review round. Thor caught that the plan above and the fixture did not
match, and that the report nonetheless claimed the criteria were prewritten. They were not, for
this case. Recorded rather than quietly reconciled.

**The planned V5 (expression error, both modes) was never run in the first pass.** I found the
unknown-prop behaviour while exploring, judged it more interesting, and put it in the V5 slot —
so the fixture shipped with the *substitute* and without the *control*. The substitute is
legitimate evidence; calling it prewritten was not.

Both now exist, under honest names:

- `V6-scope-*` — the **planned** control, run at last. Post-plan only in the sense that it is
  late, not in what it asserts.
- `V7-*` / `V8-*` / `V9-*` — the unknown-prop line of enquiry, **discovered while building and
  labelled as post-plan evidence.**

**The second thing the plan got wrong** is that it treated "unknown prop is not reported" as
self-evidently a defect. Vue forwards undeclared attributes to the root element
(*fallthrough attributes*, https://vuejs.org/guide/components/attrs.html). So an unknown
attribute is a **feature** as often as a bug, and no type check can read intent. `V9-*` renders
the components to settle what actually reaches the DOM rather than reasoning about it.

## Harness properties, from the start

- **Both-polarity predicate** — one `compiledClean()`, asserted true by some cases and false
  by others.
- **Enforced artifacts** — `record()` throws without non-empty evidence.
- **Mutation-tested in three dimensions** — expectation, measurement (both directions),
  evidence.

## Out of scope, stated so no coverage is implied

- Storybook / browser rendering.
- Nuxt's `nuxi typecheck` specifically — it wraps `vue-tsc` over a generated tsconfig; this
  fixture tests `vue-tsc`, and I will say so rather than imply Nuxt is covered.
- Whether VortSpec's agent writes a good Vue component from a Figma node.
