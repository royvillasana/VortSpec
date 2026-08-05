## Context

`apps/desktop` is dead weight by decision, not by accident: IDE-only was chosen on 2026-08-02 and restated on 2026-08-05. It is not built, not released, not launched, and the landing page sells one app.

Scoping it turned up the thing that makes this a real change rather than an `rm -rf`:

**`apps/desktop/src` is 15 files. `apps/desktop/tests` is 18 component tests of shared `packages/ui` views** — views the shipping IDE renders. Four of them are the *only* component coverage those views have anywhere:

| View | cockpit tests | IDE tests |
|---|---|---|
| `SourceControl` | 1 | **0** |
| `FigmaConnection` | 2 | **0** |
| `UsageWarning` | 1 | **0** |
| `AssistantDock` | 1 | **0** |

Deleting the directory would quietly delete coverage of components the product uses. That inverts the work: the tests are the asset, the shell is the liability.

The second constraint is that **two specs require the cockpit to exist**, in normative `SHALL` language (`integrated-terminal`, `shared-core`), and several more use it as the reference implementation (`ide-shell`, `ide-guided-flow`). Deleting the app without amending them leaves specs asserting something false — worse than leaving the app.

## Goals / Non-Goals

**Goals:**

- `apps/desktop` gone, with no loss of component-test coverage for shared views.
- The specs describe the codebase that exists, with the cockpit's removal recorded rather than silently papered over.
- One version to bump at release instead of two.
- `apps/ide` stops reaching across an app boundary for its CT mock.

**Non-Goals:**

- Pruning `packages/core` / `packages/ui`. Their only consumer becomes the IDE, but nothing in them is cockpit-specific, and pruning is separate work with its own risk.
- Merging `packages/core` back into the app. The boundary earns its place independently (see D1).
- Any user-facing behaviour change. Nothing here should be visible in the product.

## Decisions

### D1. Keep the `packages/core` / `packages/ui` split, and say why in the spec

The obvious follow-on question is whether two packages still make sense with one app, since the specs justified them as "shared by both apps". They do, for a different reason: the boundary is what keeps the engine **headless and unit-testable without an Electron renderer**, and what stops shell concerns leaking into it. 1684 unit tests depend on being able to import the engine without a renderer.

So the amended requirements restate the boundary **with its real justification** rather than deleting the "why" along with the second app. A spec that says "these are separate because two apps use them" would become false and then get collapsed by someone reading it literally.

*Alternative considered:* collapse `packages/core` into `apps/ide`. Rejected — it would put the engine behind an Electron dependency and cost the headless test suite.

### D2. Migrate the 18 CT tests; never delete coverage as a side effect

Every cockpit CT test is moved onto the IDE's harness and must pass there **before** `apps/desktop` is removed, not after. Ordering matters: if the app goes first, the tests go with it and the gap is invisible.

Some will need real work — they mount cockpit-specific views (`EnvironmentCheck`, `Dashboard`, `DevPreview`, `RunView` live in `apps/desktop/src/views`). For those, the honest options are, in order of preference:

1. The view has an IDE equivalent → retarget the test at it.
2. The view is genuinely cockpit-only and the behaviour no longer ships → **delete the test and say so in the commit**, per the existing convention in `apps/ide/tests/ct/README.md`.

Do not port a test by pointing it at a component that merely looks similar. A test that passes against the wrong subject is worse than no test.

### D3. `mock-api.ts` moves to `apps/ide`, which is where its only remaining consumer lives

`apps/ide/playwright/index.tsx` already imports it as `../../desktop/tests/ct/support/mock-api` — a cross-app reach that only ever made sense while the cockpit was the primary app. It moves to `apps/ide/tests/ct/support/`, and the tsconfig include that type-checks it (added 2026-08-05) moves with it, so the `satisfies`/`VortSpecApi` guard keeps running.

`fixtures.ts`, `selection-harness.tsx` and `UsageWarningHarness.tsx` are used only by cockpit tests; they move with those tests or are deleted alongside them.

### D4. Amend the specs in this change, not afterwards

The spec deltas ship with the deletion so the repo is never in a state where a `SHALL` describes a directory that does not exist. `shared-core`'s "Cockpit behavior is unchanged by the extraction" is **removed** rather than reworded: it guaranteed a one-time migration that completed long ago, and with no cockpit there is nothing to keep unchanged. The others are renamed and rewritten.

### D5. Release flow drops the lockstep bump

`apps/desktop/package.json` is version-bumped at every release for an artifact that is never produced. That step goes, along with the `.sdd-de`/memory notes describing it.

## Risks / Trade-offs

**A migrated test passes against a different component than it was written for** → The failure mode is silent and permanent. Mitigated by D2's ordering rule (tests green on the IDE harness *before* deletion) and by preferring deletion-with-a-reason over a doubtful port.

**The cockpit turns out to be someone's escape hatch** → It has not been built or released since v0.1.33, and the landing page offers one download, so any such use is already broken. Git history keeps it recoverable; this is a delete, not a shred.

**Coverage looks preserved because the file count is preserved** → Count assertions, not files. The four views in the table above are the specific things to re-check after migration.

**Spec churn touches four capabilities at once** → All four amendments are mechanical consequences of one fact. Splitting them across changes would leave the repo transiently inconsistent, which is the state this is trying to end.

## Migration Plan

Order is the safety property:

1. Move `mock-api.ts` (+ support files) into `apps/ide`; repoint imports; confirm the IDE's 207 still pass.
2. Migrate the 18 cockpit CT tests onto the IDE harness; make them pass; record any deletion with its reason.
3. Only then delete `apps/desktop`.
4. Amend the specs, docs, and the release flow in the same change.

Rollback is `git revert`; the deleted app is recoverable from history at any point.

## Open Questions

- **Do the cockpit-only views die with the shell?** `EnvironmentCheck`, `Dashboard`, `DevPreview`, `RunView`, `ArtifactReview`, `Verification`, `History` live in `apps/desktop/src/views`. Some have IDE equivalents; some may be genuinely gone. Each is a per-test judgement in step 2 and cannot be settled up front without reading them.
- **Does `apps/desktop`'s `tsconfig.node.json`/`electron.vite.config.ts` teach us anything the IDE's should adopt?** Worth a glance while deleting rather than after.
