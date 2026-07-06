## ADDED Requirements

### Requirement: Project folder selection

VortSpec SHALL let the user select an existing folder or create a new one as the project workspace, and SHALL confine all subsequent child processes to that folder.

#### Scenario: User selects a project folder

- **WHEN** the user chooses or creates a folder during onboarding
- **THEN** VortSpec records it as the active workspace and scopes agent runs, PTY sessions, and file watching to that path

### Requirement: SDD-DE toolkit install and update

When the SDD-DE toolkit is not present in the selected project, VortSpec SHALL install it (the same mechanism as the CLI's init); when present, VortSpec SHALL offer to update it. VortSpec SHALL report the installed toolkit version.

#### Scenario: Toolkit missing on a fresh project

- **WHEN** a project folder has no SDD-DE toolkit
- **THEN** VortSpec installs the toolkit into the project and reports the installed version

#### Scenario: Toolkit present but outdated

- **WHEN** a project already contains the toolkit at an older version
- **THEN** VortSpec offers to update it and, on confirmation, updates and reports the new version

### Requirement: Project dashboard

VortSpec SHALL present a dashboard listing known projects with name, path, SDD-DE toolkit version, and last run status, plus quick actions to open the guided flow, open the folder, and open a terminal.

#### Scenario: Dashboard lists a known project

- **WHEN** the user opens the dashboard with at least one known project
- **THEN** each project card shows its name, path, toolkit version, and last run status with the quick actions available
