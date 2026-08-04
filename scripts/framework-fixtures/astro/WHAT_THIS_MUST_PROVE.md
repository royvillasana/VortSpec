# What a passing Astro fixture must prove

Written before the fixture and before anything was installed. Three rounds of this exercise have
established that the interesting failure is never the claim you set out to test.

## The claims on record

`framework-profiles.ts` → `astro`:

```ts
typecheckCmd: "npx astro check",
pitfalls: ["`tsc` cannot parse `.astro` — the check is `astro check`."],
props: "`interface Props { … }` in the frontmatter, read via `const { … } = Astro.props`",
events: "`.astro` components render to static HTML with NO client JS …",
```

## The question I care most about, and why

Nuxt and SvelteKit failed **the same way for opposite reasons**, and both were "inherits its
parent" reasoning:

| | generated types | command self-prepares? |
|---|---|---|
| nuxt | `.nuxt/` | **yes** — `nuxi typecheck` regenerates it |
| sveltekit | `.svelte-kit/` `$types` | **no** — `svelte-check` never syncs |

**Astro also generates types** — `astro sync` writes `.astro/types.d.ts`. So the discriminating
question is the third instance of the same shape:

> **Does `astro check` self-prepare like `nuxi typecheck`, or does it require a prior `astro sync`
> like `svelte-check` requires `svelte-kit sync`?**

If it does not self-prepare, `typecheckCmd` is insufficient exactly as SvelteKit's was, and the
fix is the same shape as PR #81. I do not know which way this goes. Writing that down in
advance, because last round I expected Vue to repeat Angular and it did not.

## Proofs

**A0 — not always-red.** A clean synced project checks clean. This case exists because Honey's
`SK0` caught two defects in their own fixture within ten minutes — a false-polarity case is the
only thing that distinguishes "the tool reports a problem" from "my fixture is broken."

**A1 — not always-green.** A real type error in the frontmatter is reported.

**A2 — the parse claim.** Plain `tsc` over the same project must NOT find the `.astro` error.
Carrying the Vue trap: the project must contain a real `.ts` file, or `tsc` exits non-zero on
`TS18003 No inputs were found` and is mistaken for evidence of parsing.

**A3 — the sync pair, the one that decides the profile.** Delete `.astro/` and run `astro check`.
Then restore and re-run. Honey's `SK3`/`SK4` is the model: one case establishes the symptom, the
other eliminates "the project was damaged" as the explanation. Without the second I would be
guessing which claim to change.

**A4 — the cross-component hand-off.** A wrong-typed prop passed parent → child. This is the
question Angular failed and Vue passed, and it is VortSpec's actual hand-off: generated
components with typed props, generated pages that bind to them.

## The matcher must be established, not assumed

**Two of the four tools examined so far do not behave as "non-zero means type errors":**
`svelte-check` emits no numeric TS codes at all, and `nuxi typecheck` exits non-zero with no TS
diagnostic when a tsconfig is missing.

So the first thing this fixture does is **observe what `astro check` actually prints** — clean,
broken, and misconfigured — and the matcher is written from that output. A matcher that cannot
fire is indistinguishable from one that never had cause to, and it would make every failure case
degrade silently to "exited non-zero."

## Harness properties, from the start

- **Both-polarity predicates.** Every measurement asserted true by some cases and false by others.
- **At least one case requiring the failure matcher to return FALSE** — the `V10` lesson: without
  it, three separate always-true mutants passed an entire matrix.
- **Enforced artifacts.** `record()` throws without evidence.
- **Isolated mutation driver.** Never writes the canonical file; sliceable; fatal on a missing
  anchor.
- **Committed and pushed before the mutation run.** Git is only a safe backup for what is
  actually in it.

## Out of scope, stated so no coverage is implied

- Storybook / browser rendering.
- Whether the agent writes a good Astro component from a Figma node.
- Island hydration behaviour at runtime — `client:*` directives are a build/runtime concern this
  type-check fixture does not exercise.
