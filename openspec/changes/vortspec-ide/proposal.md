## Why

VortSpec today is a *cockpit*: a guided, screen-by-screen flow that drives Claude Code through the SDD-DE cycle. But once a design system exists (tokens → components → `DESIGN.md`) the user's next job is engineering — reading, editing, and vibe-coding real files against real screens — and the cockpit has no place to do that. Users are bouncing to VS Code to see and edit the code the flow just produced, which breaks the "everything lives in one transparent local surface" promise and the spec-first loop.

The opportunity: evolve VortSpec into a **design-engineering IDE** — the same SDD-DE procedure and gates, plus a first-class editing surface (Monaco), a file Explorer, a live preview of the screens/app, cloud-repo (Git) control, and the assistant chat on the right. One product where you create components, document them, connect a repo, and vibe-engineer without leaving the app.

Crucially, this is a **second product, not a rewrite**. The cockpit keeps shipping. The rule the user set: *any change to the pre-`DESIGN.md` SDD-DE procedure must land in both apps.* That is only guaranteed if the procedure is a **shared core** both apps import — so this change starts by extracting that core, then builds the IDE on top of it.

## What Changes

- **Extract a shared core (`packages/core`).** Move the app-agnostic engine out of `apps/desktop` into a new workspace package: the SDD-DE prompts/orchestration (foundation → build → verify → docs → `DESIGN.md`), the AgentAdapter + run-manager/recorder, the readers/parsers (tokens, components, manifest, usage), the Git adapter + providers (GitHub/GitLab/Bitbucket, additive-only guardrails), and the Jira/task layer. Both apps depend on it. **This is the mechanism that keeps the two apps in sync.**
- **Extract shared renderer pieces (`packages/ui`).** Promote the reusable React views/components (Source Control, Run app, Tasks, Guided-flow pieces, Tokens, Manifest, Profile, RunProgress, AssistantDock) and the `vs-*` design tokens so both apps render the same panels.
- **New app `apps/ide`** — a second Electron app: a VS Code–style shell with an **Activity/Explorer sidebar + editor group (Monaco) + live preview pane + right-hand assistant chat**, wired to the same main-process handlers via the shared core.
- **Monaco-based code workspace** — open/edit/save files from the project folder, a file-tree Explorer, dirty/save state, and diffs (reusing our Git adapter) rendered in Monaco's diff editor. **No** re-implementation of agent logic or a language server beyond what Monaco ships.
- **Live preview pane** — the existing app/Storybook runtime (`startAppServer`/dev-server) embedded beside the editor, so "screens on one side, code on the other."
- **Vibe-engineering** — the AssistantDock chat, modify-capable, seeded with the open file + preview context, driving the same Claude Code runs (non-bare, user's own login, `bypassPermissions`) the cockpit uses.
- **Integrated terminal in BOTH apps** — a real interactive terminal (node-pty + xterm.js) shipped once in `packages/core`/`packages/ui` and mounted in **both** the cockpit and the IDE, scoped to the workspace folder. It lets users run the local host environment, `git`/`gh`/`glab`/`jira`, and any command without leaving the app — and it satisfies the "one-click path to the raw form" invariant with a first-class shell instead of just an escape hatch.
- **`apps/desktop` refactor (non-breaking).** The cockpit is rewired to import `packages/core` + `packages/ui` instead of its local copies. Same behavior, same tests; the code simply moves. It also *gains* the integrated terminal.
- **NOT in scope:** forking Code-OSS, a debugger, an extension marketplace, Windows/Linux packaging of the IDE (macOS-first, same as the cockpit), and any change to the SDD-DE *methodology* itself (that lives in Claude Code's skills, never here).

## Capabilities

### New Capabilities
- `shared-core`: The `packages/core` (+`packages/ui`) extraction — what moves, the package boundary/exports, the invariant that both apps consume it, and how a pre-`DESIGN.md` procedure change propagates to both apps.
- `ide-shell`: The `apps/ide` Electron application shell — window chrome, the VS Code–style four-region layout (Activity bar/Explorer, editor group, preview, chat), workspace open/switch, and how it reuses the cockpit's main process + IPC.
- `code-workspace`: The Monaco editor + file-tree Explorer + file operations (open/edit/save/watch/dirty-state) and Git-diff viewing inside the editor.
- `ide-live-preview`: The live screens/app preview pane beside the editor — start/stop the runtime, bind it to the workspace, and reflect it next to the code being built.
- `ide-vibe-engineering`: The integrated assistant chat that drives Claude Code runs against the open file/preview with spec-first gates, from inside the IDE.
- `integrated-terminal`: A real interactive terminal (node-pty + xterm.js) mounted in both apps, scoped to the workspace folder — run the local host, Git/CLI tools, and arbitrary commands in-app.

### Modified Capabilities
- (none — the SDD-DE requirements are unchanged; they are *relocated* into `packages/core`. This change adds a new product and a shared package; it does not alter existing spec-level behavior of the cockpit.)

## Impact

- **Monorepo layout:** new `packages/core`, `packages/ui`, `apps/ide`; `apps/desktop` becomes a consumer of the two packages. Turborepo pipeline + pnpm workspaces + path aliases updated.
- **Build/test:** `packages/core` gets its own Vitest unit suite (the moved main-process tests follow the code); `apps/ide` gets Playwright CT for the shell; `apps/desktop`'s suites stay green through the refactor. New Monaco dependency in `apps/ide` only.
- **Dependencies:** `monaco-editor` (+ its electron-vite worker wiring) in `apps/ide`; `node-pty` (native, in `packages/core`) and `xterm` + addons (in `packages/ui`) for the terminal in both apps. No new provider keys, no telemetry, no methodology change — all v2 invariants hold.
- **Release:** a second signed macOS artifact (`VortSpec-IDE`) in the existing `pnpm run dist` → codesign → dmg → GitHub-release pipeline; the site gains a second download.
- **Risk:** the core extraction is the highest-risk step (import churn, path aliases, test relocation); it is milestone I0 and must leave `apps/desktop` fully green before the IDE is built.
