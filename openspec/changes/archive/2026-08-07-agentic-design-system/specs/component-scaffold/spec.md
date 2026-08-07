## ADDED Requirements

### Requirement: A component is created by a deterministic scaffold
The system SHALL create a new design-system component through a deterministic scaffold that writes
the component's full file set, rather than relying on a model to produce that structure from
instructions. The scaffold SHALL produce the same file set, in the same shape, for the same inputs.
A model SHALL supply a component's content — markup, variant logic, and the analysis-derived
metadata sections — but SHALL NOT be responsible for deciding which files exist.

#### Scenario: Same inputs produce the same structure
- **WHEN** the scaffold is run twice for the same component name, tier, and framework
- **THEN** the same set of files SHALL be produced at the same paths

#### Scenario: Structure is not model-decided
- **WHEN** a component is created
- **THEN** its file set SHALL be determined by the scaffold
- **AND** a missing file SHALL be a scaffold failure, not a generation-quality issue

### Requirement: The scaffold writes a metadata record for every component
The scaffold SHALL write a metadata record at `.vortspec/metadata/<name>.json` as part of creating
the component, so that metadata coverage is structural rather than dependent on a later step. The
record SHALL be created with its `identity` section fully populated and its analysis-derived
sections marked incomplete until generated.

#### Scenario: Coverage cannot regress below the roster
- **WHEN** a component is created through the scaffold
- **THEN** a metadata record SHALL exist for it immediately
- **AND** metadata coverage SHALL report it as present but incomplete until the analysis sections
  are generated

#### Scenario: No component without a record
- **WHEN** the metadata coverage report is generated for a project whose components were all
  created through the scaffold
- **THEN** no component SHALL be reported as missing a record

### Requirement: The scaffold produces the project's full component file set
The scaffold SHALL write, for the project's configured framework, language, and styling: the
component implementation, its variant definitions where the styling approach separates them, a test
file, and the barrel export — and SHALL register the component in the component directory's index
where the project uses one. Files that do not apply to the configured stack SHALL be omitted rather
than emitted empty.

#### Scenario: Full set for the configured stack
- **WHEN** a component is scaffolded in a project configured for React, TypeScript, and CSS modules
- **THEN** the implementation, style module, test file, and barrel export SHALL be written
- **AND** the component SHALL be registered in the component index

#### Scenario: Inapplicable files are omitted
- **WHEN** a component is scaffolded in a project whose styling approach carries variants inline
- **THEN** no separate variants file SHALL be written
- **AND** no empty placeholder file SHALL be left behind

#### Scenario: Test file is real
- **WHEN** a component is scaffolded
- **THEN** its test file SHALL contain at least one executable assertion that the component renders
- **AND** the project's test runner SHALL pass on the newly scaffolded component

### Requirement: Scaffolded components declare their governance surface
The scaffold SHALL record, per component, the styling approach its values were written in, so that
the design audit knows what it can and cannot check for that component. A component whose styling
approach does not expose token references as discrete declarations SHALL be marked as having
reduced audit coverage rather than silently reported as clean.

#### Scenario: Auditable styling is checked fully
- **WHEN** a component's values are written as token references in a stylesheet or style module
- **THEN** the audit SHALL evaluate the full governance rule set against it

#### Scenario: Reduced coverage is stated, not hidden
- **WHEN** a component's styling approach does not expose discrete token declarations the audit can
  reason over
- **THEN** the component SHALL be reported as having reduced audit coverage
- **AND** it SHALL NOT be reported as passing the rules that could not be evaluated

### Requirement: Scaffolding never writes into a consumed design system
For a project that consumes an external design system, the scaffold SHALL NOT create components in
the consumed library's source tree.

#### Scenario: Consumed library is untouched
- **WHEN** a component is scaffolded in a consume-source project
- **THEN** it SHALL be created in the project's own component directory
- **AND** no file in the consumed library SHALL be created or modified
