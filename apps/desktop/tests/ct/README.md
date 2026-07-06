# Renderer component tests (Playwright CT)

Deterministic tests for the renderer views (Tokens Inspector, Component
Playground) that mount the **real** React components in a Chromium page with a
stubbed `window.vortspec`, so they run over fixture data without launching
Electron or the main process.

```bash
pnpm --filter @vortspec/desktop test:ct     # or: pnpm test:ct (from the repo root)
```

First run needs the browser once: `pnpm --filter @vortspec/desktop exec playwright install chromium`.

## How it fits together

- `playwright-ct.config.ts` — CT config (Chromium, Tailwind in the CT Vite pipeline).
- `playwright/index.tsx` — mount template; a `beforeMount` hook installs the
  stub bridge from each test's `hooksConfig.mock`.
- `support/mock-api.ts` — a full `window.vortspec` stub. Read methods return
  fixture data; `startRun` replays a recorded agent-event transcript to the
  `onAgentEvent` subscribers (after `runIdRef` is set, hence a macrotask), which
  is how the run-view / harness-generation path is driven deterministically.
- `support/fixtures.ts` — token, component, and transcript fixtures.
- `*.ct.tsx` — the tests. One `mount()` per test (a CT constraint).

These live outside `src/` so they stay out of the app's typecheck and build; the
default `pnpm test` (Vitest, main-process units) does not run them.
