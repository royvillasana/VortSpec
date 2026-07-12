# code-workspace Specification

## Purpose
TBD - created by archiving change vortspec-ide. Update Purpose after archive.
## Requirements
### Requirement: Monaco-based code editing
The IDE SHALL edit project files in a Monaco editor with syntax highlighting, tabs for multiple open files, and dirty/save state. Monaco and its language workers SHALL be bundled locally (no CDN), consistent with the local-first invariant.

#### Scenario: Open and edit a file
- **WHEN** the user opens a file from the Explorer
- **THEN** it opens in a Monaco tab with syntax highlighting, and edits mark the tab dirty until saved

#### Scenario: Save persists to disk
- **WHEN** the user saves a dirty file
- **THEN** the file on disk is updated within the workspace root and the tab is no longer dirty

#### Scenario: Editor works offline
- **WHEN** the IDE runs without network access
- **THEN** Monaco and its language features load from the bundled assets, not a remote CDN

### Requirement: File-tree Explorer
The IDE SHALL show a file-tree Explorer of the workspace root that lists files/folders, expands directories, and opens files into the editor.

#### Scenario: Browse and open
- **WHEN** the user expands a folder and clicks a file
- **THEN** the file opens in the editor and its path is scoped within the workspace root

### Requirement: File operations are gated to the workspace root
All file read/list/save operations SHALL run through `packages/core` handlers that resolve paths only within the selected workspace root, rejecting path-escape attempts. The renderer SHALL NOT perform raw filesystem access.

#### Scenario: Path-escape is rejected
- **WHEN** a file operation resolves to a path outside the workspace root (e.g. via `..`)
- **THEN** the operation is rejected and no file outside the root is read or written

### Requirement: On-disk changes are reflected
The IDE SHALL watch the workspace for on-disk changes (including files written by Claude Code runs) and reflect them in the Explorer and open editors, without silently overwriting unsaved edits.

#### Scenario: Agent run writes a file
- **WHEN** a run writes or modifies a file in the workspace
- **THEN** the Explorer updates and, if that file is open, the editor surfaces a "changed on disk — reload?" affordance rather than clobbering unsaved edits

### Requirement: Git diffs shown in the editor
The IDE SHALL show file diffs using Monaco's diff editor, fed by the shared Git adapter, honoring the additive-only Git guardrails (no branch deletion, no force-push).

#### Scenario: View a change diff
- **WHEN** the user opens a changed file's diff from Source Control
- **THEN** the IDE renders the working-tree-vs-index (or vs-HEAD) diff in Monaco's diff editor

