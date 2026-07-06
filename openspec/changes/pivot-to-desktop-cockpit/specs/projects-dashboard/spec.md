## REMOVED Requirements

### Requirement: Projects grid display
**Reason**: Web projects dashboard superseded by the desktop dashboard (PRD v2 pivot); visual language reused.
**Migration**: Use the desktop project dashboard in `workspace-toolkit` (name, path, toolkit version, last run status).

### Requirement: Create project
**Reason**: Web project creation superseded by local folder selection/creation.
**Migration**: `workspace-toolkit` project folder selection creates or adopts a local folder.

### Requirement: Project card navigation
**Reason**: Web routing removed.
**Migration**: Desktop dashboard cards open the guided flow, folder, or terminal (`workspace-toolkit`).

### Requirement: Empty state
**Reason**: Re-homed to the desktop dashboard.
**Migration**: Desktop dashboard provides the no-projects empty state and onboarding entry.
