# Tasks — Resumable & observable runs

## 1. Progress derivation + view
- [x] 1.1 `run-progress.ts`: `deriveProgress(model, kind, {total})` — stage catalog
  per kind, signal detection, pipeline counter, blockers. Unit-tested.
- [x] 1.2 `RunProgress.tsx`: stepper + bar + legend + counter + blocker cards.
- [x] 1.3 GuidedFlow renders the progress card for every op; RunPanel behind
  "View details"; verify/pipeline still show the report outcome on done.

## 2. Resumability — file-derived
- [x] 2.1 Shared `RESUMABLE` preamble on build-remaining, pipeline, and verify-all
  prompts (skip work already on disk).

## 3. Resumability — session
- [x] 3.1 `shared/run-events.ts`: `AgentRunOptions.meta` + `lastRunSchema`/`LastRun`.
- [x] 3.2 `run-recorder.ts`: `readLastRun`/`writeLastRun`/`patchLastRun`; capture
  sessionId in the accumulator.
- [x] 3.3 `run-manager.ts`: seed `running` at start, update sessionId, finalize on
  exit; `getLastRun` (resumable-only). IPC `agent:lastRun` + preload + api + mock.
- [x] 3.4 GuidedFlow: load last run on mount + after each run; Resume card;
  `resumeRun()` via `resumeSessionId` (re-ensures harness for verify/pipeline).

## 4. Tests + gate
- [x] 4.1 Unit: `run-progress` (stages, counter, blockers, done), `run-manager`
  (getLastRun states), `run-recorder` (last-run round-trip + patch merge).
- [x] 4.2 CT: progress card renders for a build; Resume card shows for an
  interrupted run and starts a run on click.
- [x] 4.3 `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build && pnpm lint` green.

## 5. Ship
- [ ] 5.1 Bump version, build + sign + package universal dmg, release, verify site.
- [ ] 5.2 Manual E2E: start a pipeline, watch the stepper/counter; cancel it; return
  and Resume — confirm it continues without redoing finished components.
