## ADDED Requirements

### Requirement: ZIP upload via drag-and-drop
The New Import screen SHALL provide a drag-and-drop zone accepting ZIP files up to 50 MB containing HTML/CSS exports. The zone SHALL display visual feedback during drag-over (border highlight, icon change).

#### Scenario: User uploads a valid ZIP
- **WHEN** user drags a ZIP file onto the upload zone
- **THEN** the zone SHALL highlight with accent border color `#7C6FF0`
- **AND** on drop, the file SHALL be accepted and an import job SHALL be created

#### Scenario: Invalid file rejected
- **WHEN** user drops a non-ZIP file or a file exceeding 50 MB
- **THEN** the system SHALL show a human-readable error message with next steps

### Requirement: Figma connection option
The import screen SHALL provide an alternative to connect via Figma by pasting a file URL or initiating OAuth.

#### Scenario: User pastes Figma URL
- **WHEN** user pastes a Figma file URL in the input field
- **THEN** the system SHALL validate the URL format and initiate the Figma import flow

### Requirement: Companion design system attachment
The import screen SHALL allow optional attachment of a companion design system (tokens JSON, CSS custom properties file, or second ZIP).

#### Scenario: User attaches companion DS
- **WHEN** user attaches a W3C design tokens JSON alongside the primary import
- **THEN** the pipeline SHALL use it as the official token source for matching in DS merge stage

### Requirement: Import progress tracking
The Import Progress screen SHALL display the six pipeline stages (Parse, Style Mining, Token Inference, Structure Inference, DS Merge, Report) with per-stage status indicators: queued (gray), running (animated blue), done (green check), failed (red with error message).

#### Scenario: Pipeline stages progress
- **WHEN** an import job is running
- **THEN** the progress screen SHALL show each stage with its current status
- **AND** the active stage SHALL display a running animation

#### Scenario: Stage failure with retry
- **WHEN** a pipeline stage fails
- **THEN** that stage SHALL display a red error indicator with a human-readable reason
- **AND** a "Retry" button SHALL allow re-running the failed stage without re-running completed stages

### Requirement: Navigation to inspector on completion
When all pipeline stages complete successfully, the progress screen SHALL provide a button to navigate to the Design Inspector.

#### Scenario: Import completes successfully
- **WHEN** all six pipeline stages reach "done" status
- **THEN** a "View in Inspector" button SHALL appear
- **AND** clicking it SHALL navigate to `/projects/[id]/inspect/tokens`
