## ADDED Requirements

### Requirement: The welcome screen offers a walk-through project

The WorkspacePicker SHALL present an action to open a bundled **walk-through project** — a complete, correctly-structured SDD-DE reference — so a new user can learn the expected structure without creating or cloning anything.

#### Scenario: Walk-through action is available

- **WHEN** a user is on the welcome screen
- **THEN** an "Open the walk-through project" action SHALL be shown alongside Create / Open / Clone

### Requirement: Opening the walk-through instantiates a real project

Choosing the walk-through SHALL copy the bundled SDD-DE reference into a folder the user selects and open it as a normal project (with `DESIGN.md`, `.sdd-de/`, `src/`, `.storybook/`, and `specs/` present). It SHALL NOT modify the bundled template, and extraction SHALL be confined to the chosen folder.

#### Scenario: Extract and open

- **WHEN** the user picks an empty destination folder for the walk-through
- **THEN** the reference project SHALL be extracted into that folder and opened, with its SDD-DE files present

#### Scenario: Runs like any project

- **WHEN** the user opens the walk-through's Run view
- **THEN** it SHALL start like any project (dependencies auto-installed on first run, since `node_modules` is not bundled)

#### Scenario: Extraction failure is reported

- **WHEN** the bundled archive cannot be found or extracted
- **THEN** a human-readable error SHALL be shown and no partial project SHALL be opened
