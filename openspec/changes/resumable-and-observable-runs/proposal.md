# Resumable & observable runs

## Why

Background runs (build, verify, the build-&-verify pipeline, foundation/re-scan,
commit) previously showed only a spinner + a one-line label. The user couldn't
tell **which stage** a run was in, whether it hit an **issue they need to solve**,
or **how far** a multi-component pipeline had progressed. And if a run was
interrupted — cancelled, failed, or the app closed mid-run — the only recourse was
to re-run the whole action, redoing work that was already done.

Both gaps matter most for the long pipeline the product is built around (scan a
few components, re-scan for the rest, build & verify them): it's exactly the run a
user wants to watch and, if interrupted, resume rather than restart.

## What Changes

- **Holistic progress view.** Every run renders the same structure: a stage
  stepper for the SDD-DE cycle (Specs → Build → Visual QA → Review, or the
  source/commit stages), a progress bar with a plain-language legend of what's
  happening now, a component counter for the pipeline ("component 3 of 5"), and
  any **blockers the user may need to resolve** (Figma MCP not connected, a step
  error, retry storms) surfaced as fix-it cards. The stage is *derived* from the
  run's own signals (files written, skills mentioned) since Claude Code emits no
  explicit stage event.
- **Resumability, two ways.**
  1. *File-derived (restart-proof):* every batch action is idempotent — a
     re-run checks what's already on disk and skips it, so re-clicking the action
     continues from where it stopped, even across an app restart. This is the
     local-first path and the primary guarantee.
  2. *Session resume:* the app persists the last run per project
     (`.vortspec/last-run.json`: sessionId, kind, label, total, status). If it was
     interrupted, the workspace offers **Resume**, which continues that exact
     Claude Code session (`--resume`) so even the partially-done item isn't redone.

## Impact

- Affected specs: `agent-runs` (progress derivation, blockers, last-run
  persistence, resume).
- Affected code: new `renderer/src/lib/run-progress.ts` + `components/RunProgress.tsx`;
  `views/GuidedFlow.tsx` (progress card for every op, resume card, idempotent
  prompts); `shared/run-events.ts` (`meta`, `lastRunSchema`);
  `main/agent/run-recorder.ts` (last-run read/write/patch) + `run-manager.ts`
  (persist status + sessionId, `getLastRun`); IPC `agent:lastRun`.
- No change to skills or agent logic — Claude Code still executes every step; we
  observe, persist, and resume it.
