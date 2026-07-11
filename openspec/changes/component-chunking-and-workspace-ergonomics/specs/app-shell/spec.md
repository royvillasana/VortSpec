## ADDED Requirements

### Requirement: Home affordance in the activity bar
The IDE activity bar SHALL provide a Home item that returns to the homepage (project picker) by closing the current workspace, using the same path as the existing breadcrumb Home button.

#### Scenario: Click Home returns to the project picker
- **WHEN** a workspace is open and the user clicks the Home item in the activity bar
- **THEN** the workspace SHALL close and the homepage project picker SHALL be shown

### Requirement: Persistent uncommitted-and-unpushed indicator
The IDE status bar SHALL show a persistent indicator of the number of local uncommitted changes and the number of commits not yet pushed, refreshed on workspace changes, and clicking it SHALL open the Source Control view.

#### Scenario: Editing surfaces the change count
- **WHEN** the working tree has uncommitted changes or unpushed commits
- **THEN** the status bar SHALL show the change and unpushed counts
- **AND** clicking the indicator SHALL open Source Control
