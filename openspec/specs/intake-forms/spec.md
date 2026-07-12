# intake-forms Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: CLI discovery rendered as a friendly wizard

VortSpec SHALL render the CLI's initial discovery questions (the CTO-style intake) as a friendly form/wizard, and SHALL write the answers into the project in the format the SDD-DE skills expect before the corresponding Claude Code step runs.

#### Scenario: User completes intake

- **WHEN** the user answers the intake wizard
- **THEN** VortSpec writes the answers to the project in the skills' expected format and then runs the corresponding SDD-DE step

#### Scenario: Answers persist to disk

- **WHEN** intake answers are captured
- **THEN** they are stored as plain files in the project folder so flow state survives closing and reopening the app

