## RENAMED Requirements

- FROM: `### Requirement: VortSpec IDE is a separate Electron application`
- TO: `### Requirement: VortSpec IDE is the Electron application`

## MODIFIED Requirements

### Requirement: VortSpec IDE is the Electron application
The IDE SHALL ship as `apps/ide`, the project's Electron application, mounting the main-process handlers from `packages/core`. It SHALL be packaged as a macOS artifact by the release pipeline.

#### Scenario: IDE launches independently
- **WHEN** the user opens the VortSpec IDE
- **THEN** it starts as its own app window and mounts the `core` IPC handlers

#### Scenario: The release produces the macOS artifacts
- **WHEN** the release pipeline runs
- **THEN** it produces the arm64 and Intel IDE dmgs the site offers for download, and the packaged app is verified to open a window before it is published
