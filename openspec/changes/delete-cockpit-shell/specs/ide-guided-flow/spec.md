## RENAMED Requirements

- FROM: `### Requirement: The IDE runs the same actionable intake + foundation as the cockpit`
- TO: `### Requirement: The Flow activity runs an actionable intake + foundation`

## MODIFIED Requirements

### Requirement: The Flow activity runs an actionable intake + foundation
The IDE's Flow activity SHALL render the shared `Intake`/`GuidedFlow` from `@vortspec/ui`, embedded without the internal project rail. It SHALL present the intake questions and the actionable **"Extract tokens & detect components"** foundation step — not a read-only status list. The SDD-DE pipeline definitions SHALL be unchanged; only the surface is shared.

#### Scenario: Flow activity is actionable in the IDE

- **WHEN** the user opens the Flow activity in the IDE
- **THEN** it SHALL show the intake and the actionable foundation step, able to launch the extract-tokens/detect-components run
