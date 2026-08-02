## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Deterministic semantic-lever to token mapping per source
**Reason**: The fixed lever set could not describe a real design system. Each lever hard-wired one token per
design source, so on an Astryx project "Card radius" wrote `--radius-container` while the screens rounded
cards with `--radius-card` — the knob moved five elements and none of the cards. Closing that gap took a
per-lever alias set, then a second fix to stop the alias set flattening the shadow ramp, and whole
properties (`--radius-pill`, all spacing, all typography) still had no lever at all.

**Migration**: The editor's rows now come from the project's own tokens, grouped by the type the token
parser already assigns, so a token is reachable because the project HAS it rather than because VortSpec has
a name for it. Role resolution survives only on the preset-apply path, where a preset authored elsewhere
must be mapped onto this project's token names — and a role that resolves to nothing is reported and
skipped, never invented. Values written by the lever editor need no migration: they are ordinary durable
overlay entries and read back unchanged.
