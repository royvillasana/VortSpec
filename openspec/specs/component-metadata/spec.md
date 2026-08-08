# component-metadata Specification

## Purpose
The per-component record that says what a component is FOR — selection criteria, variant purposes, anti-patterns with their corrections — as distinct from what it is made of. The layer that lets a generator choose a component deliberately rather than by name.

## Requirements
### Requirement: One VortSpec-owned metadata record per component
The system SHALL store exactly one structured metadata record per component at
`.vortspec/metadata/<normalized-name>.json`, owned by VortSpec and never written into the
application's own source tree. The record SHALL carry nine sections: `identity`, `usage`,
`variants`, `aiHints`, `composition`, `behavior`, `props`, `accessibility`, and `designTokens`.
No second metadata schema SHALL be authored anywhere else in the project.

#### Scenario: Record is created outside application source
- **WHEN** metadata is generated for a component named `Button`
- **THEN** the record is written to `.vortspec/metadata/button.json`
- **AND** no file under the project's `component_dir` is created or modified

#### Scenario: Every section is representable
- **WHEN** a record containing all nine sections is written and read back
- **THEN** the parsed record SHALL preserve every section without loss

### Requirement: Metadata separates discovery from intent
The `identity` section SHALL be sufficient to shortlist a component without reading the rest of
the record. `identity` SHALL carry `name`, `category` (`atom` | `molecule` | `organism` |
`template`), `type`, `description`, `importPath`, `generatedAt`, and — when the project is
Figma-backed — `figmaFile` and `figmaNode`.

#### Scenario: Shortlist without full reads
- **WHEN** an agent requests the discovery view of the metadata store
- **THEN** it SHALL receive only the `identity` section of every component
- **AND** it SHALL NOT receive `usage`, `composition`, `behavior`, or `examples`

### Requirement: Anti-patterns are structured triplets
Each entry in `usage.antiPatterns` SHALL be a triplet of `scenario`, `reason`, and `alternative`.
Free-text anti-pattern strings SHALL be rejected by the schema.

#### Scenario: Triplet accepted
- **WHEN** an anti-pattern `{scenario: "Two primary buttons in one section", reason: "Creates
  visual hierarchy confusion", alternative: "One primary, secondary for the rest"}` is written
- **THEN** the record validates

#### Scenario: Free text rejected
- **WHEN** an anti-pattern is written as the bare string `"Avoid multiple primary buttons"`
- **THEN** schema validation SHALL fail with an error naming the missing triplet fields

### Requirement: Variants and hints carry selection intent
The `variants` section SHALL record, per variant axis, its `options`, its `default`, and a
`purpose` map giving one clause per option. The `aiHints` section SHALL record `priority`,
`keywords`, and a `selectionCriteria` map stating when to choose each option. A record whose
component exposes variant axes SHALL NOT be considered complete without both maps.

#### Scenario: Variant purpose present
- **WHEN** metadata is generated for a component with a `variant` axis of
  `primary | secondary | ghost`
- **THEN** `variants.variant.purpose` SHALL contain an entry for each of the three options
- **AND** `aiHints.selectionCriteria` SHALL state when to choose each

#### Scenario: Incomplete record is reported
- **WHEN** a component exposes variant axes but its record has an empty `purpose` map
- **THEN** the metadata coverage report SHALL list that component as incomplete rather than
  as covered

### Requirement: Legacy four-field records migrate on read
The system SHALL read records written in the previous four-field shape — name, summary, usage,
patterns, and antiPatterns. On read they SHALL be migrated in memory:
`summary` to `identity.description`, `usage[]` to `usage.useCases`, `patterns[]` to
`usage.commonPatterns`, and `antiPatterns[]` to triplets whose `scenario` carries the original
text with `reason` and `alternative` empty. A migrated record SHALL be reported as incomplete.

#### Scenario: Legacy record still loads
- **WHEN** a pre-existing four-field record is read
- **THEN** it SHALL parse successfully into the nine-section shape
- **AND** the component SHALL be reported as having incomplete metadata

### Requirement: Metadata is generated from the specs, not re-derived
When Component and Interaction Specs exist for a component, generation SHALL transform them —
props, states, variants, accessibility, token usage, patterns, and anti-patterns — rather than
re-analyze the component source for facts the specs already state. Token names in `designTokens`
SHALL be resolved to their concrete values at generation time via the project's `token_file`.

#### Scenario: Specs drive the record
- **WHEN** metadata is generated for a component that has a Component Spec
- **THEN** `props`, `states`, and `accessibility` SHALL match the spec's tables
- **AND** `designTokens` entries SHALL carry resolved values, not token names alone

#### Scenario: Token values refresh
- **WHEN** a token value changes in `token_file` and metadata is regenerated
- **THEN** the affected `designTokens` values SHALL reflect the new value

### Requirement: Metadata reaches every grounded run
Metadata SHALL be loaded on demand into runs that compose with, edit, or build design-system
components. A run SHALL receive the `identity` view for the whole roster, and the full record only
for components in scope. Every interpolated field SHALL be sanitized as untrusted project data and
enclosed in an explicit data-not-instructions block.

#### Scenario: In-scope components carry full records
- **WHEN** a compose run targets `Button` and `Card`
- **THEN** the prompt SHALL carry the full records for `Button` and `Card`
- **AND** only the `identity` view for the remaining roster

#### Scenario: Injection is neutralized
- **WHEN** a metadata field contains text resembling an instruction to the agent
- **THEN** the field SHALL be sanitized before interpolation and presented as data
