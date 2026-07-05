# Tasks — pivot-to-desktop-cockpit

Organized by the PRD's D0→D4 milestones. Each milestone ends with its PRD "Done when" acceptance check. Milestones are strictly ordered; do not start a milestone until the previous one's acceptance check passes end-to-end.

## 0. Launch-gate verification (do first, blocks public ship)

- [x] 0.1 Verify current Anthropic policy on third-party wrappers of Claude Code and the correct wrapper self-identification mechanism in official docs; record findings in `docs/`. Treat an unresolved answer as a blocker for any public build (PRD §13). → `docs/launch-gate-anthropic-policy.md` (compliant path confirmed for local dev: drive user's own non-bare `claude -p`; written Anthropic confirmation still required before public launch).
- [x] 0.2 Verify current Claude Code headless flags and the `stream-json` event schema against official docs; capture a real recorded transcript as a fixture for the AgentAdapter. → `docs/launch-gate-claude-code-headless.md` (flags + event types documented; live-transcript fixture capture deferred to task 3.3 when the adapter exists).

## 1. D0 — Migration & deletion (PRD §12)

- [x] 1.1 Extract the v1 design system out of `apps/web`: copy `src/app/globals.css` (the `--color-vs-*` tokens + `vs*` animations) and `components.json` into the new renderer's location. → `apps/desktop/src/renderer/src/styles/globals.css` + `apps/desktop/components.json`. (Trimmed `tw-animate-css`/`shadcn/tailwind.css` imports; re-add with shadcn in D2.)
- [x] 1.2 Create `docs/` with PRD v2 as the primary document and `docs/archive/` holding PRD v1 (`vortspec-prd.md`) and `vortspec-ir-schemas.md`, each marked superseded. → `docs/` (+ `docs/README.md`, `docs/archive/README.md` marking superseded).
- [x] 1.3 Tag and push the current main as `archive/web-app-v1` (local tag preserves it even if no remote exists). → annotated tag pushed to `origin` (commit 5e9adf5).
- [x] 1.4 Delete `apps/web`, all `packages/*` (`ir`, `pipeline`, `llm`, `adapters`, `codegen`), `supabase/`, all Inngest config/usage, and `apps/web/.env.local*`. (env files went with `apps/web`.)
- [x] 1.5 Rewrite `vitest.workspace.ts` (drop the 5 deleted package entries); light-touch review `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`. → vitest workspace now globs `apps/*`; turbo build outputs `out/**`+`dist/**`; pnpm-workspace/tsconfig.base unchanged (glob/generic).
- [x] 1.6 Strip the web+inngest spawning from `apps/desktop` (`process-manager.ts`, `main.ts`, tray menu) while keeping the reusable Claude-CLI and child-process code. → old flat `main/preload/process-manager/terminal-manager.ts` removed. NOTE: the AgentAdapter (D1, task 3.1) is rebuilt fresh against the verified stream-json contract rather than salvaging the old single-shot `claude --print` manager; the old code is preserved in `archive/web-app-v1` + branch history.
- [x] 1.7 Create a root `CLAUDE.md` working agreement v2 (invariants: spec-first gates, explicit approvals, no silent mutation, user's-own-Claude, no provider keys stored, macOS-first); fold relevant `DEMO.md` content. → `CLAUDE.md` created; `DEMO.md` removed.
- [x] 1.8 Confirm `pnpm install && pnpm build` are green after deletion (no dangling workspace refs or imports). → `pnpm build` (turbo) green + `typecheck` (node+web) green.

## 2. D0 — Electron skeleton & environment check

- [x] 2.1 Migrate `apps/desktop` build to electron-vite; keep the electron-builder config and `build/` icons; app boots to an empty React + Tailwind renderer using the extracted `globals.css` tokens. → electron-vite + React 19 + Tailwind v4 (`@tailwindcss/vite`); main/preload/renderer restructure; placeholder cockpit `App.tsx` uses the `vs` tokens. Build green; live GUI boot to be confirmed by running `pnpm --filter @vortspec/desktop dev` on a machine with a display.
- [x] 2.2 Implement the main-process environment manager: detect Node version, git, Claude Code install, and Claude Code login state. → `src/main/environment/env-manager.ts`. **Verified against the real machine** (Node/git/Claude Code detected, zod-valid report). Login is a lazy on-demand probe (non-bare `claude -p`) so a routine scan spends no usage; interactive login moves into the embedded terminal in D1.
- [x] 2.3 Define the zod-validated IPC contract layer (main↔renderer) and the preload bridge. → `src/shared/ipc.ts` (contract), `src/main/ipc.ts` (validated registration), `src/preload/index.ts` (typed bridge). Every request+response is zod-parsed at the boundary.
- [x] 2.4 Build the environment-check screen: one pass/fail row per check with fix actions (install link; "open login" running the login flow in the embedded terminal), re-evaluating on completion (`environment-check`). → `src/renderer/src/views/EnvironmentCheck.tsx`. Install-link + verify-login fix actions work; embedded-terminal login is deferred to D1 (PTY) with an interim instruction, per the `/login`-is-interactive-only finding.
- [x] 2.5 Implement the workspace manager: project folder selection/creation, confining child processes to that folder (`workspace-toolkit`). → `src/main/workspace/workspace-manager.ts` (dialog folder pick, JSON registry in userData, disk-derived hydration).
- [x] 2.6 Implement SDD-DE toolkit detection, install, and update, reporting the installed version (`workspace-toolkit`). → detection via `toolkit-manager.ts` (`.sdd-de/project.yaml` + skills). **Install is now done in-app, non-interactively**: `setup-manager.createProject` performs the CLI's init file-ops (copy skills/docs from the bundled `@royvillasana/sdd-de` dep, write `.sdd-de/project.yaml`, symlink `.claude/skills/`, update `.gitignore`) driven by the GUI wizard — no PTY, no terminal. **Verified end-to-end** (exact CLI `project.yaml`, skills+docs copied, symlinks created). No installed-version marker exists, so version shows "installed".
- [x] 2.7 Build the project dashboard listing known projects (name, path, toolkit version, last run status, quick actions), reusing v1 dashboard visual language (`workspace-toolkit`). → `src/renderer/src/views/Dashboard.tsx` (cards, empty state, add-project, install-toolkit, open-folder; open-flow disabled until D1).
- [ ] 2.8 **D0 acceptance:** a fresh machine reaches a ready project in under 5 minutes, entirely through the UI. → Env detection verified real + build/typecheck green. Remaining to close: (a) live GUI boot (run `pnpm --filter @vortspec/desktop dev` on a machine with a display), (b) the real SDD-DE toolkit install command (task 2.6 seam).

## 3. D1 — First wrapped run (AgentAdapter + run view)

- [x] 3.1 Implement the `AgentAdapter` interface as the single owner of Claude Code CLI flags and event shapes; spawn headless with `--output-format stream-json` using arg arrays in the project folder (`agent-runner`). → `src/main/agent/adapter.ts` (non-bare `claude -p`, arg arrays, line-buffered stdout). **Verified end-to-end** against a fake `claude` binary: spawn→buffer→parse→exit all correct.
- [x] 3.2 Parse the stream into typed, zod-validated run events (assistant text, tool call, file edit, completion); surface malformed events as adapter errors (`agent-runner`). → `src/main/agent/events.ts` + `src/shared/run-events.ts` (contract); run-manager re-validates every event before it crosses IPC; malformed line → `error` event.
- [x] 3.3 Add Vitest unit tests for the adapter's event parsing against the recorded transcript fixture from task 0.2 (`agent-runner`). → `src/main/agent/events.test.ts` (8 tests, green). Fixture `__fixtures__/enrich-brief.stream.jsonl` synthesized from the official stream-json docs; replace with a live-recorded transcript when 3.7 runs.
- [x] 3.4 Build the run view: live current task, files created/edited with paths, tool activity, and a friendly log (`run-view`). → `src/renderer/src/views/RunView.tsx` (streaming text, files-touched, activity log, cost/status).
- [x] 3.5 Wire the ~~node-pty/xterm.js embedded terminal~~ and the friendly↔raw terminal toggle (`run-view`). → friendly↔raw toggle implemented; raw view shows actual Claude Code stdout. DEVIATION: true node-pty/xterm is deferred to D3 (dev-preview), the first milestone that needs an interactive TTY — headless runs are piped stdout, so a monospace raw panel is the honest representation here.
- [x] 3.6 Implement clean cancel that kills the child process without corrupting flow state (`run-view`). → `AgentAdapter.cancel()` (SIGTERM→SIGKILL after 2s); run-manager de-registers; renderer keeps derived state.
- [ ] 3.7 Run one real SDD-DE step (intake + enrich-brief) headless against a project via the adapter. → Plumbing complete and RunView wired; needs a logged-in Claude Code + a project with the SDD-DE toolkit. Run on your Mac and capture the transcript to replace the synthesized fixture.
- [ ] 3.8 **D1 acceptance:** the intake + enrich-brief step completes end-to-end from the UI, with live progress, working terminal toggle, and working cancel. → Blocked on 3.7 (live login/toolkit + display).

## 4. D2 — Full guided flow (stepper, intake, gates)

- [x] 4.1 Build the guided SDD stepper rendering the CLI's steps as stage cards with status (pending/running/needs-review/approved/failed), summary, and artifacts (`guided-sdd-flow`). → `shared/flow.ts` + `views/GuidedFlow.tsx`. **Now aligned to the real `@royvillasana/sdd-de` mandatory cycle**: brief → `/enrich-brief` → `/generate-artifacts` → apply → `/visual-verify` → `/sync-tokens` → `/commit`, invoking the installed skills; gated artifacts resolve dynamic `specs/[feature]/…` paths by suffix. **Verified end-to-end.**
- [x] 4.2 Build the design-input surface: Figma link (via user's Figma MCP), dropped ZIP placed at the expected input path, existing folder/repo; render MCP-misconfiguration as a fix-it card (`design-input`). → `DesignInputStage` (Figma link + folder). MCP-misconfig surfaces from `system/init` events as a warning in `RunPanel`; a richer drag-drop ZIP + dedicated fix-it card can be enriched later.
- [x] 4.3 Build the intake wizard rendering the CLI's CTO-style discovery questions; write answers to the project in the skills' expected format as plain files, then run the corresponding step (`intake-forms`). → Two parts: (a) **`NewProjectWizard`** renders the CLI's full init questionnaire (design source: Figma/library/GitHub/ZIP/Stitch + branch follow-ups, framework, language, styling with auto-suggestion, token file, component dir, test runner) **before project creation** → writes `.sdd-de/project.yaml`; (b) the per-cycle `BriefStage` writes `.sdd-de/brief.md`. **Verified end-to-end.**
- [x] 4.4 Implement artifact gates: pause the flow in "needs review", render the artifact as a formatted document, with Approve (advance) and Request changes (feed notes back to the agent for revision); block all downstream work until approval (`artifact-gates`). → `ArtifactGate` + flow-manager `approveStage`/`requestChanges`; downstream stages locked until current is approved. **Verified** (needs-review → notes persisted → approve advances).
- [ ] 4.5 Render verification stages (visual-verify, adversarial review) as severity-tagged review cards, each approvable or sendable back, reusing v1 issue/patch-card visuals (`guided-sdd-flow`). → PARTIAL: the verify stage runs as an agent stage; parsing findings into per-severity approvable cards is not yet done (needs the real verification output shape).
- [ ] 4.6 Implement the PTY fallback path for interactive steps the headless stream can't surface, with explicit headless↔interactive seams (`agent-runner`). → Deferred to D5/7.1 (the real node-pty terminal lands there); tracked.
- [x] 4.7 Ensure flow state is derived from files on disk plus the run log so the app can close and reopen mid-flow (`run-view` state model). → `flow-manager` persists to `.vortspec/flow.json` and reconciles on read. **Verified** (fresh read reflects disk).
- [ ] 4.8 Add Playwright tests for the stepper, intake, and approval-gate flows. → Deferred: needs an Electron display harness; flow-manager logic is covered by the end-to-end harness run for now.
- [ ] 4.9 **D2 acceptance:** a ZIP design in → approved specs → generated component code in the local folder, entirely through the UI. → Blocked on a live logged-in run + real toolkit + display (same gate as 3.7/3.8).

## 5. D3 — Dev preview + history

- [ ] 5.1 Implement dev-environment detection from the project's `package.json` scripts and run it in a managed PTY session (`dev-preview`).
- [ ] 5.2 Render the dev server URL in an embedded preview panel with an open-in-browser escape hatch and server logs in the terminal view; stop the PTY cleanly (`dev-preview`).
- [ ] 5.3 Implement local run recording as plain files under `.vortspec/runs/` (stages, timestamps, artifacts, approval decisions, outcome), git-ignorable by user choice (`run-history`).
- [ ] 5.4 Build the run-history timeline reusing v1 history visuals, with openable per-run detail (`run-history`).
- [ ] 5.5 **D3 acceptance:** the generated component is visible running locally inside the app.

## 6. D4 — Distribution

- [ ] 6.1 Produce packaged macOS builds via electron-builder (dmg), reusing the existing icons.
- [ ] 6.2 Implement opt-in auto-update (update checks are the only network calls VortSpec itself makes).
- [ ] 6.3 Onboarding polish pass over the environment-check → ready-project flow.
- [ ] 6.4 Begin Windows/Linux builds: audit node-pty, path handling, and process-signal handling behind the PTY service.
- [ ] 6.5 Defer code signing (tracked, not done in this milestone unless the launch gate requires it).
- [ ] 6.6 Publish the installer package as a GitHub release and surface its download link on the SDD/SDE page. (User provides the release/repo link; wire it into the app's "get the desktop app" / update-check location.)

## 7. D5 — Guided first-run automation (`first-run-automation`)

> Added per user request: after install + prior milestones, automate the three onboarding steps. Depends on the real PTY (built here / carried from D3) since Claude Code `/login` is interactive-only.

- [ ] 7.1 Build the real node-pty/xterm.js embedded terminal service (the deferred D1/3.5 piece), isolated behind a PTY service so Windows portability is a contained change.
- [ ] 7.2 First-run setup surface: a one-click guided sequence (terminal → Claude auth → Figma MCP) with per-step status, resumable and idempotent (re-detects completed steps).
- [ ] 7.3 Step 1 — open a terminal session in the embedded PTY as part of setup.
- [ ] 7.4 Step 2 — run the Claude Code login flow in the PTY (browser OAuth); detect completion and re-verify login with no app restart; store no credentials. Skip when already logged in.
- [ ] 7.5 Step 3 — detect the Figma MCP in the user's Claude Code config (from `system/init` MCP data and/or `claude mcp` inspection); when absent, offer + run the install in the terminal and verify; skip when present.
- [ ] 7.6 **D5 acceptance:** a freshly installed app reaches terminal-open + Claude Code authenticated + Figma MCP present, entirely through the guided setup.
