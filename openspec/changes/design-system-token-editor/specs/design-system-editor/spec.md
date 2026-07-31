# design-system-editor Specification

## ADDED Requirements

### Requirement: Curated design-system editor beside the live palette
VortSpec SHALL present a curated editor for a project's design-system levers in the Design-tokens
workspace's Design System tab, rendered alongside the live design-system palette, so a user manipulates the
levers and sees the design system re-theme in place. The editor SHALL cover, for v1, primary/secondary/
tertiary colors, card border-radius, component stroke, shadows, and button styling. The raw per-token table
SHALL remain available as the separate power-user Tokens tab.

#### Scenario: Editing a lever re-themes the shown design system
- **WHEN** the user changes a lever (e.g. the primary color or the card radius) in the curated editor
- **THEN** the design-system palette shown beside it re-themes to the new value without leaving the view

#### Scenario: Consumed library shows the editor, not a Storybook
- **WHEN** the project consumes a component library (`design_source: library`)
- **THEN** its component surface is the Design System view with the curated editor, and no VortSpec Storybook is offered

### Requirement: Deterministic semantic-lever to token mapping per source
Each lever SHALL resolve deterministically (no AI in the edit path) to the concrete token(s) or per-component
override it writes for the CURRENT design source — e.g. "Primary color" writes the Astryx `--color-accent`,
a built system's own primary token, or a theme-object library's `palette.primary.main`. A lever with no
resolvable target for the current source SHALL be hidden or disabled, never guessed.

#### Scenario: Same lever maps to different tokens per source
- **WHEN** the user edits "Primary color" on an Astryx project vs. an MUI project
- **THEN** VortSpec writes `--color-accent` for Astryx and the MUI primary-palette target respectively, each via that source's apply path

#### Scenario: Unmapped lever is not shown
- **WHEN** the current source has no token that a lever maps to
- **THEN** that lever is hidden or disabled in the editor rather than writing an invented token

### Requirement: Editor writes only through the durable overlay
The editor SHALL apply global levers via the durable token-override overlay and per-component levers (button
styling) via the durable per-component override, keyed by `data-component` — never by mutating a consumed
library's real source. Every edit SHALL trigger the existing live re-resolution so the palette and
`designer.md` reflect the new values.

#### Scenario: A consumed source's real files are untouched
- **WHEN** the user edits any lever on a consumed-library or enterprise project
- **THEN** the value is written to the VortSpec-owned overlay and re-materialized on top, and the vendor's/client's real token file is never modified

#### Scenario: Button styling is a per-component override
- **WHEN** the user changes the button styling lever
- **THEN** VortSpec records a per-component override keyed on `data-component="Button"` and only Button re-themes, not every component
