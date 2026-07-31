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
