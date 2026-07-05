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
- [ ] 2.2 Implement the main-process environment manager: detect Node version, git, Claude Code install, and Claude Code login state.
- [ ] 2.3 Define the zod-validated IPC contract layer (main↔renderer) and the preload bridge.
- [ ] 2.4 Build the environment-check screen: one pass/fail row per check with fix actions (install link; "open login" running the login flow in the embedded terminal), re-evaluating on completion (`environment-check`).
- [ ] 2.5 Implement the workspace manager: project folder selection/creation, confining child processes to that folder (`workspace-toolkit`).
- [ ] 2.6 Implement SDD-DE toolkit detection, install, and update, reporting the installed version (`workspace-toolkit`).
- [ ] 2.7 Build the project dashboard listing known projects (name, path, toolkit version, last run status, quick actions), reusing v1 dashboard visual language (`workspace-toolkit`).
- [ ] 2.8 **D0 acceptance:** a fresh machine reaches a ready project in under 5 minutes, entirely through the UI.

## 3. D1 — First wrapped run (AgentAdapter + run view)

- [ ] 3.1 Implement the `AgentAdapter` interface as the single owner of Claude Code CLI flags and event shapes; spawn headless with `--output-format stream-json` using arg arrays in the project folder (`agent-runner`).
- [ ] 3.2 Parse the stream into typed, zod-validated run events (assistant text, tool call, file edit, completion); surface malformed events as adapter errors (`agent-runner`).
- [ ] 3.3 Add Vitest unit tests for the adapter's event parsing against the recorded transcript fixture from task 0.2 (`agent-runner`).
- [ ] 3.4 Build the run view: live current task, files created/edited with paths, tool activity, and a friendly log (`run-view`).
- [ ] 3.5 Wire the node-pty/xterm.js embedded terminal and the friendly↔raw terminal toggle (`run-view`).
- [ ] 3.6 Implement clean cancel that kills the child process without corrupting flow state (`run-view`).
- [ ] 3.7 Run one real SDD-DE step (intake + enrich-brief) headless against a project via the adapter.
- [ ] 3.8 **D1 acceptance:** the intake + enrich-brief step completes end-to-end from the UI, with live progress, working terminal toggle, and working cancel.

## 4. D2 — Full guided flow (stepper, intake, gates)

- [ ] 4.1 Build the guided SDD stepper rendering the CLI's steps as stage cards with status (pending/running/needs-review/approved/failed), summary, and artifacts (`guided-sdd-flow`).
- [ ] 4.2 Build the design-input surface: Figma link (via user's Figma MCP), dropped ZIP placed at the expected input path, existing folder/repo; render MCP-misconfiguration as a fix-it card (`design-input`).
- [ ] 4.3 Build the intake wizard rendering the CLI's CTO-style discovery questions; write answers to the project in the skills' expected format as plain files, then run the corresponding step (`intake-forms`).
- [ ] 4.4 Implement artifact gates: pause the flow in "needs review", render the artifact as a formatted document, with Approve (advance) and Request changes (feed notes back to the agent for revision); block all downstream work until approval (`artifact-gates`).
- [ ] 4.5 Render verification stages (visual-verify, adversarial review) as severity-tagged review cards, each approvable or sendable back, reusing v1 issue/patch-card visuals (`guided-sdd-flow`).
- [ ] 4.6 Implement the PTY fallback path for interactive steps the headless stream can't surface, with explicit headless↔interactive seams (`agent-runner`).
- [ ] 4.7 Ensure flow state is derived from files on disk plus the run log so the app can close and reopen mid-flow (`run-view` state model).
- [ ] 4.8 Add Playwright tests for the stepper, intake, and approval-gate flows.
- [ ] 4.9 **D2 acceptance:** a ZIP design in → approved specs → generated component code in the local folder, entirely through the UI.

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
