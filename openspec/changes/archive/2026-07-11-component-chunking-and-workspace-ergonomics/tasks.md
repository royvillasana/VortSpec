# Tasks — component-chunking-and-workspace-ergonomics

Ordered by dependency. Each workstream ends green (`pnpm build && pnpm test && pnpm lint`).

## 1. WS1 — Chunked component builds
- [x] 1.1 Add `chunkByLevel(components, size = 5)` + `tierForChunk(chunk)` + `buildChunkPrompt(names, opts)` to `packages/core/src/shared/sdd-prompts.ts`; unit tests in `sdd-prompts.test.ts`. (+9 unit tests)
- [x] 1.2 Replace the single build run in `packages/ui/src/views/GuidedFlow.tsx` with a sequential chunk loop driven by the run-done effect (start resolves on kick-off, not completion): `ensureHarness()` once, per-chunk `op(..., buildChunkPrompt(chunk, {storybook,manifest,verify}), { model: tierForChunk(chunk) })`, roster `reload()` between chunks, `stopChunks()` cancel + `chunksActive` guard, chunk k/N label.
- [x] 1.3 Route single-component build (`ComponentRow.onBuild`) through `tierForChunk([c])`.
- [x] 1.4 CT: `GuidedFlow` chunk loop asserts two sequential runs, per-chunk model (haiku/sonnet), scoped prompts.

## 2. WS2 — ZIP picker + drag-drop
- [x] 2.1 Add `pickFile(filters)` to `packages/core/src/main/workspace/workspace-manager.ts`; channel `workspace:pickFile` in `shared/ipc.ts`; expose in `shared/api.ts` + `preload` + `main/ipc.ts`.
- [x] 2.2 `apps/desktop/src/renderer/src/views/DesignInput.tsx`: "Choose .zip…" button (`pickFile`) + working dropzone via `getPathForFile` (fixed the removed-`File.path` drop overlay too).
- [x] 2.3 `packages/ui/src/views/GuidedFlow.tsx` `AddSourcePanel`: "Choose .zip…" + drop → a `local` source.
- [x] 2.4 `pickFile` stub in `mock-api.ts`; CT for the ZIP dialog pick.

## 3. WS3 — Home icon
- [x] 3.1 `apps/ide/.../ActivityBar.tsx`: add `HomeMark` + `home` item at top of `TOP` (`NavKey = Activity | "home"`).
- [x] 3.2 `apps/ide/.../App.tsx`: intercept `onSelect("home")` → `setWorkspace(null)`.
- [x] 3.3 CT: the Home activity returns to the project picker.

## 4. WS4 — Autosave + assisted commit
- [x] 4.1 Debounced disk autosave in `apps/ide/.../useWorkspaceFiles.ts` (per-file timer, skip when `staleOnDisk`; Cmd-S still immediate + supersedes a pending autosave).
- [x] 4.2 Persistent change/unpushed indicator in `apps/ide/.../App.tsx` status bar (keeps `gitStatus` counts; refreshes on `onWorkspaceChange`); click → Source Control.
- [x] 4.3 "Draft message" button in `packages/ui/.../SourceControl.tsx` (scoped `haiku` run over the staged diff → editable input). No auto-commit.
- [x] 4.4 CT: indicator counts + click opens Source Control; draft-message fills the commit box. (Autosave debounce reuses the tested `save` path; Monaco-input CT is unreliable so it's covered by typecheck + manual.)

## 5. WS5 — Tokens where-used polish
- [x] 5.1 `packages/ui/.../Inspector.tsx`: group `usage` by component (property chips), rows clickable to open the component source (`onOpenFile` in the IDE, OS reveal fallback); component→file map loaded from `inspectorComponents`.
- [x] 5.2 CT: clicking a where-used row opens the component file.

## 6. WS6 — Visual refresh + Project Setup
- [x] 6.1 Read `Project Setup.dc.html` from the claude.ai/design project via the `DesignSync` MCP (unblocked by `/design-login`). Restyled `packages/ui/src/views/ProjectSetup.tsx` to match: a top bar (breadcrumb + "Design system" + workspace path), a 296px bordered stepper rail with a "NEW PROJECT" label and a dimmed Foundation-next indicator, chip-pill framework/language/styling/test-runner selectors, and an "autosaved" footer marker. The design's palette already matched the app's `--color-vs-*` tokens (accent `#7C6FF0`≈`#7C6CFF`), so no token changes were needed; kept Geist (bundled) over the design's IBM Plex/JetBrains to avoid a heavy font swap. The design's Foundation phase stays a separate screen (`GuidedFlow`), previewed as the dimmed step 5.

## 7. Verify
- [x] 7.1 `pnpm build && pnpm test && pnpm lint` green; Playwright CT green (desktop 75, IDE 85, 284 vitest units).
