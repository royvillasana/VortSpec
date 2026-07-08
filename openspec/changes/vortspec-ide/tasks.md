# Tasks — VortSpec IDE

Milestones I0→I5 are strictly ordered. I0 must leave the cockpit fully green before any IDE work begins. Each milestone ends with `pnpm build && pnpm test && pnpm lint` green.

## 1. I0 — Extract the shared core (no behavior change)

- [x] 1.1 Create `packages/core` workspace package (source-only `.ts` exports, tsconfig, Turborepo pipeline, excluded from electron-vite externalize so Vite bundles it). `packages/ui` still to come in 1.5.
- [x] 1.2 Move `apps/desktop/src/shared/*` (Zod IPC contracts + types) into `packages/core/src/shared`; repoint all 66 import sites to `@vortspec/core/*`.
- [x] 1.3 Move the headless `main/*` engine into `packages/core/src/main`: AgentAdapter, run-manager/recorder, Git adapter + providers (github/gitlab/bitbucket), tasks/Jira + link-store, readers/parsers (tokens, components, manifest, usage), dev-server, profile/settings, environment, flow — and relocate their 23 Vitest suites alongside.
- [x] 1.4 Expose `registerIpc` (+`stopAllDevServers`/`fixGuiPath`) from `@vortspec/core/main` as the sole IPC definition; the app's `main/index.ts` is now a thin shell that mounts it.
- [x] 1.4b Single-source the SDD-DE procedure prompts: extract the build/re-scan/verify/resume/refactor prompt builders from `GuidedFlow` into `@vortspec/core/sdd-prompts`.
- [x] 1.5a Move the reusable UI **foundation** into `packages/ui`: shared primitives (ui.tsx Button/Card/Spinner, Logo, Markdown), RunProgress, RunPanel, ProjectRail, and the pure `run-model`/`run-progress` libs (+12 vitest). Wire Tailwind v4 cross-package content scanning via `@source` (A/B-verified necessary).
- [x] 1.5b Move the **api-coupled** surfaces into `packages/ui`: lifted the `VortSpecApi` type into `@vortspec/core/api` (renderer-safe, return types derived from the IPC contract, `Window.vortspec` declared once; preload annotated as the conformance check); moved `api.ts`, `useAgentRun`, `AssistantDock`, and the shared panels (Source Control, Run app, Tasks, Tokens/Inspector, Manifest, Profile) + their CT specs into `ui`.
- [x] 1.6a Repoint `apps/desktop` renderer to import the UI foundation + `vs-*` scanning from `@vortspec/ui`; local copies deleted.
- [x] 1.6b Repoint the remaining panels; the cockpit renderer is now just its shell (router + onboarding/guided-flow orchestration screens).
- [x] 1.7 Verify no React/Electron-renderer/Monaco import leaks into `packages/core` (checked; clean).
- [x] 1.8 Gate: `pnpm build && pnpm test && pnpm lint` green — core 128 + ui 12 = 140 vitest, 54 CT, typecheck (core/ui/desktop). **I0 complete.**

## 2. I1 — IDE application shell

- [x] 2.1 Scaffolded `apps/ide` (electron-vite + React + Tailwind with the shared `vs-*` tokens via `@vortspec/ui/styles/tokens.css`); `main/index.ts` mounts `registerIpc` from `@vortspec/core/main`; preload is the shared `@vortspec/core/preload` bridge (same `window.vortspec`).
- [x] 2.2 Four-region layout shell: Activity bar (left), working area (Explorer + editor + live-preview placeholders for the code activity), assistant chat (right). Splitters/real editor land in I2/I4.
- [x] 2.3 Activity bar switches the working area among the code view (Explorer) and the reused `@vortspec/ui` panels — Source Control / Tokens (Inspector) / Tasks / Manifest — their nav wired to the activity switcher. (Compacting the panels into a true narrow sidebar is a later refinement — noted in design open questions.)
- [x] 2.4 Workspace open/switch via the shared workspace handlers (folder picker + recent projects); all actions scoped to the workspace root; raw-form escape hatch (reveal in Finder) in the Explorer.
- [x] 2.5 Playwright CT for the IDE shell (picker + recents, four regions render, activity-bar switching, chat collapse) — reuses the cockpit's mock bridge; 4 specs green.
- [x] 2.6 Gate: `pnpm build && pnpm test && pnpm lint` green across all 4 packages; IDE typecheck + 4 CT; desktop 54 CT unaffected. **I1 complete.**

## 3. I2 — Code workspace (Monaco + Explorer + files)

- [ ] 3.1 Add `monaco-editor` to `apps/ide`; wire language workers under electron-vite (bundled, no CDN); `<CodeEditor>` wrapper isolating all Monaco setup.
- [ ] 3.2 Add `core` file handlers: list-tree, read, save, watch — all resolving strictly within the workspace root with a path-escape guard; renderer never touches `fs`. Unit-test the path-escape guard.
- [ ] 3.3 File-tree Explorer component wired to the list-tree/watch handlers; expand/collapse, open file into an editor tab.
- [ ] 3.4 Editor tabs with dirty/save state; save persists via the core handler; multiple open files.
- [ ] 3.5 Workspace file watcher (chokidar in core) → `onWorkspaceChange` IPC event; Explorer refreshes; open editor shows "changed on disk — reload?" without clobbering unsaved edits.
- [ ] 3.6 Git diffs in Monaco's diff editor fed by the shared Git adapter (`getDiff`), honoring additive-only guardrails.
- [ ] 3.7 CT/unit for file ops (open/save/dirty, on-disk-change affordance, diff render).
- [ ] 3.8 Gate: `pnpm build && pnpm test && pnpm lint` green.

## 4. I3 — Integrated terminal (both apps)

- [ ] 4.1 Add `node-pty` to `packages/core`; PTY session manager (create/write/resize/kill) spawning the user's shell in the workspace root; rebuild against Electron's ABI in the `dist` step. Never interpolate app-controlled input into a shell string.
- [ ] 4.2 Terminal IPC surface in `core`: `terminal.create/write/resize/kill` handlers + an `onTerminalData` streaming event; sessions keyed per workspace; clean teardown on close/quit (no leaked processes). Unit-test the session manager headlessly.
- [ ] 4.3 Add `xterm` + fit/link addons to `packages/ui`; a `<Terminal>` component wired to the core IPC (data stream, input, resize-follows-viewport).
- [ ] 4.4 Mount the terminal panel in `apps/ide` (bottom panel, workspace-scoped) and backfill it into `apps/desktop` (cockpit gains the terminal).
- [ ] 4.5 Verify interactive use: run the local host/dev command, Ctrl-C interrupt, and an interactive CLI prompt relay; resize keeps output aligned.
- [ ] 4.6 CT for the terminal component + unit test for the PTY session manager.
- [ ] 4.7 Gate: `pnpm build && pnpm test && pnpm lint` green in both apps.

## 5. I4 — Live preview pane

- [ ] 5.1 Embed the app/Storybook runtime beside the editor via the shared dev-server (`startAppServer`/dev-server, `ServerKind`-keyed); attach to an existing server, never double-start.
- [ ] 5.2 Preview layout toggle (stacked ↔ side-by-side) preserving editor state; start-on-demand when no server is running.
- [ ] 5.3 Confirm hot-reload: saved edits reflect in the preview; surface server errors as fix-it cards, not raw logs.
- [ ] 5.4 CT for preview (attach-not-double-start, toggle, error card).
- [ ] 5.5 Gate: `pnpm build && pnpm test && pnpm lint` green.

## 6. I5 — Vibe-engineering (chat + run pipeline)

- [ ] 6.1 Mount AssistantDock (modify mode) in the right rail, wired to the shared run pipeline (AgentAdapter, non-bare, user's login, `bypassPermissions`).
- [ ] 6.2 Seed each run with the open file path + preview URL as context.
- [ ] 6.3 Spec-first gates: gated-artifact generation (brief/spec/`DESIGN.md`) routes through the shared approval-recording path; nothing advances without a recorded approval.
- [ ] 6.4 Observable + resumable runs in the IDE via the shared run-manager/recorder (holistic progress, surfaced blockers, resume-after-interruption across restarts).
- [ ] 6.5 Failures render as fix-it cards (auth/MCP/billing/missing binary), never raw exceptions.
- [ ] 6.6 CT for the chat/run integration (context seeding, gate enforcement, resume affordance, fix-it card).
- [ ] 6.7 Gate: `pnpm build && pnpm test && pnpm lint` green.

## 7. I6 — Procedure parity, packaging, release

- [ ] 7.1 Surface the SDD-DE pipeline (foundation → build → verify → docs → `DESIGN.md`) inside the IDE as an Explorer panel driven entirely by `@vortspec/core`; confirm a procedure edit in `core` shows up in both apps (parity check).
- [ ] 7.2 End-to-end validation through the IDE UI: open a workspace, run the pipeline, edit code in Monaco, use the terminal, see the live preview, view a Git diff, vibe-engineer a change with the gates intact.
- [ ] 7.3 Add `apps/ide` to the release pipeline: `pnpm run dist` → codesign → hdiutil dmg → GitHub release; second download on the site.
- [ ] 7.4 Update docs (the website documentation screen) to cover the two-app model, the terminal, and the IDE workflow.
- [ ] 7.5 Final gate: `pnpm build && pnpm test && pnpm lint` green; both apps package and launch on macOS.
