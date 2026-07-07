# Design — Resumable & observable runs

## Progress derivation

Claude Code emits tool-use/file/prose events, not stage events. `run-progress.ts`
(`deriveProgress(model, kind, { total })`) is a pure function that maps the
accumulated `RunModel` onto an ordered stage catalog per op kind by matching
signals: file-path patterns (`specs/*-component-spec.md` → specs;
`*.tsx` → implement; `visual-verify-report.md` → visual; adversarial report →
review; `components.json` → detect) and text markers (`/generate-artifacts`,
`/visual-verify`, `/adversarial-review`). The furthest-reached stage is "current".
The pipeline counter reads the per-component verdict lines (`<name>: PASS|ISSUES`)
the prompt prints. Blockers come from `mcpErrors`, error-tone activity, a result
error, and retry storms. Pure + deterministic → unit-tested against transcripts.

`RunProgress.tsx` is presentational: stepper chips (done/active/pending), a bar at
`fraction`, the legend, the counter, and blocker cards. GuidedFlow renders it for
**every** op (build, verify, pipeline, source, commit) so the notification
structure is identical everywhere; the raw RunPanel stays behind "View details".

## Resumability

Two layers, most-robust first:

1. **File-derived (primary).** A shared `RESUMABLE` preamble on every batch prompt
   tells the agent to skip anything already complete on disk. Because status is
   derived from files, re-running the action continues from where it stopped —
   and this survives an app restart, since nothing depends on memory. This alone
   satisfies "don't re-run everything twice."

2. **Session resume (optimization).** `.vortspec/last-run.json` records the last
   run. `run-manager` seeds it `status:"running"` at start, captures the
   `sessionId` from system-init/result, and finalizes status on exit
   (passed/cancelled/failed). `getLastRun` returns it only when resumable: not
   `passed`, and not `running`-with-a-live-process (that's the in-flight banner's
   job). A persisted `running` with no live process (app was closed mid-run) reads
   as interrupted. The workspace shows a Resume card; `resumeRun()` starts a run
   with `resumeSessionId` + a continue prompt, restoring the kind/total so the
   progress view is intact. For verify/pipeline it re-ensures the harness first.

`AgentRunOptions.meta` (kind/label/total) is passed through so the main process can
persist the labels the renderer needs to rebuild the progress view on resume.

## Why not track live stage in the main process?

Stage is a presentation concern derived from data the renderer already has; keeping
it a pure renderer function avoids a second source of truth and keeps the main
process to its job (spawn, forward, persist). Aligns with "flow state is derivable
from files + the run log."

## Invariants honored

Claude Code executes every step; same CLI methodology; local-first (progress from
the run model, resume from a project file); no new agent logic; arg-array spawns
confined to the project.
