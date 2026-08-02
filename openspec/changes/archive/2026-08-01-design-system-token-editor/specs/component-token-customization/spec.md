# component-token-customization Specification

## ADDED Requirements

### Requirement: Semantic-lever to token resolver
The customization layer SHALL provide a deterministic resolver that maps a human design-system lever
(primary/secondary/tertiary color, card radius, component stroke, shadow, button styling) to the concrete
token name(s) and/or per-component override target(s) for a given design source and component library, plus
each lever's current value. The resolver SHALL be data-driven (a per-source map), SHALL reuse the existing
token↔theme-key map where a theme-object path is needed, and SHALL return no target for a lever the current
source cannot express (so the caller can hide/disable it).

#### Scenario: Resolver returns per-source targets
- **WHEN** the resolver is asked for the "Card radius" lever on an Astryx project
- **THEN** it returns the concrete token target (`--radius-container`) and its current value, so the editor can render and write it

#### Scenario: Resolver omits an unsupported lever
- **WHEN** a lever has no token/override target for the current source
- **THEN** the resolver returns no target for it, and the editor hides or disables that lever rather than inventing one

### Requirement: Tokens are read through the token file's `@import` chain
Reading a project's tokens SHALL follow the `@import` chain of its configured token file — relative
partials and bare package specifiers alike, the latter resolved through the package's `exports` map — and
parse the flattened result in cascade order, so the importing file's declarations override what it imports.
This is required because a consumed library's token file typically declares nothing itself and only imports
the vendor's theme. Each token SHALL record which file declares it. An edit SHALL be written to that file
when the project owns it, and SHALL route to the durable overlay when it lives in a dependency — a
dependency's files are never modified.

#### Scenario: A vendor theme's real tokens are visible and editable
- **WHEN** the project's token file only `@import`s a component library's published theme stylesheet
- **THEN** that theme's tokens are listed with their real values, each lever shows its live value, and editing one writes the durable overlay while the installed package stays byte-identical

#### Scenario: A project's own partial is edited in place
- **WHEN** a token is declared in a partial the project's token file `@import`s, and the project owns that partial
- **THEN** the edit is written into that partial rather than routed to the overlay, and the partial is included in the revert snapshot

#### Scenario: A light/dark pair keeps its dark half
- **WHEN** the user edits a token whose value is `light-dark(<light>, <dark>)`
- **THEN** only the light half is replaced and the library's dark-mode value is preserved
