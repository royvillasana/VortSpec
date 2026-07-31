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

### Requirement: Component-library sources yield a consume outcome
Selecting a component library at setup SHALL result in the library's real components becoming consumable — source copied into `component_dir` for cli-registry libraries, or the package installed and importable for installed-package/headless libraries — parallel to how the Figma, ZIP, and GitHub sources land their source of truth. The design-source contract SHALL NOT treat a selected library as merely a written reference to rebuild from.

#### Scenario: Library selected as design source
- **WHEN** the user completes setup with a component library as the design source and provisions it
- **THEN** the library's real components are present (copied or installed) and are the source of truth the pipeline reads, rather than an empty `component_dir` that triggers a from-scratch rebuild

#### Scenario: Supersedes provisioning-only handling
- **WHEN** this capability is applied
- **THEN** it absorbs the in-flight `provision-library-source` behavior and additionally covers readiness, no-rebuild enforcement, Storybook handling, and DESIGN.md for consume sources

