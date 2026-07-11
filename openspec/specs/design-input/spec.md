# design-input Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Design source input matching the CLI

VortSpec SHALL accept the design source exactly as the SDD-DE CLI supports: a Figma link (resolved through the user's configured Figma MCP in Claude Code), a ZIP export (Google Stitch, Claude Design, or generic HTML/CSS) dropped into the app, or an existing folder/repo.

#### Scenario: ZIP export dropped into the app

- **WHEN** the user drops a design-export ZIP onto the design-input surface
- **THEN** VortSpec places it at the project's expected input path so the SDD-DE step can consume it

#### Scenario: Figma link provided

- **WHEN** the user provides a Figma link
- **THEN** VortSpec passes it to the Claude Code step, which reaches Figma via the user's configured Figma MCP (VortSpec ships no Figma REST adapter of its own)

### Requirement: MCP misconfiguration surfaced as a fix-it card

When run events indicate the Figma MCP is missing or unauthenticated, VortSpec SHALL render a fix-it card explaining the problem and next step, rather than a raw error.

#### Scenario: Figma MCP unauthenticated

- **WHEN** a run emits an event indicating the Figma MCP is missing or unauthenticated
- **THEN** VortSpec renders a fix-it card with a human-readable explanation and a next step, not a raw stack trace

### Requirement: ZIP design source via file picker and drag-and-drop
The design-input surface SHALL let the user choose a `.zip` export through a native file picker and through drag-and-drop, resolving the dropped file to an absolute path via the preload bridge. The app SHALL capture the path only and record it as `zipFilePath`; extraction SHALL remain the engine's responsibility.

#### Scenario: Pick a ZIP from the file dialog
- **WHEN** the user clicks "Choose .zip…" and selects a file in the native dialog
- **THEN** the selected absolute path SHALL populate the ZIP source and enable Continue

#### Scenario: Drop a ZIP onto the dropzone
- **WHEN** the user drags a `.zip` file onto the dropzone
- **THEN** the file SHALL resolve to an absolute path and populate the ZIP source
- **AND** the app SHALL NOT attempt to extract the archive itself

