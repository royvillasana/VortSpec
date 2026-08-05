# Component tests

**207 passing, 0 skipped, 0 failed.** Nothing is quarantined. Run:

```bash
pnpm --filter @vortspec/ide test:ct
```

They run on every PR (`.github/workflows/component-tests.yml`), so a red run is a
regression you can act on rather than noise you learn to scroll past.

On 2026-08-05 this suite was **95 failed / 115 passed** and nothing in CI ran it. The
notes below are what that cost to unpick — every one of them cost hours, and every one
would have cost minutes if it had been written down.

## A rendering crash is disguised as a selector error

This bit three separate times, and it is the single most useful thing here. A component
that throws during render leaves React with an empty tree, so Playwright reports the
thing you were *looking for* — a missing button, an unregistered component — never the
thing that broke.

- 16 compose tests failed on selectors. Cause: `api.onDrawSketchReady` was missing from
  the mock, so calling it threw on mount.
- 52 tests failed with `Unregistered component … registered: (empty)` and
  `metainfo.json` reporting `components: 0`. That reads exactly like a Playwright
  harness bug. Cause: **two incomplete fixture objects** — a `props` entry missing
  `classes`, and `COMPONENTS` missing `figmaOnly` / `figmaSynced`.

**When a CT test fails and the component looks innocent**, mount it in a throwaway
`.ct.tsx`, attach `page.on("pageerror")` and `page.on("console")`, and dump
`document.body.innerHTML`. An empty `#root` with no test error means something threw
during render. Do not start rewriting selectors.

## A visible, enabled, stable element whose click still times out

Playwright says *"element is visible, enabled and stable"*, then quietly reports the
interception ten lines further down the call log. The background-build toast
(`fixed bottom-4 left-1/2 z-[60]`) appears whenever a fixture project has no framework
configured, and it lands on top of the chat's Send button. Cost: 11 tests across `vibe`
and `conversations`. **Read the whole call log**, not the first line.

## `getByRole(..., { name })` is a SUBSTRING match

When the canvas mode was relabelled `Inspect` → `Edit`, a page-wide `toHaveCount(1)`
started counting every button whose accessible name merely *contains* "edit". The old
label had been unique by luck. **Use `exact: true` for any uniqueness claim.**

## Count after the load has settled, not after mount

`library-panel` counted rendered rows straight after `mount()`, before the panel's
async token load resolved. It passed on a laptop and failed on CI, where the count
read 0 — and the delta assertion then failed with a number that looked like a real
off-by-one rather than a timing bug. It survived because nothing ran the suite on CI.
Wait for the data (`await expect(locator.first()).toBeVisible()`) before measuring,
and prefer `expect.poll` for the assertion itself.

## Deleting a test is a legitimate fix

When the behaviour is genuinely gone, delete it and say so in the commit — that is
better than rewording a test into something it never checked. Done three times here:
the compose `into gap` / `new container` distinction (placement is always
`into-existing` now), and the `Open Browser` preview bar (no such surface exists).

## Keep the mock complete

`apps/desktop/tests/ct/support/mock-api.ts` — reused by `apps/ide` via
`playwright/index.tsx` — had drifted **33 methods** behind `VortSpecApi`. It is pinned
with `satisfies Record<keyof VortSpecApi, unknown>`, so an omission now fails
`check-types`. That is completeness, not shape: a *missing* method is the failure that
actually happens. Full shape fidelity would mean correcting ~33 loose fixtures and is
still open.
