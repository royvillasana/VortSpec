# ide-guided-flow Specification

## Purpose
TBD - created by archiving change ide-guided-flow-parity. Update Purpose after archive.
## Requirements
### Requirement: The IDE runs the same actionable intake + foundation as the cockpit

The IDE's Flow activity SHALL render the same actionable **Intake** and **Guided Flow** the cockpit runs (the shared `Intake`/`GuidedFlow` from `@vortspec/ui`), embedded without the internal project rail. It SHALL present the intake questions and the actionable **"Extract tokens & detect components"** foundation step — not a read-only status list. The SDD-DE pipeline definitions SHALL be unchanged; only the surface is shared.

#### Scenario: Flow activity is actionable in the IDE

- **WHEN** the user opens the Flow activity in the IDE
- **THEN** it SHALL show the intake and the actionable foundation step (able to launch the extract-tokens/detect-components run), identical to the cockpit

### Requirement: The intake → foundation pipeline auto-starts for new and un-founded projects

Creating a project in the IDE SHALL route **Create → Intake → Foundation** automatically. Opening any project whose **foundation is not yet set up** (no extracted tokens and no detected components) SHALL land the IDE on the Flow/foundation rather than the Explorer. Once the foundation exists, the IDE SHALL default to the Explorer, with Flow still reachable.

#### Scenario: New project auto-starts the pipeline

- **WHEN** the user creates a new project in the IDE
- **THEN** the IDE SHALL present the Intake and then the Foundation automatically (no manual navigation required)

#### Scenario: Un-founded project lands on the foundation

- **WHEN** the user opens a project that has no extracted tokens or detected components
- **THEN** the IDE SHALL open on the Flow/foundation step

#### Scenario: Founded project opens normally

- **WHEN** the user opens a project whose foundation is already set up
- **THEN** the IDE SHALL default to the Explorer, and the Flow SHALL remain reachable

