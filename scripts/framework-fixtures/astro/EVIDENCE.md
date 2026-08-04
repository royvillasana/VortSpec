---
title: "Astro Fixture — Executed Evidence, and a Mutation Sweep With No Survivors"
tags: [vortspec, astro, fixtures, framework-support, evidence]
status: active
created: 2026-08-05
---

# Astro fixture — executed evidence

Fixture: this directory. `npm run verify` → non-zero if any case misbehaves.
`npm run mutate` → non-zero if any mutant **survives**.

The claim under test, the case-by-case reasoning, and why `A5` is the finding are in
[`README.md`](./README.md); the prewritten criteria are in
[`WHAT_THIS_MUST_PROVE.md`](./WHAT_THIS_MUST_PROVE.md). This file records what was
**executed**, so the numbers those documents assert are not taken on trust.

## Environment

| | |
|---|---|
| `astro` | **5.14.1** |
| `@astrojs/check` | **0.9.4** |
| `typescript` | **5.6.3** |
| Node | **v23.11.0** |
| Host | macOS 26.5.2, arm64 |

Exact, not caret-ranged: every claim here is version-sensitive compiler behaviour, and `A7`
fails the suite if a declared version drifts from the installed one. The versions above were
read from `node_modules/*/package.json` at run time, not from `package.json`.

## Verify — 9/9

```
PASS  A0-clean             a clean synced project checks clean  [exit=0 files=5]
PASS  A1-frontmatter       a type error in the frontmatter is reported as ts(2339)  [exit=1]
PASS  A2-tsc-blind         plain tsc exits CLEAN while the .astro error goes unreported  [exit=0]
PASS  A3-selfprepare       with .astro/ DELETED, astro check regenerates it and still checks clean  [exit=0 regenerated=true]
PASS  A4-prop              a wrong-typed prop parent -> child is caught as ts(2322)  [exit=1]
PASS  A5-ts-with-tsconfig  an error in a .ts file IS reported when tsconfig.json exists  [exit=1 files=5]
PASS  A5-ts-no-tsconfig    the SAME directory, tsconfig deleted: NOT reported — 2 files, exit 0  [exit=0 files=2]
PASS  A7-pins              every dependency is pinned exactly AND the installed version matches  [astro 5.14.1->5.14.1 @astrojs/check 0.9.4->0.9.4 typescript 5.6.3->5.6.3]
PASS  A6-unrelated         a missing import fails, but is NOT the declared ts(2322)  [exit=1]

9/9 cases behaved as declared.
```

Wall clock ≈ 2m53s — nine real `astro check` runs over real projects, not stubs.

## Mutation sweep — 10 rows, 0 survivors

A green suite proves nothing on its own: a matcher that always returns `true` passes every
failure case. The sweep breaks the verifier ten ways and requires each break to be **caught**.

Run from the committed path as four slices, because one uninterrupted sweep exceeds a
ten-minute command ceiling and a killed sweep produces nothing at all.

| # | Mutant | exit | score | caught by |
|---|---|---|---|---|
| 1 | `checkedClean` → always true | 1 | 8/9 | `A6-unrelated` |
| 2 | `checkedClean` → always false | 1 | 5/9 | `A0-clean` `A2-tsc-blind` `A3-selfprepare` `A5-ts-no-tsconfig` |
| 3 | `failedWith` → exit-code only (drop the `ts()` match) | 1 | 8/9 | `A6-unrelated` |
| 4 | `failedWith` → UPPERCASE `TS####` (the shape that cannot fire) | 1 | 6/9 | `A1-frontmatter` `A4-prop` `A5-ts-with-tsconfig` |
| 5 | `failedWith` → always true | 1 | 8/9 | `A6-unrelated` |
| 6 | `failedWith` → always false | 1 | 6/9 | `A1-frontmatter` `A4-prop` `A5-ts-with-tsconfig` |
| 7 | `filesChecked` → always 5 (hide the scope narrowing) | 1 | 8/9 | `A5-ts-no-tsconfig` |
| 8 | `stripAnsi` → identity | 1 | 6/9 | `A1-frontmatter` `A4-prop` `A5-ts-with-tsconfig` |
| 9 | `A7`: declare a CARET instead of an exact pin | 1 | 8/9 | `A7-pins` |
| 10 | `A5`: stop deleting the tsconfig (erase the finding) | 1 | 8/9 | `A5-ts-no-tsconfig` |

**Every row exited non-zero. No mutant survived.**

Slices `1-3`, `4-6`, `7-8`, `9-10`; each printed `CANONICAL (untouched by this driver) 0 9/9`,
**identical across all four** — the driver never wrote to the canonical `verify.mjs`, so the
ten results are ten independent measurements of the same source.

### What each row is actually worth

**Row 4 is the one that justifies the fixture existing.** `TS####` is the matcher shape the Vue,
Angular and Nuxt fixtures share, and it is caught here by three cases. Had `astro check`'s
`error ts(2339)` format gone unnoticed, every declared failure would have silently degraded to
"exited non-zero" and the suite would still have read green.

**Rows 1, 3 and 5 are caught only by `A6-unrelated`.** That is the false-polarity case, and this
is the evidence it earns its place: three separate always-pass mutants are invisible to every
other case in the suite. Delete `A6` and three of ten mutants survive.

**Row 7 defends the finding's mechanism, not just its verdict.** `A5-ts-no-tsconfig` asserts
`files=2`, so pinning the count to 5 is caught. Without it the scope narrowing could be reported
as a plain pass/fail and the "2 files instead of 5" detail — the part that explains *why* the
gate goes green — would be unenforced.

**Row 10 is the erasure test.** It removes the `rmSync` that creates the A5 condition. If nothing
caught it, the fixture's headline finding would be an assertion about a project state it never
actually constructed.

**Row 9 covers the pin claim itself.** Before the round that added it, the README said dependencies
were "pinned exactly, with a test enforcing it" while the enforcing test existed only as a command
someone once ran in a shell. A caret in `package.json` now fails `A7-pins`.

## Scope — stated rather than implied

This exercises `npx astro check`, the command `FRAMEWORK_PROFILES` assigns to `astro`, on this
platform at these versions. It does **not** establish anything about Astro's *runtime* output,
styling, hydration, or any integration (React, Vue, Svelte islands) — no browser is involved.
`A3` settles only that `astro check` self-prepares its own `.astro/` types, which is why the
profile needs no `astro sync` prefix; it says nothing about other Astro commands.
