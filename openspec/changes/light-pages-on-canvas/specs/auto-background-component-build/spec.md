## ADDED Requirements

### Requirement: Design-system components build automatically in the background

When a project's design system has detected-but-not-yet-built components, the system SHALL build them
AUTOMATICALLY in the background — without the user clicking a build button — in the framework the user
selected during the initial flow (`.sdd-de/project.yaml` `framework`). The build SHALL run in chunks of
FIVE components at a time, and each component SHALL be both BUILT and VERIFIED.

#### Scenario: The build starts on its own
- **WHEN** a project has components detected but not built (e.g. after extraction) and the user is working
  in the Playground
- **THEN** the component build begins automatically in the background, five components at a time
- **AND** each chunk is built and verified without the user initiating it

#### Scenario: Built in the selected framework
- **WHEN** the background build runs and the configured framework is (e.g.) Vue
- **THEN** the generated components are Vue components, not React

### Requirement: The build does not block the user's work

The background component build SHALL NOT block the user. The user SHALL be able to keep creating and
editing screens in the Playground while it runs, and it SHALL continue across the user's other actions.

#### Scenario: The user keeps working
- **WHEN** the background build is running
- **THEN** the user can still create, edit, and drag on screens in the Playground
- **AND** the build keeps progressing in the background

### Requirement: The user is notified on completion

The system MUST inform the user when the automatic background build finishes building and verifying all
remaining components. Progress MAY be surfaced while it runs.

#### Scenario: Completion notice
- **WHEN** the last chunk finishes building and verifying
- **THEN** the user is notified that the design-system components are built and verified
