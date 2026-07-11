# ide-shell Specification

## Purpose
TBD - created by archiving change vortspec-ide. Update Purpose after archive.
## Requirements
### Requirement: VortSpec IDE is a separate Electron application
The IDE SHALL ship as `apps/ide`, a second Electron application distinct from the cockpit, reusing the same main-process handlers from `packages/core`. It SHALL be packaged and signed as its own macOS artifact in the existing release pipeline.

#### Scenario: IDE launches independently
- **WHEN** the user opens the VortSpec IDE
- **THEN** it starts as its own app window, mounts the `core` IPC handlers, and does not require the cockpit app to be running

#### Scenario: Second signed macOS artifact
- **WHEN** the release pipeline runs
- **THEN** it produces a separate signed IDE dmg alongside the cockpit dmg, and the site can offer both downloads

### Requirement: VS Code–style four-region layout
The IDE SHALL present four regions: an Activity/Explorer sidebar on the left, an editor group in the center, a live preview pane paired with the editor, and the assistant chat on the right.

#### Scenario: Regions are present
- **WHEN** a workspace is open in the IDE
- **THEN** the user sees the Explorer sidebar, the Monaco editor group, the live preview pane, and the right-hand assistant chat simultaneously

#### Scenario: Activity bar switches the sidebar panel
- **WHEN** the user selects an activity icon (Explorer, Source Control, Tokens, Tasks, Manifest)
- **THEN** the sidebar shows the corresponding panel from `packages/ui`, without leaving the IDE layout

### Requirement: Workspace open and switch
The IDE SHALL let the user open a project folder as a workspace and switch between projects, operating only within the selected workspace root.

#### Scenario: Open a workspace
- **WHEN** the user opens a project folder
- **THEN** the Explorer shows that folder's file tree and all editor/preview/Git/run actions are scoped to that workspace root

#### Scenario: Switch workspace
- **WHEN** the user switches to a different project
- **THEN** the editor, Explorer, preview, and panels re-bind to the new workspace and no action leaks into the previous one

### Requirement: Raw-form escape hatch preserved
Every friendly view in the IDE SHALL retain a one-click path to the raw form (open the file, reveal in the OS, or the run's raw transcript), preserving the local-first/transparent invariant.

#### Scenario: Jump to the raw file
- **WHEN** the user is viewing a panel or preview backed by a file
- **THEN** a one-click action opens that file (or reveals it) so the user can see the raw source

