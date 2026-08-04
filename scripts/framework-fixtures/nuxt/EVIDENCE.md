# Nuxt profile fixture — what was measured

Run: `npm ci && npm run verify` from this directory. Requires network for the install.
**Not wired into CI** — no workflow in this repo provisions a Nuxt toolchain. It runs by hand.

Pinned exactly (`package.json`), because every claim below is version-sensitive compiler
behaviour and a caret would let a future install reproduce different evidence under this commit:

    nuxt 3.21.10 · vue-tsc 2.2.12 · typescript 5.9.3

## Observed

| case | state | command | result |
|---|---|---|---|
| A | `.nuxt/` present | `vue-tsc --noEmit` | exit 0, clean |
| B | `.nuxt/` absent  | `vue-tsc --noEmit` | exit 2, `TS5083` cannot read `.nuxt/tsconfig.json`, cascading to `TS2468`/`TS2583` |
| C | `.nuxt/` absent  | `npx nuxi typecheck` | exit 0 — regenerates `.nuxt/` itself |
| N1 | type error in an SFC | `npx nuxi typecheck` | **exit 2**, `TS2322` |
| N2 | same broken project | plain `tsc` | exit 0, does not find `TS2322` |
| — | no root `tsconfig.json` | `npx nuxi typecheck` | **exit 1**, `ERROR`, no `TS` diagnostic at all |

## What these support, and what they do not

They support the `typecheckCmd` and the corrected pitfall in `framework-profiles.ts` — that
`nuxi typecheck` self-prepares and bare `vue-tsc` does not, and that the failure of bare
`vue-tsc` is a CONFIG load failure rather than spurious diagnostics on components.

They do **not** support any claim about other Nuxt versions, other project layouts, or Windows.
Two exit codes are recorded specifically because assuming them would have been wrong: `nuxi
typecheck` exits 2 on a type error (a `status === 1` check passes everything) and exits 1 with
no TS diagnostic when there is no tsconfig (a gate reading "non-zero means type errors" reports
a type failure for a project it never checked).
