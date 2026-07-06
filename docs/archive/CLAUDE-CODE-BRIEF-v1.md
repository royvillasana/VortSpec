# VortSpec: Working Agreement for Claude Code

You are building VortSpec, the Spec-Driven Design Engineering platform. This file tells you how to work. The two companion documents tell you what to build:

1. `vortspec-prd.md` : product requirements. Phase 1 only is in scope.
2. `vortspec-ir-schemas.md` : NORMATIVE. The IR schemas are the contract of the entire system. When PRD prose and schema conflict, the schema wins; flag the conflict instead of silently resolving it.

## Non-negotiable invariants

Copy of the checklist from the schemas doc. Violating any of these is a bug regardless of what any other instruction says:

1. Tokens are referenced by id everywhere; style literals are always `flagged: true`.
2. Every extracted or inferred artifact carries `Provenance`.
3. LLMs propose `IRPatch` objects; they never mutate the IR directly.
4. All patches are Zod-validated before preview and before apply.
5. Optimistic concurrency via `baseVersion`; stale patches are rejected.
6. Token deletion requires an explicit fallback strategy.
7. Adapters output `status: 'imported'`; the pipeline sets `normalized`; only user action sets `approved`.
8. No mutation of user data without explicit user approval in the UI.

## How to work

- **Milestones M0 to M4 are strictly ordered.** Before starting each milestone, produce a task breakdown and wait for approval. Within a milestone, work autonomously.
- **Spec-first, always.** This product exists because of spec-driven development; build it that way. For any non-trivial module, write the interface + Zod schemas + test fixtures before the implementation.
- **`packages/ir` is the foundation.** M0 is not done until every schema in the schemas doc exists as Zod, the example Button fixture validates, and type exports via `z.infer` compile under TypeScript strict.
- **Deterministic pipeline stages get golden-fixture tests.** Put real export fixtures in `packages/pipeline/fixtures/` (a Stitch-style HTML/CSS bundle and a captured Figma REST response). Same input, same output, asserted byte-for-byte where deterministic.
- **LLM calls:** only through `packages/llm` `LLMProvider`. Every structured call: temperature 0, Zod-validated output, one retry with the validation error appended, then graceful failure. Never parse LLM output with regex or optimistic JSON.parse without validation.
- **UI:** Next.js App Router, Tailwind, shadcn/ui. All user-facing strings through the i18n layer even though v1 ships English only. The Inspector is the product; invest polish there, not in marketing pages.
- **Do not build:** codegen, sandboxes, canvas, GitHub write ops, Jira, billing. If a task seems to need one of these, stop and ask; it is phase 2+ scope leaking.

## Conventions

- TypeScript strict everywhere; no `any` outside test fixtures.
- pnpm + Turborepo; packages as defined in PRD section 9.
- Commits: conventional commits, scoped by package (`feat(ir): ...`, `feat(pipeline): ...`).
- Errors shown to users are human sentences with a next step, never raw exceptions.
- Naming in code and UI: the product is "VortSpec" (capital V, capital S), the methodology is "Spec-Driven Design Engineering" or "SDD-E".

## Definition of done, per milestone

A milestone is done when: its "Done when" criterion from PRD section 11 passes end to end through the UI (not just via tests), all new code has tests, `pnpm build && pnpm test && pnpm lint` are green, and a short DEMO.md at repo root explains how to reproduce the milestone demo locally.

## First actions for M0

1. Scaffold the monorepo (pnpm, Turborepo, TypeScript strict, Vitest, ESLint/Prettier).
2. Implement `packages/ir`: all Zod schemas from the schemas doc, in dependency order (primitives -> tokens -> nodes -> component -> patches -> screen).
3. Add the example Button JSON from the schemas doc as a fixture and a test that parses it successfully, plus negative tests (unflagged literal must fail, patch with missing fallback on token.delete must fail).
4. Set up the Supabase project schema (PRD section 10) with RLS by project, and auth in `apps/web`.
5. Present the M1 task breakdown.
