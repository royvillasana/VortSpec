## Context

VortSpec v2 is a single Electron app (`apps/desktop`) with a clean main/renderer/shared split: `shared/` (Zod IPC contracts), `main/` (AgentAdapter, run-manager, Git adapter + providers, task/Jira layer, readers/parsers, dev-server, usage/profile), and `renderer/src/views` (Guided flow, Source Control, Run app, Tasks, Tokens, Manifest, Profile, Playground) plus `renderer/src/components` (RunPanel, RunProgress, AssistantDock) and `styles/globals.css` (`vs-*` tokens). All engine logic already lives behind adapters — the AgentAdapter is the only thing that knows Claude Code flags; Git/providers already enforce additive-only guardrails; readers already parse files on disk.

The user wants a second product: a **design-engineering IDE** (Electron + Monaco, VS Code–style layout) that shares the *entire* pre-`DESIGN.md` SDD-DE procedure with the cockpit. The binding constraint from the user: *"whatever update we do on the [board/spec] procedure that is happening before they get the design.md file … has to be adopted in the two apps."* This makes a shared, single-source-of-truth core non-negotiable — not a copy-paste of the cockpit.

The monorepo is pnpm workspaces + Turborepo and today holds exactly one app; CLAUDE.md says to add a package "only when a second one earns its existence." A second app that must share the procedure is precisely that trigger.

## Goals / Non-Goals

**Goals:**
- Extract the app-agnostic engine into `packages/core` and the reusable panels into `packages/ui`, so **one code path** implements the SDD-DE procedure for both apps. A procedure change edits `packages/core` once.
- Ship `apps/ide`: a VS Code–style Electron shell — Explorer/Activity sidebar, Monaco editor group, live preview pane, right-hand assistant chat — reusing the cockpit's main process and IPC unchanged.
- Refactor `apps/desktop` to consume the packages with **zero behavior change** and all existing tests green.
- Keep every v2 invariant: Claude Code is the engine (non-bare, user's login), spec-first gates, additive-only Git, local-first/transparent, no keys/telemetry, macOS-first with isolated PTY/process code.

**Non-Goals:**
- Forking Code-OSS / shipping an extension marketplace or an integrated debugger. Monaco gives editing; a real integrated terminal (node-pty + xterm) IS in scope (see D8) and ships to both apps, but a debugger and extension host are not.
- Changing the SDD-DE *methodology* (lives in Claude Code skills/CLAUDE.md) or re-implementing agent logic. The IDE configures/launches/observes/gates runs, same as the cockpit.
- Windows/Linux packaging of the IDE (deferred past this change, same as the cockpit's D4 boundary).
- A second main process. Both apps run the **same** main-process handlers; only the renderer shell differs.

## Decisions

### D1 — Electron + Monaco, not a Code-OSS fork
Chosen after weighing three options. A **fork of Code-OSS** gives maximum IDE fidelity but imposes a permanent monthly rebase against upstream and forces every existing React panel to be re-implemented as VS Code contributions (tree views / webviews / custom editors) — and, fatally for the user's constraint, the shared *UI* of the procedure could not be reused, only headless logic. A **VS Code extension** is lowest-maintenance but is an add-on, not a product, with the least layout control. **Electron + Monaco** keeps 100% of our React panels, adds VS Code's own editor engine (Monaco), shares the procedure trivially (both apps are the same stack importing `packages/core`/`packages/ui`), and carries no fork-rebase tax. Monaco is a normal npm dependency; the only integration cost is worker wiring under electron-vite. → Electron + Monaco.

### D2 — Package boundary: `core` (headless) vs `ui` (renderer) vs app shells
- `packages/core`: **no React, no Electron-renderer imports.** Everything that is app-agnostic: `shared/*` Zod contracts + types (the IPC surface both apps speak), and the `main/*` engine — AgentAdapter, run-manager/recorder, Git adapter + providers, tasks/Jira, readers/parsers (tokens/components/manifest/usage), dev-server, profile/settings. This is a main-process + shared library. Its Vitest suites move with it.
- `packages/ui`: the reusable **renderer** — the `vs-*` tokens (`globals.css`), shared components (RunPanel, RunProgress, AssistantDock, cards), and the panels that are identical across apps (Source Control, Run app, Tasks, Tokens, Manifest, Profile, and the guided-flow building blocks). Depends on `core` for types only. Its Playwright CT specs move with it.
- `apps/desktop`: the cockpit **shell** (dashboard, setup wizard, guided-flow orchestration screen, window chrome) + its `main/index.ts` that mounts `core`'s IPC handlers. Thin.
- `apps/ide`: the IDE **shell** (VS Code layout + Monaco + Explorer) + its own `main/index.ts` that mounts the **same** `core` IPC handlers. Thin.

Rationale: the split is along the existing main/shared/renderer seam, so extraction is mostly *moves*, not rewrites. Alternative considered — one mega-package — rejected because it would drag Monaco/React into the headless surface and blur the "core has no UI" line that keeps the two shells swappable.

### D3 — One main process contract, two shells
Both apps register the identical IPC handler set from `core` (`registerIpc(ipcMain, …)`), so `preload` and the `window.vortspec` API are the same in both. The renderer difference is purely layout/navigation. This is what mechanically enforces "a procedure change lands in both": the handlers *are* the procedure, and they live once in `core`. Alternative — a shared main but per-app handler registration — rejected as an opportunity for drift.

### D4 — IDE layout: four regions, our panels as the content
```
┌──────┬───────────────┬──────────────────┬──────────┐
│      │  Explorer      │  Editor group    │          │
│ Act. │  (file tree,   │  (Monaco:        │  Assist. │
│ bar  │   Source       │   open files,    │  chat    │
│      │   Control,     │   tabs, diffs)   │  (dock,  │
│ icons│   Tokens,      ├──────────────────┤  modify- │
│      │   Tasks,       │  Live preview    │  capable)│
│      │   Manifest)    │  (screens / app) │          │
└──────┴───────────────┴──────────────────┴──────────┘
```
The Activity bar switches what the sidebar shows (Explorer / Source Control / Tokens / Tasks / Manifest — our existing panels from `packages/ui`). The center is a split: Monaco editor on top, live preview below (or side-by-side, user-toggled) — this realizes "screens on one side, code on the other." The right rail is the AssistantDock we already have. Rationale: it maps our existing surfaces 1:1 onto VS Code muscle memory without inventing new interaction models.

### D5 — Monaco integration under electron-vite
Monaco ships web workers (ts/json/css/html). Under electron-vite we load them via `monaco-editor/esm/vs/editor/editor.worker` with `self.MonacoEnvironment.getWorker`, bundled by the renderer Vite config — no CDN (offline/local-first, and matches the Artifact-style CSP posture). Diffs use Monaco's `createDiffEditor` fed by our Git adapter's `getDiff`. File watching uses a `chokidar` watcher in `core` surfaced over IPC (new `onWorkspaceChange` event) so the Explorer/editor react to on-disk changes from agent runs — reinforcing invariant 6 (state derivable from files). Alternative — CodeMirror — rejected: Monaco is literally VS Code's editor, giving the requested "same as VS Code" feel for free.

### D6 — File operations stay in `core`, gated and safe
Open/read/save/list-tree run through new `core` handlers that (a) resolve only within the selected workspace root (path-escape guard, mirroring the existing `execFileSafe`/cwd discipline), (b) never touch Git history destructively, and (c) emit change events. The renderer never does raw `fs`. This keeps invariant 7 (safe process/file handling) and keeps the IDE's editing auditable.

### D8 — Integrated terminal: node-pty in `core`, xterm in `ui`, both apps
A real interactive terminal is the standard node-pty (main-process PTY) + xterm.js (renderer) pairing. The PTY layer lives in `packages/core` (spawned in the workspace root, wired over IPC with `terminal.create/write/resize/kill` + an `onTerminalData` event); the xterm renderer is a component in `packages/ui`. Both apps mount the same component, so the cockpit gains the terminal too. node-pty is the app's second native/portability-sensitive surface after run-process handling — it is isolated in `core` behind the same IPC seam so a future Windows/Linux port is contained (matching the invariant that PTY/process code stays isolated). Sessions carry the workspace cwd, resize with the viewport, and are killed on close/quit (no leaked processes). We do **not** interpolate app-controlled input into a shell string — the PTY spawns the user's shell and relays their keystrokes; the user's own typed commands run under their own authority. Alternatives considered — a non-interactive command runner (rejected: can't do interactive logins / dev servers / Ctrl-C) and embedding the OS terminal (rejected: not portable, breaks the in-app promise). → node-pty + xterm, shared.

### D7 — Vibe-engineering reuses the run pipeline verbatim
The IDE chat is the existing AssistantDock in `modify` mode, seeded with the open file path + preview URL as context, spawning the same `claude -p … stream-json` runs via the AgentAdapter with `bypassPermissions`. Spec-first gates still apply: generating/altering artifacts (briefs, specs, `DESIGN.md`) routes through the same approval-recording path. No new agent surface. Rationale: "vibe engineering" is not a new engine — it's the cockpit's run pipeline pointed at an open editor.

## Risks / Trade-offs

- **[Core extraction breaks the cockpit / churns imports]** → Do I0 as a pure move with path aliases (`@vortspec/core`, `@vortspec/ui`); keep `apps/desktop` tests as the tripwire — the milestone is done only when `pnpm build && pnpm test && pnpm lint` are green with the code relocated. No feature work in I0.
- **[Two apps double the maintenance]** → The shared-core boundary is exactly what caps it: shells are thin, the engine is single-source. CT/unit suites live with the shared code, so a regression surfaces once, not per app.
- **[Monaco + electron-vite worker wiring is fiddly / bloats the bundle]** → Isolate all Monaco setup in one `apps/ide/src/renderer/monaco/` module behind a tiny `<CodeEditor>` wrapper; lazy-load languages; it lives only in `apps/ide`, so the cockpit bundle is untouched.
- **[File watcher fights agent runs writing the same files]** → Debounce watcher events; the editor shows an "changed on disk — reload?" affordance rather than silently clobbering; saves are last-writer-wins with a dirty guard. Matches how the cockpit already re-reads rosters from files after a run.
- **[Preview runtime port/lifecycle collisions between the two apps]** → Reuse the existing `ServerKind`-keyed dev-server (`${projectPath}::${kind}`); it already de-dupes per project+kind, so a shared main process serves both shells without double-starting.
- **[node-pty native rebuild / packaging pain]** → node-pty is a native module; pin it, rebuild against Electron's ABI in the existing `dist` step, and isolate it in `core` behind the IPC seam so both apps consume it identically and a Windows/Linux port stays contained. Its behavior is smoke-tested via a headless PTY unit test; the xterm renderer gets a light CT.
- **[Scope creep toward a real IDE]** (debugger, extension host) → Explicit non-goals; the integrated terminal (D8) covers the "run anything locally" need without pulling in a debugger or extension marketplace.

## Migration Plan

1. **I0 — Extract core/ui (no behavior change).** Create `packages/core` + `packages/ui`, move code along the main/shared/renderer seam, add path aliases + Turborepo wiring, repoint `apps/desktop`. Gate: cockpit fully green end-to-end.
2. **I1 — IDE shell.** New `apps/ide` Electron app mounting `core`'s IPC; four-region layout; workspace open/switch.
3. **I2 — Code workspace.** Monaco editor + Explorer tree + file ops (open/save/watch) + Git diffs in Monaco.
4. **I3 — Integrated terminal.** node-pty in `core` + xterm in `ui`; mount in the IDE *and* backfill into the cockpit.
5. **I4 — Live preview.** Embed the app/Storybook runtime beside the editor.
6. **I5 — Vibe-engineering.** Wire AssistantDock (modify) + run pipeline against the open file/preview, gates intact.
7. **I6 — Procedure parity + polish.** Surface the SDD-DE pipeline (foundation→build→verify→docs) inside the IDE from `core`; package/sign/release the second macOS artifact.

**Rollback:** the IDE is additive — `apps/ide` can be dropped from the release without affecting the cockpit. The `packages/core` extraction is the only shared change; if it regresses, revert the extraction commit and the cockpit returns to its self-contained state (the move is mechanical and reversible).

## Open Questions

- **Preview layout default** — editor-over-preview (stacked) vs side-by-side as the initial split? Lean stacked with a one-click toggle; confirm during I3 against a real screen.
- **Does the cockpit's guided-flow orchestration screen also move to `packages/ui`, or stay app-specific?** Lean: the *building blocks* (cards, roster, RunProgress) move to `ui`; the top-level flow orchestration stays per-app since the IDE presents it as a panel, not a full screen. Resolve in I0/I5.
- **Single dashboard/launcher across both apps?** Possibly a later change — for now each app opens its own workspace picker. Out of scope here.
