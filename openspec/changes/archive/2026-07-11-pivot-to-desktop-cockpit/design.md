## Context

VortSpec v1 shipped a Next.js web app (`apps/web`) backed by a server-side design→code stack: `packages/ir` (Zod IR), `packages/pipeline` (Inngest import/analysis), `packages/llm` (OpenAI+Supabase LLM provider), `packages/adapters` (Figma REST→IR), `packages/codegen`, and a Supabase database. These are all interdependent — `ir` is the shared foundation imported by `pipeline`, `adapters`, and `codegen`.

PRD v2 replaces this entirely with an Electron desktop app that wraps the user's **local Claude Code**. The methodology (SDD-DE) and the v1 visual design system survive; the server-side machinery does not. `apps/desktop` already exists but only as a thin Electron shell that boots `apps/web` in a BrowserWindow — its main-process code and packaging config are reusable, its web-wrapping behavior is not.

Constraints: macOS first; no VortSpec account, no telemetry without opt-in, no provider keys ever; all model traffic belongs to Claude Code; child processes confined to the selected project folder and spawned with argument arrays. The existential dependency (PRD §13) is Anthropic policy on third-party wrappers of Claude Code — a launch gate to verify before any public ship.

## Goals / Non-Goals

**Goals:**
- Delete the v1 web stack cleanly while preserving it as a git tag and extracting the reusable design system and docs.
- Stand up an electron-vite + React + TypeScript-strict app whose renderer reuses the v1 `--color-vs-*` design tokens.
- Drive the exact SDD-DE CLI cycle through a guided UI: environment check, workspace/toolkit setup, design input, intake, stage stepper, artifact approval gates, live run view, dev preview, run history.
- Isolate all Claude Code CLI knowledge behind a single `AgentAdapter`.
- Keep flow state derivable from files on disk plus the run log so runs are cancelable and recoverable.

**Non-Goals:**
- Re-implementing any agent logic, methodology, or normalization pipeline. The app configures, launches, observes, and gates Claude Code; it never re-derives the SDD-DE steps.
- Maintaining a canonical IR store. Artifacts are plain files in the user's project; Zod validates only at parsing boundaries (IPC, run-event parsing, artifact frontmatter).
- Windows/Linux builds, code signing, and the v1 Inspector/graph/token viewers (all deferred past D4).

## Decisions

### D1: Delete the entire server-side stack, simplify to one package
Per PRD §2's discard list, all five packages die (not just the three §12 names literally). `packages/llm`, `adapters`, and `codegen` are the LLMProvider, Figma REST adapter, and own-codegen that v2 explicitly discards, and they depend on the deleted `ir`. Keeping any of them would leave dangling imports. **Alternative considered:** salvage `codegen`/`adapters` — rejected because Claude Code now does codegen and reaches Figma via the Figma MCP, so they have no consumer in v2.

### D2: Extract-then-tag-then-delete ordering
The design system is not in a `design/` dir (none exists); it lives in `apps/web/src/app/globals.css` + `components.json`. So the migration must **extract** those into the renderer and create `docs/` **before** deleting `apps/web`, then tag `archive/web-app-v1`, then delete. Reversing the order would lose the tokens or require recovering them from the tag.

### D3: Headless stream-json as primary, PTY as fallback
The AgentAdapter runs `claude -p … --output-format stream-json` and parses events (assistant text, tool calls, file edits, completion) into typed run events — this gives the renderer structured progress. A node-pty/xterm.js terminal exists for transparency (always one toggle away) and as the fallback for interactive moments the stream can't surface. **Alternative considered:** PTY-only (scrape the terminal) — rejected because it forfeits typed events and friendly progress. Exact flags and event shapes must be verified against current Claude Code docs at implementation time and live only inside the adapter.

### D4: AgentAdapter as the single CLI-knowledge boundary
One module owns every CLI flag and event-shape assumption. Renderer and flow code consume only typed, Zod-validated run events. This absorbs CLI drift (PRD §13) at one seam and makes the run view testable against recorded stream-json transcript fixtures without invoking a real CLI.

### D5: Zod at the boundaries only
Zod validates IPC contracts (main↔renderer), run-event parsing, and artifact frontmatter parsing — not a canonical data model. This preserves the v1 discipline (nothing crosses a boundary unvalidated) without resurrecting the retired IR-as-contract.

### D6: Evolve `apps/desktop` in place
Keep and adapt `src/{main,preload,process-manager,terminal-manager}.ts` (Claude CLI invocation, child-process management, IPC bridge), the electron-builder config, and `build/` icons; remove the web+inngest spawning; migrate the build to electron-vite and add the React renderer. **Alternative considered:** clean re-scaffold — rejected because the working main-process code, packaging, and icons are directly reusable.

### D7: State derived from disk
Flow state is reconstructed from project files plus the run log (`.vortspec/runs/`), not held only in memory. This makes crashed/hung runs recoverable and lets the app close and reopen mid-flow (PRD §9 resilience).

## Risks / Trade-offs

- **Anthropic wrapper policy (existential, launch gate)** → Verify current Anthropic policy and the correct wrapper self-identification in official docs before any public ship; treat as a D1 verification item, not a D4 afterthought.
- **CLI interface drift** (flags/stream formats evolve) → AgentAdapter isolation + recorded-transcript fixtures + a Claude Code version check with an in-UI compatibility notice.
- **Interactive moments in headless mode** (some steps need input streaming can't surface) → Explicit PTY fallback with designed (not improvised) seams between headless and interactive modes.
- **node-pty portability** (Windows path handling, process signals) → Isolate all PTY/process handling behind the PTY service; macOS first, Windows/Linux deferred.
- **Deleting interdependent packages breaks the build mid-migration** → Do deletions as one coherent step, then immediately rewrite `vitest.workspace.ts` (which hard-codes the 5 package configs) and rewire `apps/desktop` so `pnpm build`/`test` are green before moving on.
- **Scope temptation** (v1 Inspector/graph were compelling) → They return only post-D4, only as read-only viewers over artifact files, only if real usage asks.

## Migration Plan

1. **Extract** the design system (`apps/web/src/app/globals.css`, `components.json`) into the new renderer; create `docs/` with PRD v2 as primary and `docs/archive/` holding PRD v1 + `vortspec-ir-schemas.md` marked superseded.
2. **Tag** `git tag archive/web-app-v1` and push (preserves all web/pipeline/IR work outside the working tree; the local tag preserves it even if no remote exists).
3. **Delete** `apps/web`, all `packages/*`, `supabase/`, Inngest usage, and `apps/web/.env.local*`.
4. **Rewire root configs:** rewrite `vitest.workspace.ts` (drop the 5 package entries); light-touch `pnpm-workspace.yaml`/`turbo.json`/`tsconfig.base.json` (glob/generic); strip web+inngest spawning from `apps/desktop`.
5. **Scaffold** the electron-vite app (main process: environment manager, workspace manager, agent runner, PTY service, file watcher; renderer: the guided-flow surfaces) and add a root `CLAUDE.md` working agreement v2.
6. **Rollback strategy:** the pivot lives on a branch; if abandoned, `git checkout main` restores the web app, and `archive/web-app-v1` preserves it permanently regardless.

**Testing:** Vitest for main-process units (environment detection, adapter event parsing, workspace/toolkit ops); Playwright for renderer flows (onboarding, stepper, approval gates); recorded stream-json transcript fixtures for deterministic run-view tests without a live CLI.

## Open Questions

- Exact current Claude Code headless flags and stream-json event schema — verify against official docs at D1 implementation and encode only inside the AgentAdapter.
- The precise SDD-DE toolkit install/update mechanism to mirror the CLI's init — confirm against the toolkit source at D0.
- Anthropic's required wrapper self-identification mechanism — resolve before D1 completes (launch gate).
- Whether the monorepo collapses to a single root package immediately or keeps `apps/desktop` as one workspace until a second package earns its existence (PRD §12.4) — decide during D0 scaffolding.
