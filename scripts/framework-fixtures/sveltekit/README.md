# SvelteKit framework fixture

Compiles the claims in `sveltekit`'s `FRAMEWORK_PROFILES` record instead of reasoning about them.

## The claim under test

`sveltekit.typecheckCmd` is **byte-identical** to `svelte`'s:

```ts
typecheckCmd: "npx svelte-check --threshold error",
```

That is the "likely inherits Svelte's result" reasoning — the exact shape the Svelte round already
refuted once, and the shape Nuxt turned out to violate because it *generates* types. SvelteKit
generates `./$types` into `.svelte-kit/types/` via `svelte-kit sync`. The question is therefore not
whether `svelte-check` can read `.svelte` — it can — but whether the profile's command is
**sufficient** on a project that uses the generated surface.

## Result

| case | outcome |
|---|---|
| `SK0-clean` | clean synced project → **exit 0**, failure matcher does not fire |
| `SK1-svelte-error` | wrong prop type → **exit 1**, specific message + `(ts)` marker |
| `SK2-tsc-blind` | plain `tsc` → does **not** find it, and does **not** report `TS18003` |
| `SK3-nosync` | **`.svelte-kit` absent → exit 1, `Cannot find module './$types'`** |
| `SK4-restored-clean` | after restore → **exit 0** |

**SK3 is the finding.** On correct, unmodified code the profile's command fails purely because the
generated types are absent — the same class of insufficiency Nuxt had, reached by a different route.
SK4 proves SK3 is the generated types and not damage to the project.

The profile's command needs `svelte-kit sync` to have run. `nuxi typecheck` self-prepares; bare
`svelte-check` does not.

## `svelte-check` emits no numeric TS codes

Worth carrying to any other fixture that touches it. A type error prints as:

```
Error: Type 'number' is not assignable to type 'string'. (ts)
```

Message text plus a `(ts)` marker — **no `TS2322`**. So the `failedWith(run, "TS2322")` shape the
Vue/Angular/Nuxt fixtures use cannot work here: asserting a code would silently degrade to "exited
non-zero", which is the V10 defect. `failedWith` here requires the specific message *and* the `(ts)`
marker, and `SK0` asserts the matcher comes back **false** on a clean run so an always-true matcher
cannot sail through.

## Traps this fixture is built to avoid

- **Exit codes are printed, never assumed.** `svelte-check` does not exit 1 the way `tsc` does.
- **A real `.ts` (`src/lib/utils/format.ts`) is present** so plain `tsc` cannot exit on
  `TS18003 No inputs were found` and be mistaken for evidence (Bumble's Vue-round trap). `SK2`
  asserts `TS18003` is absent as well as the type error.
- **ANSI escapes are removed inside the predicate**, not by weakening the pattern.
- **`SK0` is the false polarity.** Without it an always-fail measurement passes everything.

Two defects in the fixture itself were caught by `SK0` before any conclusion was drawn: a missing
`vitePreprocess` (so `lang="ts"` was unparsed) and a wrong `sveltekit` import in `vite.config.js`.
Both made a *clean* project fail, and without the false-polarity case they would have been reported
as "SvelteKit's check fails on a clean project".

## Running it

```bash
npm install          # exact pins; every claim here is version-sensitive compiler behaviour
npx svelte-kit sync  # generates .svelte-kit/types — SK3 removes and restores it
npm run verify
```

Pinned exactly: `@sveltejs/kit 2.70.2`, `svelte 4.2.20`, `svelte-check 3.8.6`, `typescript 5.9.3`.
Placed under `scripts/` deliberately — outside the `apps/*` / `packages/*` pnpm workspace globs, so
it cannot be hoisted into the app's dependency graph.
