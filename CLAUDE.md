# VortSpec — Working Agreement (v2, desktop)

You are building **VortSpec v2**, the Spec-Driven Design Engineering **desktop app**: an Electron cockpit over the user's **local Claude Code**. The product document is [`docs/vortspec-prd-v2.md`](docs/vortspec-prd-v2.md); it supersedes PRD v1 entirely. The active plan lives in the OpenSpec change `openspec/changes/pivot-to-desktop-cockpit/` (proposal, design, specs, tasks). **Reference the PRD and that change as the source of truth.**

> v1 (the Next.js web platform, IR pipeline, Supabase, server-side LLM provider) was deleted in the pivot and preserved as the git tag `archive/web-app-v1`. The v1 working agreement and IR schemas are archived under `docs/archive/` as history only — not normative.

## Non-negotiable invariants

Violating any of these is a bug regardless of any other instruction:

1. **Claude Code is the engine; VortSpec is the cockpit.** Never re-implement agent logic, the SDD-DE methodology, or a normalization pipeline. The app configures, launches, observes, and gates Claude Code runs.
2. **Same steps as the CLI.** The guided flow follows the SDD-DE cycle exactly. If the app and the CLI disagree, the CLI's methodology wins.
3. **Spec-first gates.** Generated artifacts (briefs, specs, plans) require explicit user approval before implementation proceeds. Nothing advances, and no downstream files mutate, without a recorded approval.
4. **The user's own Claude.** Authentication, plan, and usage belong to the user's Claude Code install. VortSpec stores **no provider keys**, proxies **no** model traffic, requires **no** account, and sends **no** telemetry without opt-in.
5. **Drive the real `claude` binary, non-bare.** The AgentAdapter spawns the user's installed `claude -p …` using their own login. **Never `--bare`** (it needs an `ANTHROPIC_API_KEY` and skips the SDD-DE skills/CLAUDE.md). Never inject or re-implement credentials. (See `docs/launch-gate-anthropic-policy.md`; get written Anthropic confirmation before any public release.)
6. **Local-first, transparent.** Everything lives in the user's project folder as plain files. Flow state is derivable from files on disk plus the run log, so any run is cancelable and the app can close/reopen mid-flow. Every friendly view has a one-click path to the raw form (terminal, file).
7. **Safe process handling.** Child processes run only in the selected project folder, spawned with argument arrays — never shell-string interpolation of user input.

## How to work

- **Milestones D0→D4 are strictly ordered** (see `tasks.md`). Each ends with the PRD "Done when" acceptance check, verified end-to-end through the UI, not just tests.
- **Isolate CLI knowledge behind the `AgentAdapter`.** It is the single place that knows Claude Code flags and stream-json event shapes. Verify them against current docs at implementation time (`docs/launch-gate-claude-code-headless.md`); the CLI evolves.
- **Zod at the boundaries only:** IPC contracts (main↔renderer), run-event parsing, artifact frontmatter parsing. No canonical IR store.
- **Portability risk is node-pty / process handling.** macOS first; isolate PTY/process code so Windows/Linux (deferred past D4) is a contained change.
- **Testing:** Vitest for main-process units, Playwright for renderer flows, recorded stream-json transcript fixtures for deterministic run-view tests.

## Conventions

- TypeScript strict everywhere; no `any` outside test fixtures.
- Stack: Electron + electron-vite, React, Tailwind (v1 `--color-vs-*` tokens in `apps/desktop/src/renderer/src/styles/globals.css`), pnpm + Turborepo.
- The monorepo currently holds a single app (`apps/desktop`); add a package only when a second one earns its existence.
- Errors shown to users are human sentences with a next step, never raw exceptions (MCP/auth/billing failures render as fix-it cards).
- Naming: the product is "VortSpec" (capital V, capital S); the methodology is "Spec-Driven Design Engineering" (SDD-DE).
- Definition of done per milestone: the PRD "Done when" passes end-to-end through the UI, new code has tests, and `pnpm build && pnpm test && pnpm lint` are green.
