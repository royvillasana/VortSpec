## ADDED Requirements

### Requirement: The system computes an AI-readiness level
The system SHALL compute a design-system AI-readiness level on a five-point scale — Libraries,
Standardised, Governed, Operational, Agentic — from signals the index and metadata store already
hold: metadata coverage and completeness, token determinism, the number of encoded governance
rules, relationship density, and the current violation rate. The level SHALL be computed, never
self-declared or entered by hand.

#### Scenario: Level derives from signals
- **WHEN** a project has components and tokens but no metadata records and no governance rules
- **THEN** the computed level SHALL be Libraries

#### Scenario: Level rises with encoded governance
- **WHEN** that project gains complete metadata coverage and an encoded governance rule set
- **THEN** the computed level SHALL rise
- **AND** the signals responsible SHALL be attributable in the result

### Requirement: The level names the next action
The readiness result SHALL state the specific next action that would raise the level, referring to
the concrete gap rather than to the level's name.

#### Scenario: Actionable next step
- **WHEN** a project sits at Standardised because governance rules are absent
- **THEN** the next action SHALL name encoding the governance rules, not "reach Governed"

#### Scenario: Highest level has no next action
- **WHEN** a project computes as Agentic
- **THEN** the result SHALL state that no further level is available

### Requirement: The level is surfaced in the design system workspace
The AI-readiness level SHALL be displayed in the design system surface alongside existing readiness
signals, and SHALL be distinguishable from them — readiness validates that connected assets are
present and usable, whereas the AI-readiness level measures structural precision for machine
consumption.

#### Scenario: Both signals visible
- **WHEN** the user opens the design system surface for a project with an existing readiness report
- **THEN** both the readiness report and the AI-readiness level SHALL be shown as distinct signals

#### Scenario: Level refreshes with the index
- **WHEN** the index is rebuilt after components or metadata change
- **THEN** the displayed level SHALL be recomputed
