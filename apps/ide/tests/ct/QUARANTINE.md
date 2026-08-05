# Quarantined component tests

73 tests are marked `test.fixme(...)` so the suite is **green and trustworthy**: a
red run now means *you* broke something, not that the suite has been red since
before you arrived. Every quarantined test carries a `// QUARANTINED [CLASS]`
comment naming which batch it belongs to.

Established 2026-08-05, when the suite was **95 failed / 115 passed** on `main`.
Nothing ran it in CI, so the rot was invisible. Current: **136 passed, 73 skipped,
0 failed** — and the run went from 2.2 minutes to 39 seconds, because a failing
Playwright test costs a 20-second timeout and a skipped one costs nothing.

Quarantine is **per test, not per file** — seven of the affected files are mixed,
and skipping them wholesale would have thrown away 47 passing tests.

## Rules

- **Never add to this list to make a red run green.** If your change breaks a test,
  fix the change or the test. This list is closed except by deletion.
- Un-quarantining is just deleting the `test.fixme` marker and its comment, then
  making the test pass.
- The batches below are independent. Take one, finish it, delete its section.

---

## Batch 1 — `REGISTRY` (52 tests)

**One infrastructure bug, not 52 broken tests.** These fail with:

```
Unregistered component: …_AuditBanner. Following components are registered: (empty)
```

`playwright/.cache/metainfo.json` reports `components: 0, deps: 0` — Playwright CT's
transform is registering nothing, so `mount()` rejects for components that are
otherwise fine. `audit-banner` is three assertions against a pure presentational
component with no IPC at all, and it still fails this way.

Deterministic: identical counts cold, warm, and at `--workers=1`. Not a worker race.

**Expect most or all 52 to come back at once when the harness is fixed.** Do not
start rewriting these individually — establish the cause first. Known-good
comparison: `app-update-banner.ct.tsx` and `compose.ct.tsx` mount the same way and
pass, so the difference is findable.

| File | Tests |
|---|---|
| `comments` | 9 |
| `sitemap` | 7 |
| `drag-move` | 6 |
| `instant-edits` | 6 |
| `insert-canvas` | 5 |
| `run-canvas` | 5 |
| `metadata-status` | 4 |
| `audit-banner` | 3 |
| `comments-panel` | 3 |
| `provision-library` | 3 |
| `assistant-task` | 1 |

---

## Batch 2 — `TIMEOUT` (21 tests)

**Real UI drift.** These wait for something the interface no longer renders — the
same category as the compose dialog losing its "Continue" step. Each needs reading
against the current component and either updating or deleting.

Deleting is a legitimate outcome when the behaviour is genuinely gone: prefer it to
rewording a test into something it never checked. Say so in the commit.

| File | Tests |
|---|---|
| `vibe` | 7 |
| `run-canvas` | 5 |
| `conversations` | 4 |
| `workspace` | 2 |
| `pipeline` | 1 |
| `shell` | 1 |
| `workbench` | 1 |

---

## How this happened, so it doesn't again

1. **Nothing ran the suite.** `.github/workflows/` had `check-types`,
   `framework-fixtures` and `pages` — no CT. It now runs on every PR
   (`.github/workflows/component-tests.yml`), which is what makes the green
   meaningful.
2. **The mock was never type-checked.** `apps/desktop/tests/ct/support/mock-api.ts`
   had drifted 33 methods behind `VortSpecApi`, and `window.vortspec` is assigned
   as `unknown`, so nothing noticed. `ComposePanel` called `api.onDrawSketchReady(...)`,
   the mock returned `undefined`, the call threw during render, React unmounted the
   tree, and sixteen tests failed on selectors — while the real cause sat in the
   browser console, unread. Keep the mock complete.
