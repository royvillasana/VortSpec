## ADDED Requirements

### Requirement: Figma URL import trigger
The import page SHALL provide a text input where users can paste a Figma file URL. A "Connect Figma" button SHALL validate the URL and start the import.

#### Scenario: User pastes Figma URL and imports
- **WHEN** user pastes `https://figma.com/design/ABC123/My-Design` and clicks import
- **THEN** the system SHALL create a source record with `kind: 'figma'` and `figma_file_key: 'ABC123'`
- **AND** start the import process

### Requirement: Figma import progress
The import progress screen SHALL show stages specific to Figma import: Discover (read file structure), Extract Variables, Extract Components, Map to IR, Report.

#### Scenario: Progress updates during Figma import
- **WHEN** a Figma import is running
- **THEN** the progress screen SHALL show each Figma-specific stage with status indicators

### Requirement: Completion with confirmed counts
After Figma import completes, the completion summary SHALL show token count (with confirmed/inferred breakdown), component count, and issue count.

#### Scenario: Figma import completes
- **WHEN** all Figma import stages finish
- **THEN** the summary SHALL show "N tokens (M confirmed)", "N components", "N issues"
