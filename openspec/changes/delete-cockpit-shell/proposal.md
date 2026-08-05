## Why

`apps/desktop` — the cockpit — is not built, not released, and not launched. The decision was made on 2026-08-02 ("from now on we're going to use the IDE only") and restated on 2026-08-05 ("no more desktop app"). The landing page sells one app. Every release since has been IDE-only.

What remains is a shell nobody installs that still costs something on every change: it is version-bumped in lockstep at each release, it must keep compiling in `check-types`, and — most expensively — it makes "which app is this for?" a live question in a codebase where the answer is always the same.

The reason to do this as a spec change rather than a cleanup commit is that **two specs currently require the cockpit to exist**, in normative `SHALL` language. Deleting the app without amending them would leave the specs asserting something false, which is worse than leaving the app.

## What Changes

- **`apps/desktop` is deleted** — 15 source files, its `electron.vite.config.ts`, `electron-builder` config, and `package.json`. The pnpm workspace picks up apps via an `apps/*` glob, so no workspace edit is needed.
- **Its 18 component tests MOVE to `apps/ide`, they are not deleted.** This is the substance of the change, not a side effect — see Impact.
- **`apps/desktop/tests/ct/support/mock-api.ts` moves to `apps/ide/tests/ct/support/`.** `apps/ide` already imports it across the app boundary (`../../desktop/tests/ct/support/mock-api`); that import becomes local. `fixtures.ts`, `selection-harness.tsx` and `UsageWarningHarness.tsx` move with the tests that use them.
- **The release flow stops bumping two versions.** `apps/desktop/package.json` is currently kept in lockstep with `apps/ide` at every release for an artifact that is never produced.
- **`integrated-terminal` is amended** — **BREAKING** to the spec, not to users. Its first requirement reads *"**Both** the cockpit (`apps/desktop`) and the IDE (`apps/ide`) SHALL provide an interactive terminal"*, with a scenario "Terminal available in the cockpit". Both are rewritten around the IDE; the shared-implementation clause (PTY in `packages/core`, renderer in `packages/ui`) is kept, because it is still true and still load-bearing.
- **`shared-core` is amended** — its "Cockpit behavior is unchanged by the extraction" requirement is a migration-era guarantee about a move that completed long ago. It is **REMOVED** rather than reworded: it describes a one-time transition, and there is no cockpit left to keep unchanged.
- **Parity-style references are reworded** where the cockpit is used as the reference implementation (`ide-shell`: "distinct from the cockpit"; `ide-guided-flow`: "the same … the cockpit runs"; `shared-core`: "the same handlers the cockpit registers"). These are not false today, but they anchor a requirement to something that will not exist.

Explicitly **not** in scope: removing anything from `packages/core` or `packages/ui`. Both are shared libraries whose only remaining consumer becomes the IDE, but nothing in them is cockpit-specific, and pruning them is a separate exercise with its own risk.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `integrated-terminal`: the terminal requirement is stated for the IDE alone; the cockpit scenario is removed.
- `shared-core`: the migration-era "cockpit behavior is unchanged" requirement is removed; the cockpit-as-reference wording in the IPC-parity scenario is reworded.
- `ide-shell`: the IDE is no longer defined by contrast with a second Electron app.
- `ide-guided-flow`: the intake/foundation requirement stops defining itself as parity with the cockpit and states the behaviour directly.

## Impact

**The tests are the real cost, and the real work.** `apps/desktop/src` is 15 files; `apps/desktop/tests` is 18 component tests covering **shared `packages/ui` views that the IDE also renders**. Four of them are the *only* component coverage those views have:

| View | cockpit tests | IDE tests |
|---|---|---|
| `SourceControl` | 1 | **0** |
| `FigmaConnection` | 2 | **0** |
| `UsageWarning` | 1 | **0** |
| `AssistantDock` | 1 | **0** |

Deleting the app naively would silently drop that coverage on components the shipping product uses. The tests must be migrated onto the IDE's Playwright CT harness (its own `playwright-ct.config.ts` and `playwright/index.tsx`) and pass there before the app is removed.

| Area | Change |
|---|---|
| `apps/desktop/**` | deleted |
| `apps/ide/tests/ct/**` | +18 migrated tests, +4 support files |
| `apps/ide/playwright/index.tsx` | imports the mock locally instead of across apps |
| `apps/desktop/tsconfig.web.json` | the CT-support typecheck include moves to `apps/ide` |
| `openspec/specs/{integrated-terminal,shared-core,ide-shell,ide-guided-flow}` | amended |
| `docs/design/README.md`, `packages/core` comments | stale path references updated |
| Release flow + `.sdd-de` docs | drop the lockstep desktop bump |

No user-facing behaviour changes. No dependency changes.
