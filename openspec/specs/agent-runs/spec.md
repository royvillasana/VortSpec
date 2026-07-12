# agent-runs Specification

## Purpose
TBD - created by archiving change resumable-and-observable-runs. Update Purpose after archive.
## Requirements
### Requirement: Holistic run progress
Every background run SHALL present a stage stepper, a progress bar with a
plain-language legend, and (for the pipeline) a component counter. Stages are
derived from the run's file/skill signals.

#### Scenario: Build shows its stages
- **WHEN** a build run is in flight
- **THEN** the workspace shows a stepper (Generating specs → Implementing), a
  progress bar, and a legend of the current stage — the same card structure used
  for verify

#### Scenario: Pipeline counts components
- **WHEN** the build-&-verify pipeline runs
- **THEN** the legend and counter report which component of how many is in progress

### Requirement: Surface blockers the user must resolve
When a run hits an issue the user may need to act on, the progress view SHALL
surface it as a fix-it message rather than burying it in the transcript.

#### Scenario: Figma MCP not connected
- **WHEN** the run reports an MCP error mentioning Figma
- **THEN** a blocker card explains it and how to reconnect

### Requirement: Runs resume where they left off
An interrupted run SHALL be resumable without redoing completed work, both by
re-running the (idempotent) action and by resuming the exact session.

#### Scenario: Re-running skips done work
- **WHEN** the user re-runs a batch action after an interruption
- **THEN** the prompt instructs the agent to skip components/specs/reports already
  on disk and only do the remaining work

#### Scenario: Resume the interrupted session
- **WHEN** the previous run for the project was cancelled or failed and a session
  id was captured
- **THEN** the workspace offers Resume, which continues that Claude Code session
  via `--resume`

#### Scenario: No resume after success or while active
- **WHEN** the last run completed successfully, or is genuinely still running
- **THEN** no Resume is offered (the in-flight banner covers an active run)

### Requirement: Last-run persistence
The app SHALL persist the last run per project (`.vortspec/last-run.json`) with its
session id, kind, label, total, and status, updating status on start and on exit.

#### Scenario: Interrupted by app close
- **WHEN** the app closes mid-run and reopens
- **THEN** the persisted "running" status with no live process is treated as
  interrupted and Resume is offered

### Requirement: Render harness provisioning for verify
Before an autonomous verify run, the app SHALL ensure a render harness (Storybook or dev
server) is running for the project and pass its live URL into the run.

#### Scenario: Storybook missing
- **WHEN** the project has no Storybook configuration
- **THEN** the app runs the `/storybook` skill once to create it before starting the
  server, and this bootstrap is idempotent (skipped if already present)

#### Scenario: Harness unavailable
- **WHEN** the harness cannot be started
- **THEN** verify still runs the code-level audit, the prompt states the live surface is
  unavailable, and the agent logs any browser-only check as "pending" rather than asking
  the user to start a server

### Requirement: Autonomous verify prompt contract
The verify prompt SHALL instruct Claude Code to run visual-verify and adversarial-review
end-to-end without user interaction, using the provided harness URL and the Figma MCP,
fixing discrepancies inline and writing the report files plus a final one-line verdict.

#### Scenario: Verdict line
- **WHEN** a verify run finishes
- **THEN** its final line is `VERIFY: PASS` or `VERIFY: ISSUES (n)`, and the report files
  exist under `specs/<component>/`

