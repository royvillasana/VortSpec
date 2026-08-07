## ADDED Requirements

### Requirement: One canonical token artifact in W3C DTCG form
The system SHALL persist the design source's variables as a single canonical artifact at
`.vortspec/tokens.json` in W3C Design Tokens (DTCG) form, with the group tree preserved by nesting,
`$type` and `$value` on each leaf, and token-to-token references expressed as DTCG aliases. The
canonical artifact SHALL NOT be flattened on ingest; flattening SHALL happen on read, at the point
of use.

#### Scenario: The tree survives ingest
- **WHEN** variables are read from the design source and the canonical artifact is written
- **THEN** a variable named `primitive/color/primary` SHALL appear as nested groups, not as a
  flattened key
- **AND** a variable that references another SHALL be written as a DTCG alias, not as its resolved
  literal only

#### Scenario: Flattening is a read concern
- **WHEN** a consumer needs a flat list of tokens
- **THEN** it SHALL derive that list from the canonical artifact
- **AND** the canonical artifact SHALL remain unflattened on disk

### Requirement: Design-source fidelity is preserved without leaving the spec
The canonical artifact SHALL remain valid DTCG. Structure the specification does not model —
collections, modes, per-mode values, and the design source's durable variable keys — SHALL be
carried in DTCG `$extensions` rather than by deviating from the format.

#### Scenario: Modes are preserved
- **WHEN** a variable carries values for a Light and a Dark mode
- **THEN** both values SHALL be present under `$extensions`
- **AND** the token's `$value` SHALL carry the default mode's value

#### Scenario: Durable keys survive
- **WHEN** a variable has a published key in the design source
- **THEN** that key SHALL be recorded under `$extensions` so the join to code survives renames

#### Scenario: The artifact validates as DTCG
- **WHEN** the canonical artifact is checked against the DTCG format
- **THEN** it SHALL validate
- **AND** no design-source-specific field SHALL appear outside `$extensions`

### Requirement: One scan, many emits
Reading the design source and emitting a styling-specific token file SHALL be separate steps.
Changing the project's styling approach SHALL re-emit from the canonical artifact and SHALL NOT
require re-reading the design source. A design-source read SHALL be required only when the source
itself has changed.

#### Scenario: Switching styling does not touch the design source
- **WHEN** the project's styling changes from CSS variables to Tailwind and tokens are re-emitted
- **THEN** the new token file SHALL be produced from `.vortspec/tokens.json`
- **AND** no request SHALL be made to the design source

#### Scenario: Emitting every format from one read
- **WHEN** the design source is read once and each supported styling format is emitted in turn
- **THEN** every format SHALL be produced
- **AND** the design source SHALL have been read exactly once

#### Scenario: A source change is still a re-read
- **WHEN** the design source's variables have changed
- **THEN** re-reading it SHALL be required to refresh the canonical artifact

### Requirement: The styling token file is a derived artifact
The project's `token_file` SHALL be generated from the canonical artifact for the styling approach
configured in `.sdd-de/project.yaml`. Emission SHALL be idempotent: re-emitting without a canonical
change SHALL produce a byte-identical file. Where a user has edited the token file by hand, the
system SHALL report the divergence rather than silently overwriting it.

#### Scenario: Re-emission is stable
- **WHEN** tokens are emitted twice with no change to the canonical artifact
- **THEN** the two outputs SHALL be byte-identical

#### Scenario: Hand edits are not silently lost
- **WHEN** the token file has been edited by hand since it was last emitted
- **THEN** re-emission SHALL report the divergence and require an explicit choice before overwriting

### Requirement: Emitters produce idiomatic output per styling approach
Each supported styling approach SHALL have an emitter producing output idiomatic to it, not a
generic dump. For utility-class frameworks the emitter SHALL produce a curated semantic mapping —
scale names mapped to tokens — so component code uses the framework's standard utilities and every
value still resolves to a token. An emitter SHALL NOT emit a raw per-token arbitrary-value mapping
as its primary output.

#### Scenario: Utility framework output is curated
- **WHEN** tokens are emitted for a utility-class styling approach
- **THEN** the output SHALL map the framework's standard scale names to tokens
- **AND** standard utilities SHALL resolve to project tokens rather than the framework's built-in
  defaults

#### Scenario: Unsupported styling fails loudly
- **WHEN** the configured styling approach has no emitter
- **THEN** emission SHALL fail with a message naming the approach
- **AND** SHALL NOT fall back to writing a format the project cannot consume

### Requirement: Every design source produces the same canonical artifact
Every design source SHALL produce the canonical artifact, so that downstream consumers are
source-agnostic — including sources that are not design-tool variables, such as a stylesheet's
custom properties, a theme object, or a consumed library's token file. For a consumed design system the
canonical artifact SHALL be a read-only projection and the consumed source SHALL NOT be written.

#### Scenario: Stylesheet source produces canonical tokens
- **WHEN** a project's tokens are read from CSS custom properties rather than design-tool variables
- **THEN** `.vortspec/tokens.json` SHALL be produced in the same DTCG form

#### Scenario: Consumed sources are projected, not owned
- **WHEN** the project consumes an external design system
- **THEN** the canonical artifact SHALL be derived from the consumed source
- **AND** no file in the consumed source SHALL be written

### Requirement: The light manifest derives its tokens from the canonical artifact
The light design manifest SHALL take its tokens from the canonical artifact rather than from a
reduced projection, so that token types outside the manifest's visual groups — duration, dimension,
and other `$type` values — are available to light page authoring instead of being dropped. A token
type the manifest has no visual group for SHALL still be listed and referenceable.

#### Scenario: Motion tokens reach light pages
- **WHEN** the design system defines a duration token and the light manifest is derived
- **THEN** that token SHALL appear in the manifest with its name and value
- **AND** a light page SHALL be able to reference it

#### Scenario: No silent drop
- **WHEN** a token's type maps to no visual group
- **THEN** it SHALL still be listed in the manifest
- **AND** it SHALL NOT be omitted without record
