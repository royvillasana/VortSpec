# design-governance Specification

## Purpose
Rules that ask whether a token was used with INTENT, not merely whether it exists. A token that resolves and lands on the wrong property passes every existence check, and is the failure a design system actually accumulates.

## Requirements
### Requirement: Design decisions are encoded as machine-readable rules
The system SHALL persist the project's design decisions as machine-readable governance rules under
`.vortspec/ai/governance/`, covering at minimum: the foreground and background hierarchy, the
elevation scale and its coherence with surface size and stacking order, the semantic color model,
and typography composites. Each rule SHALL state what is valid and what violates its intent.

#### Scenario: Rules are persisted and readable
- **WHEN** governance is configured for a project
- **THEN** the rule set SHALL exist under `.vortspec/ai/governance/` in a machine-readable form
- **AND** each rule SHALL be individually addressable by the audit

### Requirement: The audit checks intent, not only existence
The design audit SHALL report violations where a token reference is syntactically valid and the
token exists, but is applied against the encoded intent of a governance rule. Existence checks
(hardcoded values, drift from the design source) SHALL continue to be reported alongside them.

#### Scenario: Valid token in the wrong hierarchy position
- **WHEN** a muted foreground token is applied to body copy
- **THEN** the audit SHALL report a hierarchy violation
- **AND** the finding SHALL state the expected hierarchy position

#### Scenario: Semantic token used decoratively
- **WHEN** a token whose meaning is destructive is used for a decorative surface
- **THEN** the audit SHALL report a semantic-color violation

#### Scenario: Existing checks still fire
- **WHEN** a component hardcodes a color value that a token already names
- **THEN** the audit SHALL still report the hardcoded-value finding

#### Scenario: Intent checking finds strictly more
- **WHEN** the audit runs over a fixture containing both syntactic and intent violations
- **THEN** the reported findings SHALL include every finding the existence-only checks produce
- **AND** SHALL additionally include the intent violations

### Requirement: Governance findings carry a fix
Every governance finding SHALL name the component, the file when known, a severity, its rule, and
a single-line statement of the correction. Findings SHALL be surfaced in the project's issue
tracking alongside existing verification findings.

#### Scenario: Finding is actionable
- **WHEN** a governance violation is reported
- **THEN** the finding SHALL name the rule it violates and state the correction
- **AND** it SHALL appear in the issues panel, filterable by kind

### Requirement: Adoption and violation reports are generated from the index
The system SHALL generate an adoption report and a token-violation report under
`.vortspec/ai/reports/`. The adoption report SHALL cover per-component utilization, unused
components, efficiency, and shadow implementations. The token-violation report SHALL group
violations by component. Both SHALL be regenerable on demand and SHALL carry a `generatedAt` stamp.

#### Scenario: Adoption report content
- **WHEN** the adoption report is generated for a project with an unused component
- **THEN** that component SHALL appear in the unused section
- **AND** any shadow implementation SHALL appear naming the component it bypasses

#### Scenario: Violations grouped by component
- **WHEN** the token-violation report is generated
- **THEN** violations SHALL be grouped under the component they occur in

### Requirement: Report generation stays off the interactive path
Report generation SHALL run in the background, SHALL NOT block an interactive run, and SHALL be
routed to the least expensive model capable of holding the report schema.

#### Scenario: Reports do not block editing
- **WHEN** a report is generating
- **THEN** the user SHALL be able to continue editing and composing
- **AND** the report SHALL surface when it completes

### Requirement: Governance never mutates a consumed design source
For a project that consumes an external design system, governance findings SHALL be reported
against the consumed code without modifying it, and any correction SHALL be routed to the durable
overlay rather than the vendor's source.

#### Scenario: Consumed source is not written
- **WHEN** a governance violation is found in a consumed library's component
- **THEN** the finding SHALL be reported
- **AND** no file in the consumed library SHALL be modified
