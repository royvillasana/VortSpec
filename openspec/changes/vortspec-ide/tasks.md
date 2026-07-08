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

- [x] 3.1 Added `monaco-editor` to `apps/ide`; language workers wired under electron-vite via `?worker` (bundled, no CDN); `<CodeEditor>`/`<DiffView>` wrappers + `monaco/setup.ts` isolate all Monaco setup.
- [x] 3.2 Core file handlers in `@vortspec/core`: `workspace:listDir`/`readFile`/`writeFile` + `git:fileAtHead`, all via `resolveInside` (path-escape guard, 5 unit tests); the renderer never touches `fs`.
- [x] 3.3 Lazy file-tree Explorer wired to `listDir` + the watch event; expand/collapse, open file into a tab, refresh.
- [x] 3.4 Editor tabs with dirty markers + Cmd/Ctrl-S save via the core handler; multiple open files with per-path Monaco models.
- [x] 3.5 Workspace watcher (recursive `fs.watch` in core; chokidar-swap-ready) → `onWorkspaceChange`; Explorer refreshes loaded dirs; open editor shows a non-destructive "changed on disk — reload?" banner for dirty files (clean files silently reload).
- [x] 3.6 Git diffs in Monaco's diff editor via a Diff-vs-HEAD toggle (original from `git show HEAD:<path>`), additive-only guardrails intact.
- [x] 3.7 CT (Explorer expand, tabs open/close, diff toggle) + unit (path-escape guard).
- [x] 3.8 Gate: `pnpm build && pnpm test && pnpm lint` green (4/6/4); 8 IDE CT; core 133 vitest; desktop 54 CT unaffected. **I2 complete.**

## 4. I3 — Integrated terminal (both apps)

- [x] 4.1 `node-pty` in `packages/core`; PTY session manager (create/write/resize/kill) spawning the user's login shell in the workspace root via an argument array — never a shell string from app input. Externalized + asarUnpack'd in both apps for the `dist` rebuild; a root postinstall restores node-pty's spawn-helper +x bit (pnpm store drops it).
- [x] 4.2 Terminal IPC in `core`: `terminal:create/write/resize/kill` + an `onTerminalData` (`TERMINAL_DATA_CHANNEL`) stream; sessions keyed by a renderer id; torn down on quit (`stopAllTerminals`). Unit-tested headlessly (real spawn).
- [x] 4.3 `@xterm/xterm` + fit/web-links addons in `packages/ui`; a `<Terminal>` component wired to the core IPC (keystrokes in, output streamed back, PTY resizes with the viewport via ResizeObserver, killed on unmount).
- [x] 4.4 Mounted as a bottom panel in `apps/ide` (Ctrl-` + status-bar toggle) and backfilled into `apps/desktop` (status-bar toggle over the active project).
- [x] 4.5 Interactive use verified: the real-PTY unit test writes `echo …` and receives the relayed output; resize is exercised; Ctrl-C and interactive prompts flow through the same `write()` relay.
- [x] 4.6 CT (terminal toggle mounts xterm) + unit test for the PTY session manager (buildShell, spawn/relay/resize/kill, dup-id, cleanup).
- [x] 4.7 Gate: `pnpm build && pnpm test && pnpm lint` green (4/6/4); 9 IDE CT; core 137 vitest; desktop 54 CT. **I3 complete.**

## 5. I4 — Live preview pane

- [x] 5.1 `<PreviewPane>` embeds the running app (`startAppServer`/`appServerStatus`) or Storybook (`startDevServer`/`devServerStatus`) via the shared `ServerKind`-keyed dev-server; checks status first and attaches to an existing server (never double-starts).
- [x] 5.2 CodeWorkspace stacked ↔ side-by-side layout toggle (editor state preserved — the container reflows without remounting) + preview show/hide; start-on-demand button when nothing is running.
- [x] 5.3 The embedded server hot-reloads in the iframe (its own HMR); `no-script`/`error` states render as fix-it cards, not raw logs.
- [x] 5.4 CT: attach-to-running (no double-start), start-on-demand, fix-it card, layout toggle + hide.
- [x] 5.5 Gate: `pnpm build && pnpm test && pnpm lint` green (4/6/4); 13 IDE CT; desktop 54 CT. **I4 complete.**

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
