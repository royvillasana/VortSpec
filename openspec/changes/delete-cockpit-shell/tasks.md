> **Order is the safety property.** The tests move and go green BEFORE the app is deleted. If the app goes first, its coverage goes with it and the gap is invisible.

## 1. Move the shared CT harness into the app that uses it

- [x] 1.1 Move `apps/desktop/tests/ct/support/mock-api.ts` → `apps/ide/tests/ct/support/mock-api.ts`
- [x] 1.2 Repoint `apps/ide/playwright/index.tsx` and `apps/ide/tests/ct/pipeline.ct.tsx` from `../../desktop/tests/ct/support/mock-api` to the local path
- [x] 1.3 Move the tsconfig include that type-checks the CT support dir from `apps/desktop/tsconfig.web.json` to `apps/ide`, so the `VortSpecApi` guard keeps running in `check-types`
- [x] 1.4 Verify: IDE CT still **207 passing**, `check-types` 6/6, and the guard still fires (delete a mock method, confirm `check-types` fails, restore)

## 2. Record the coverage baseline before touching anything

- [x] 2.1 Run the cockpit's CT suite and record the per-file pass count — the number to preserve, not the file count
- [x] 2.2 For each of the 18 tests, note which component it mounts and whether that component lives in `packages/ui` (portable) or `apps/desktop/src/views` (cockpit-only)
- [x] 2.3 Confirm the four views with **no** IDE coverage — `SourceControl`, `FigmaConnection`, `UsageWarning`, `AssistantDock` — are on the portable list

## 3. Migrate the tests onto the IDE harness

- [x] 3.1 Move the `packages/ui`-mounting tests to `apps/ide/tests/ct/`, with their support files (`fixtures.ts`, `selection-harness.tsx`, `UsageWarningHarness.tsx`)
- [x] 3.2 Make them pass on the IDE's `playwright-ct.config.ts` + `playwright/index.tsx`; expect the traps already documented in `apps/ide/tests/ct/README.md` (a render crash reported as a selector error; the background-build toast intercepting clicks; substring `name` matching)
- [x] 3.3 For each test mounting a cockpit-only view: retarget it at the IDE equivalent, or **delete it and state the reason in the commit**. Do not point a test at a component that merely looks similar
- [x] 3.4 Verify: the IDE suite is green, and the added test count matches step 2.1 minus anything deliberately deleted
- [x] 3.5 Re-check the four views from 2.3 specifically — assert coverage by assertion, not by file count

## 4. Delete the shell

- [ ] 4.1 Delete `apps/desktop/` (source, config, tests, `package.json`)
- [ ] 4.2 Confirm the pnpm `apps/*` glob and turbo need no edit; run a clean `pnpm install --frozen-lockfile` (the lockfile loses the workspace entry)
- [ ] 4.3 Update stale path references: `docs/design/README.md`, the "both app shells" comments in `packages/core/src/main/index.ts` and `packages/core/src/shared/ipc.ts`, and `apps/ide/tests/ct/README.md`
- [ ] 4.4 Drop the lockstep `apps/desktop` version bump from the release flow and its docs

## 5. Amend the specs

- [ ] 5.1 `integrated-terminal` — rename "Interactive terminal in both apps" → "in the IDE"; drop the cockpit scenario; keep the core/ui split with its real justification
- [ ] 5.2 `shared-core` — rename the two "both apps"/"both shells" requirements; **remove** "Cockpit behavior is unchanged by the extraction" (a completed one-time migration)
- [ ] 5.3 `ide-shell` — the IDE is no longer defined by contrast with a second app; fix the scenario that claims the pipeline ships a *signed* cockpit dmg "alongside" the IDE, which is already false
- [ ] 5.4 `ide-guided-flow` — state the intake/foundation behaviour directly instead of as parity with the cockpit
- [ ] 5.5 Sweep the remaining 15 specs that mention the cockpit for references that become false, not merely stale
- [ ] 5.6 `openspec validate --specs` passes

## 6. Verify end to end

- [ ] 6.1 `check-types` 6/6 (now 4 tasks, not 6 — one fewer package)
- [ ] 6.2 Full unit suite green
- [ ] 6.3 IDE CT green, with the migrated tests included
- [ ] 6.4 Build the IDE (`pnpm --filter @vortspec/ide dist`) and confirm the packaged app still opens a window — the smoke test's launch assertion must pass with the cockpit gone
- [ ] 6.5 `/opsx:sync delete-cockpit-shell`, then archive
