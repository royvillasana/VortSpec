# workspace-autosave Specification

## Purpose
TBD - created by archiving change component-chunking-and-workspace-ergonomics. Update Purpose after archive.
## Requirements
### Requirement: Debounced disk autosave
Edits to an open file SHALL be autosaved to disk after a short idle debounce, reusing the existing write path, without clobbering a file that changed on disk externally.

#### Scenario: Idle edit autosaves
- **WHEN** the user edits a file and stops typing for the debounce interval
- **THEN** the file SHALL be written to disk and its dirty marker cleared

#### Scenario: External change suppresses autosave
- **WHEN** an open dirty file has changed on disk externally (stale)
- **THEN** autosave SHALL NOT overwrite it and the stale state SHALL remain surfaced

### Requirement: Assisted commit message
The Source Control view SHALL offer a one-click action that drafts a commit message from the staged diff using a lightweight model, filling the editable commit input. Committing SHALL remain a deliberate user action; the app SHALL NOT auto-commit.

#### Scenario: Draft a message
- **WHEN** the user clicks "Draft message" with staged changes
- **THEN** an editable commit message SHALL be generated and placed in the input
- **AND** no commit SHALL occur until the user clicks Commit

