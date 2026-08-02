# design-system-editor Specification

## Purpose
TBD - created by archiving change design-system-token-editor. Update Purpose after archive.
## Requirements
### Requirement: Curated design-system editor beside the live palette
VortSpec SHALL present an editor for a project's design system in the Design-tokens workspace's Design
System tab, rendered alongside the live design-system palette, so a user changes a value and sees the design
system re-theme in place. The editor SHALL be organized by STYLE PROPERTY — colors, typography, spacing,
borders, shadows — with each section's rows being the project's OWN tokens, rather than a fixed set of
semantic levers. The raw per-token table SHALL remain available as the separate power-user Tokens tab.

#### Scenario: Editing a value re-themes the shown design system
- **WHEN** the user changes a value (e.g. a colour or a radius) in the editor
- **THEN** the design-system palette shown beside it re-themes to the new value without leaving the view

#### Scenario: Consumed library shows the editor, not a Storybook
- **WHEN** the project consumes a component library (`design_source: library`)
- **THEN** its component surface is the Design System view with the editor, and no VortSpec Storybook is offered

### Requirement: Editor writes only through the durable overlay
The editor SHALL apply value edits via the durable token-override overlay and per-component edits via the
durable per-component override, keyed by `data-component` — never by mutating a consumed library's real
source. Every edit SHALL trigger the existing live re-resolution so the palette and `designer.md` reflect
the new values.

#### Scenario: A consumed source's real files are untouched
- **WHEN** the user edits any value on a consumed-library or enterprise project
- **THEN** the value is written to the VortSpec-owned overlay and re-materialized on top, and the vendor's/client's real token file is never modified

#### Scenario: A per-component edit is scoped to that component
- **WHEN** the user changes a value for a single component
- **THEN** VortSpec records a per-component override keyed on that component's `data-component` and only it re-themes, not every component

### Requirement: The design system can follow the screens
VortSpec SHALL surface, in the design-system editor, every curated lever whose value in the user's SCREENS
differs from the design system's — showing both values — and SHALL let the user adopt the screens' value so
the design system matches the look they built. It SHALL NOT apply the change on its own. Only tokens that map to a curated lever SHALL be considered — a token a screen invented that the
design system has no concept of is not a design-system change. Adopting SHALL write the durable overlay, so
a consumed library's real files are still never modified.

#### Scenario: A screen's brand color is offered to the design system
- **WHEN** a screen declares a primary-color token whose value differs from the design system's
- **THEN** the editor shows both values with an option to adopt the screen's, and the design system re-themes only once the user adopts

#### Scenario: Equivalent values are not reported as a difference
- **WHEN** a screen states a token in a different but equivalent form (e.g. `12px` where the library says `0.75rem`)
- **THEN** no difference is reported for that token

#### Scenario: Adopting a light value keeps the dark one
- **WHEN** the user adopts a screen's value for a token the design system holds as a light/dark pair
- **THEN** only the light half is replaced and the library's dark-mode value is preserved

#### Scenario: Screens that disagree
- **WHEN** screens declare different values for the same token
- **THEN** the value used by the most screens is the one offered, and the screens that differ are reported rather than hidden

