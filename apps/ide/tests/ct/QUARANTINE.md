# Quarantined component tests

24 tests are marked `test.fixme(...)` so the suite is **green and trustworthy**: a
red run means *you* broke something, not that the suite has been red since before
you arrived. Every quarantined test carries a `// QUARANTINED [CLASS]` comment.

Current: **185 passed, 24 skipped, 0 failed.** For context, on 2026-08-05 this
suite was **95 failed / 115 passed** on `main`, and nothing in CI ran it.

Quarantine is **per test, not per file** — several affected files are mixed, and
skipping them wholesale would throw away passing tests.

## Rules

- **Never add to this list to make a red run green.** If your change breaks a test,
  fix the change or the test. This list is closed except by deletion.
- Un-quarantining is deleting the `test.fixme` marker and its comment, then making
  the test pass.

---

## The batch that no longer exists — read this before chasing a symptom

52 tests were quarantined here as a `REGISTRY` batch, failing with:

```
Unregistered component: …_AuditBanner. Following components are registered: (empty)
```

That looked like a Playwright CT harness bug, and it was documented as one. **It was
not.** All 52 were downstream of two incomplete fixtures in
`apps/desktop/tests/ct/support/fixtures.ts` — a `props` entry missing `classes`, and
`COMPONENTS` missing `figmaOnly` / `figmaSynced`. Components crashed on the missing
fields, React unmounted the tree, and Playwright reported the *component* as
unregistered. Completing the fixtures returned all 52 at once, with no harness work.

The lesson is the same one that produced this file: in this suite, **a rendering
crash is disguised as a selector or registry error**. When a CT test fails and the
component looks innocent, mount it in a throwaway `.ct.tsx`, attach
`page.on("pageerror")` and `page.on("console")`, and dump `document.body.innerHTML`.
An empty `#root` with no test error means something threw during render. The
selector timeout is never the cause.

---

## What is left — 5 tests

Each is an independent investigation; the shared causes are gone.

| File | Test | Symptom |
|---|---|---|
| `workspace` | Open Browser opens the selected preview tab's own server | click times out |
| `workspace` | the breadcrumb appends the active editor tab after the activity | breadcrumb text differs |
| `shell` | the status bar shows the git branch and Explorer-only region toggles | no `Explorer` button in the footer |
| `pipeline` | opening an un-founded project auto-starts the Flow foundation | no `Set up the foundation` heading |
| `provision-library` | clicking Provision runs the /provision-library flow | asserted value is `undefined` |

Deleting is a legitimate outcome when the behaviour is genuinely gone: prefer it to
rewording a test into something it never checked. Say so in the commit.

### Causes already found and fixed, worth recognising again

- **A fixed bottom-center toast intercepting clicks.** The background-build indicator
  (`fixed bottom-4 left-1/2 z-[60]`) appears whenever the fixture project has no
  framework configured, and lands on top of the chat's Send button. Playwright
  reports this as a *click timeout on an element that is visible, enabled and
  stable* — the interception is only named further down the call log. Cost: 11 tests
  across `vibe` and `conversations`. Fix: dismiss it in the file's `open()` helper.
- **`getByRole(..., { name })` matches as a SUBSTRING.** When the canvas mode was
  relabelled `Inspect` → `Edit`, a page-wide `toHaveCount(1)` started counting every
  button whose accessible name merely contains "edit". The old label was unique by
  luck. Use `exact: true` for uniqueness claims.
- **Labels drift quietly**: `Inspect` → `Edit`, the Layers *button* → a "Layers tree"
  header, per-size viewport buttons → one `Viewport` menu, and "Storybook" now
  appearing in the breadcrumb as well as the view header (a strict-mode violation
  rather than a failure).

## How this rotted, so it doesn't again

1. **Nothing ran the suite.** It now runs on every PR
   (`.github/workflows/component-tests.yml`), which is what makes the green mean
   anything.
2. **The mock was never type-checked.** `apps/desktop/tests/ct/support/mock-api.ts`
   had drifted 33 methods behind `VortSpecApi`, and the CT support files were in no
   tsconfig. `ComposePanel` called `api.onDrawSketchReady(...)`, the mock returned
   `undefined`, the call threw during render, and sixteen tests failed on selectors
   while the real cause sat unread in a browser console. The mock is now pinned with
   `satisfies Record<keyof VortSpecApi, unknown>`, so an omission fails `check-types`.
3. **Fixtures had the same hole and no guard.** They are typed
   (`InspectorComponentsResult`), which is what let the compiler find the two missing
   fields once the support directory was finally included in a tsconfig.
