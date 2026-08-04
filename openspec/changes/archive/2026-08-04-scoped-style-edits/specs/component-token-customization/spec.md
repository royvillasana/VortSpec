## ADDED Requirements

### Requirement: The per-component override has a UI entry point

Per-component customization SHALL be reachable from the product, not only from the engine. The system SHALL provide at least one surface from which a user can set a per-component override without editing a file by hand.

This closes a gap in which the override path existed end to end — schema, materializer, IPC handler, preload binding — with no caller, so the capability was specified and shipped but could not be exercised.

#### Scenario: A component override can be created from the canvas
- **WHEN** the user selects an element carrying a `data-component` and edits a style property at `component` scope
- **THEN** a per-component override SHALL be written for that component

#### Scenario: The capability is exercisable without hand-editing
- **WHEN** a user wants every instance of a component to take a style
- **THEN** they SHALL be able to do it from the product's own surfaces

### Requirement: Existing per-component overrides are visible and clearable

Every per-component override in the project's overlay SHALL be listed in the design-system surface, showing the component, the properties it sets, and their values. Each SHALL be individually clearable.

An override that applies to every instance on every page while appearing in no screen is indistinguishable from a bug: the user sees an effect with no cause and no way to undo it.

#### Scenario: Overrides are listed
- **WHEN** the project's overlay contains per-component overrides
- **THEN** the design-system surface SHALL list each one with its component, properties, and values

#### Scenario: An override can be cleared
- **WHEN** the user clears a listed override
- **THEN** it SHALL be removed from the overlay
- **AND** the affected instances SHALL return to their inherited values

#### Scenario: An override written before this capability is still shown
- **WHEN** the overlay contains an override written by an earlier version with no record of who set it
- **THEN** it SHALL be listed and clearable on the same terms as any other
