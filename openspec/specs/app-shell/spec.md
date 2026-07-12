# Capability: App Shell

## Purpose

Shared layout shell for the Design Inspector application, providing persistent navigation, chat strip, and dark theme across all inspector routes.
## Requirements
### Requirement: Design manifest stage in the guided flow
The guided flow SHALL include a gated Design-manifest stage positioned after
Verification and before Publish, producing the `DESIGN.md` artifact. The stage
SHALL link to the Design Manifest screen and SHALL not let Publish proceed for
the manifest until it is approved.

#### Scenario: Manifest stage appears after verification
- **WHEN** the guided flow renders its stages
- **THEN** a "Design manifest" stage SHALL appear between Verification and Publish, showing the `DESIGN.md` artifact and a link to open it

#### Scenario: Manifest stage gates publish
- **WHEN** the Design-manifest stage has not been approved
- **THEN** the flow SHALL show it as needing review and SHALL not advance to Publish

### Requirement: Design manifest navigation destination
The application SHALL provide a way to reach the Design Manifest screen for a
project once the manifest stage is available (from the flow stage and the nav).

#### Scenario: Open the manifest screen
- **WHEN** the user activates the Design-manifest destination
- **THEN** the Design Manifest screen SHALL open for the active project

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

