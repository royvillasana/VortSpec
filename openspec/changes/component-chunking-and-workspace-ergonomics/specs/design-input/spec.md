## ADDED Requirements

### Requirement: ZIP design source via file picker and drag-and-drop
The design-input surface SHALL let the user choose a `.zip` export through a native file picker and through drag-and-drop, resolving the dropped file to an absolute path via the preload bridge. The app SHALL capture the path only and record it as `zipFilePath`; extraction SHALL remain the engine's responsibility.

#### Scenario: Pick a ZIP from the file dialog
- **WHEN** the user clicks "Choose .zip…" and selects a file in the native dialog
- **THEN** the selected absolute path SHALL populate the ZIP source and enable Continue

#### Scenario: Drop a ZIP onto the dropzone
- **WHEN** the user drags a `.zip` file onto the dropzone
- **THEN** the file SHALL resolve to an absolute path and populate the ZIP source
- **AND** the app SHALL NOT attempt to extract the archive itself
