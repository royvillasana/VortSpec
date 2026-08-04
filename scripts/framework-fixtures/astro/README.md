# Astro framework fixture

Executable evidence for the `astro` entry in `packages/core/src/shared/framework-profiles.ts`.

```bash
cd scripts/framework-fixtures/astro
npm install                # pinned: astro 5.14.1, @astrojs/check 0.9.4, typescript 5.6.3
npm run verify             # 8/8 expected; non-zero if any case misbehaves
npm run mutate             # non-zero if any mutant SURVIVES
MUTATE_ROWS=1-4 npm run mutate    # a slice, for when a full sweep exceeds a command ceiling
```

Outside the pnpm workspace globs (`apps/*`, `packages/*`) deliberately — it installs its own
pinned toolchain and must not be hoisted into the app's dependency graph.

## The matcher was established before it was written

`astro check` emits:

```
src/components/Badge.astro:4:27 - error ts(2339): Property 'toUpperCase' does not exist on type 'number'.
```

**`error ts(2339)` — lowercase, parenthesised. Not `TS2339`.** The `failedWith(run, "TS####")`
shape that the Vue, Angular and Nuxt fixtures share could never have matched here, and every
declared failure would have degraded silently to "exited non-zero."

That is three of five tools where an inherited assumption about diagnostics is false:

| tool | what breaks the assumption |
|---|---|
| `svelte-check` | emits no numeric codes at all |
| `nuxi typecheck` | exits non-zero with **no** TS diagnostic when a tsconfig is missing |
| `astro check` | different code format — `ts(2339)`, not `TS2339` |

## What it establishes

| case | result |
|---|---|
| `A0-clean` | clean synced project → exit 0, 5 files |
| `A1-frontmatter` | frontmatter type error → `ts(2339)` |
| `A2-tsc-blind` | plain `tsc` exits **0** while the `.astro` error goes unreported |
| `A3-selfprepare` | `.astro/` deleted → `astro check` **regenerates it itself** and checks clean |
| `A4-prop` | wrong-typed prop parent → child caught as `ts(2322)` |
| **`A5-ts-with-tsconfig`** | an error in a `.ts` file **is** reported — 5 files |
| **`A5-ts-no-tsconfig`** | **the same error is NOT reported without `tsconfig.json` — 2 files, exit 0** |
| `A6-unrelated` | a missing import fails, but is not the declared `ts(2322)` |

**`A3` settles the question the Nuxt and SvelteKit rounds raised.** Both failed on generated
types and needed opposite fixes — `nuxi typecheck` self-prepares, `svelte-check` does not. Astro
**self-prepares**, so `typecheckCmd: "npx astro check"` is sufficient and needs no `astro sync`
prefix. The profile is correct here.

**`A5` is the finding.** Same project, same error, same command: reported with a `tsconfig.json`
and invisible without one. Not a crash and not a warning — a clean exit over 2 files instead of 5.
A project whose type errors live in `.ts` files gets a green CODE gate that checked none of them.

`A6` is the false polarity for `failedWith`. Without a case requiring the failure matcher to
return **false**, an always-true matcher passes every failure case above.

## Scope, stated rather than implied

Exercises `astro check`. It does **not** cover Storybook, browser rendering, island hydration at
runtime, or whether the agent writes a good Astro component from a Figma node.
