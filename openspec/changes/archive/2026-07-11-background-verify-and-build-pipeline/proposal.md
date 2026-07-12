# Background verify & build pipeline

## Why

In the Design System workspace, clicking **Verify** (or verifying after a re-scan
adds new components) drops the user into `/visual-verify` — a skill whose checklist
("open the component in the browser at 375/768/1440px", "open the Figma frame in Dev
Mode", "check DevTools → Computed", then "Next step → /adversarial-review") is meant
to be the **agent's** internal QA rubric, not a user to-do list. Because the app:

1. never launches a render harness before verify (so the agent has no live component
   to inspect and instructs the user to open one instead),
2. hands the run a narrow toolset and streams the raw checklist churn into the panel, and
3. never chains build → verify the way the CLI's `sdd-mandatory-steps` sequence does,

…the user is "hit with a set of steps that the user shouldn't see" and has to interact
where the CLI would have the agent run autonomously in the background. This is worst in
the incremental case the product is built around: scan a few components, then re-scan
for the rest — each new component needs building *and* verifying without manual
per-step babysitting.

This violates two invariants: **"same steps as the CLI"** (the CLI runs verify as an
autonomous agent session; we surfaced its internal rubric as friction) and **"every
friendly view has a one-click path"** without forcing the raw form on the user.

## What Changes

- **Auto-provision a render harness for verify.** Before a verify run, bring the
  project's Storybook/dev-server up in the background (reusing `dev-server.ts`); if the
  project has no Storybook yet, run the `/storybook` skill first (the CLI's own
  transition step). Pass the live URL + Figma file URL into the verify prompt so the
  agent has everything it needs to run headless.
- **Autonomous, non-interactive verify.** Rewrite the verify prompt to run
  `visual-verify` **and** `adversarial-review` end-to-end, fix discrepancies inline,
  never ask the user to open a browser/Figma or perform checklist steps, and finish
  with a written report + a one-line PASS / ⚠ issues summary. Honor the headless
  constraint honestly: the code-level audit (token/variant/state/a11y/spec) + Figma-MCP
  screenshots run autonomously; any true browser-only pixel check is logged in the
  report, never handed to the user.
- **Outcome, not process.** The workspace presents verify as a compact background task
  (`Verifying Button… → ✓ passed / ⚠ 2 issues`) read from the report via the existing
  verification-reader; the raw transcript is available only behind "View details."
- **Stitch the incremental pipeline.** A "Build & verify the rest" action runs, per new
  component, the CLI's Apply → Verify chain as one background run with a single gate at
  the end. Per-row Build / Verify stay for one-offs.
- **Reconnect to in-flight runs.** The workspace adopts an already-running build/verify
  when re-mounted (so leaving and returning shows live status) and disables start
  actions while one is running, preventing duplicate concurrent runs on the same files.

## Impact

- Affected specs: `design-system-workspace` (verify UX + incremental pipeline),
  `agent-runs` (harness provisioning, autonomous verify contract).
- Affected code: `renderer/src/views/GuidedFlow.tsx` (prompts, pipeline, reconnect,
  outcome cards), `renderer/src/lib/useAgentRun.ts` (adopt-active-run),
  `main/workspace/dev-server.ts` (ensure-harness-up + `/storybook` bootstrap),
  `main/inspector/verification-reader.ts` (report summary for cards), IPC for
  harness-ensure. No change to skills or agent logic — Claude Code still executes every
  step; we provision and present it.
