# agent-runs

## ADDED Requirements

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
