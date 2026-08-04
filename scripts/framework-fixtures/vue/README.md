# Vue framework fixture

Executable evidence for the `vue` entry in `packages/core/src/shared/framework-profiles.ts`.

```bash
cd scripts/framework-fixtures/vue
npm install          # pinned: vue 3.5.40, vue-tsc 2.2.12, typescript 5.6.3
npm run verify       # 20/20 expected; non-zero if any case misbehaves
npm run mutate       # breaks each measurement in turn; non-zero if any mutant SURVIVES
```

Outside the pnpm workspace globs (`apps/*`, `packages/*`) deliberately — it installs its own
pinned toolchain and must not be hoisted into the app's dependency graph.

## What it establishes

| | |
|---|---|
| `vue-tsc` is required | plain `tsc` exits **0** on a project containing a broken `.vue`, reporting nothing |
| Vue has no Angular-shaped gap | a wrong-typed prop is caught with `strictTemplates` **off and on** |
| `strictTemplates` governs unknown props | not prop types — and it rejects legitimate `aria-label`/`data-testid` too |
| what reaches the DOM | a typo'd prop keeps its default *and* leaks onto the root as a stray attribute |

Full write-up, including the withdrawn recommendation and why: [`EVIDENCE.md`](./EVIDENCE.md).
Criteria were written before the fixture in [`WHAT_THIS_MUST_PROVE.md`](./WHAT_THIS_MUST_PROVE.md),
which records where the implementation diverged from the plan.

Every reference here is relative and committed. An earlier draft cited the agent workspace — the
same unversioned location this directory exists to retire, so the citation would have rotted
exactly as the fixture itself had.

## Why `mutate.mjs` exists

A green fixture proves nothing until it can be made to go red. `mutate.mjs` breaks each
measurement in turn and requires every one to be caught. Three separate always-true mutants are
caught by exactly **one** case (`V10-unrelated`); without it the whole matrix passes while
measuring nothing.

Two properties it enforces, both learned by getting them wrong first:

- **It never writes to `verify.mjs`.** An earlier version backed the file up, mutated it in
  place, and restored it. Two overlapping runs collided and left two resident mutants in the
  canonical fixture — including `hasAttr` stuck at `return false`, a permanently dead
  measurement. Each mutation now goes to a private `mkdtemp` copy.
- **A missing anchor is fatal, and the table prints only when every row completes.** A partial
  table that looks complete is the same "reports green, proves nothing" defect the fixture exists
  to detect.

`MUTATE_ROWS=<a>-<b>` runs an inclusive slice, `MUTATE_ONLY=<n>` the first n. Both print the
range and state loudly that they are not the full sweep. A slice exists because one uninterrupted
sweep exceeds this environment's 10-minute command ceiling — sliced runs are honest about
covering part of the matrix, whereas a killed sweep silently produces nothing at all.

## Cost

A full sweep runs a `vue-tsc` project per mutation and takes **over ten minutes**. That is a
property of the artifact, not the machine — worth knowing before wiring it into CI.

## Scope, stated rather than implied

Exercises `vue-tsc`. It does **not** cover Nuxt's `nuxi typecheck`, Storybook, browser rendering,
or whether the agent writes a good component from a Figma node.
