# run-view Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Live implementation progress

During the implementation stage, VortSpec SHALL stream progress: the current task, files being created or edited with their paths, tool activity, and a friendly log.

#### Scenario: Implementation is running

- **WHEN** an implementation step is running
- **THEN** the run view shows the current task, the files being created/edited with paths, tool activity, and a readable log that updates live

### Requirement: Raw terminal toggle

Every friendly run view SHALL provide a toggle that reveals the underlying raw terminal, keeping transparency one click away.

#### Scenario: User reveals the terminal

- **WHEN** the user toggles the terminal view during a run
- **THEN** the raw Claude Code terminal output is shown, and toggling back returns to the friendly view

### Requirement: Clean cancel

Cancel SHALL always be available during a run and SHALL kill the child process cleanly without corrupting flow state.

#### Scenario: User cancels a run

- **WHEN** the user cancels an in-progress run
- **THEN** the child process is terminated cleanly, the stage returns to a non-corrupt state, and the app remains usable

### Requirement: State derived from disk

Flow state SHALL be derivable from files on disk plus the run log, so a crashed or hung run is recoverable and the app can be closed and reopened mid-flow.

#### Scenario: App reopened mid-flow

- **WHEN** the app is closed during a run and reopened
- **THEN** VortSpec reconstructs the flow state from the project files and run log rather than losing progress

