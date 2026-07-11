# Capability: Inspector Tokens

## Purpose

Token browsing, editing, and management panel within the Design Inspector, supporting grouped display, detail editing, merge, delete, rename, and promotion of flagged literals.
## Requirements
### Requirement: Token collections grouped by type
The Tokens panel SHALL display token collections grouped by type: Color, Typography, Spacing, Radius, Shadow, Other. Each group SHALL show a header with the type name and token count, and SHALL be collapsible.

#### Scenario: Tokens render grouped by type
- **WHEN** user navigates to the Tokens panel
- **THEN** tokens SHALL be displayed grouped under type headers (Color, Typography, Spacing, Radius, Shadow)
- **AND** each group header SHALL show the count of tokens in that group

### Requirement: Token row display
Each token row SHALL display: a visual preview (color swatch for colors, "Ag" glyph for typography, bar for spacing, corner for radius), the token name in Geist Mono 12px `#E7E9EC`, the resolved value in Geist Mono 11px `#6B7280`, a **source badge** (figma-variable=green `#30A46C`, generated-code=amber `#FFB224`, hand-edited=accent `#7C6FF0`), and a usage count derived from a source scan. The source model replaces v1's IR "confidence" (inferred/confirmed/pending), which no longer exists in v2.

#### Scenario: Color token displays swatch
- **WHEN** a color token `--color-primary` with resolved value `#2563EB` renders (parsed from the token file, or from Figma variables when the Desktop Bridge is connected)
- **THEN** it SHALL show a colored swatch (18x18px, border-radius 5px), the name, hex value, source badge, and usage count

#### Scenario: Token from Figma variables shows figma-variable source
- **WHEN** a token's resolved value matches an authoritative Figma variable (Desktop Bridge connected)
- **THEN** the source badge SHALL be green (`#30A46C`) labelled "Figma variable"

#### Scenario: Token present only in code shows generated-code source
- **WHEN** a token exists in the token file but has no matching Figma variable
- **THEN** the source badge SHALL be amber (`#FFB224`) labelled "From code"

### Requirement: Token detail view
Clicking a token SHALL open a detail view showing: a value editor (color picker for colors, text input for others) and a "where used" listing of every component/property consuming this token, derived by scanning the component source under `component_dir` for the token reference (e.g. `var(--token)`). Editing a value SHALL be gated: on confirm it is written to the project token file and the token is marked `hand-edited`. Nothing mutates silently and there is no separate IRPatch store.

#### Scenario: Token detail opens on click
- **WHEN** user clicks a token row
- **THEN** a detail panel SHALL open showing the token's value editor and its where-used listing

#### Scenario: Where-used from source scan
- **WHEN** the detail view lists usages
- **THEN** each entry SHALL come from a scan of the component source for the token reference, showing component + property

#### Scenario: Gated value edit writes to the token file
- **WHEN** user changes a token's value and confirms
- **THEN** the new value SHALL be written to the project token file
- **AND** the token's source badge SHALL become `hand-edited`

### Requirement: Token merge
Users SHALL be able to select multiple tokens and merge them into one. A preview SHALL show every reference that will be rewritten.

#### Scenario: Merge three similar tokens
- **WHEN** user selects three grey tokens and clicks "Merge"
- **THEN** a preview SHALL show all references that will be rewritten to the target token
- **AND** confirming SHALL execute the merge as an IRPatch

### Requirement: Token deletion with fallback
Deleting a token SHALL require choosing a fallback strategy: inline as flagged literal, or remap to another token. The deletion SHALL execute as an IRPatch.

#### Scenario: Delete token with remap fallback
- **WHEN** user deletes a token and selects "Remap to another token"
- **THEN** the system SHALL prompt for the target token
- **AND** all usages SHALL be rewritten to the target token via IRPatch

### Requirement: Promote flagged literal to token
From any usage site showing a flagged literal, users SHALL be able to promote it to a new token via a one-click action.

#### Scenario: Promote literal from usage site
- **WHEN** user clicks "Promote to token" on a flagged literal value
- **THEN** a new token SHALL be created with that value
- **AND** the literal SHALL be replaced with a reference to the new token via IRPatch

### Requirement: Search and filter tokens
The Tokens panel SHALL provide a search input that filters tokens by name or value in real-time.

#### Scenario: Search filters tokens
- **WHEN** user types "primary" in the search input
- **THEN** only tokens whose name or value contains "primary" SHALL be displayed

### Requirement: Tokens sourced from project files (no IR store)
The Tokens panel SHALL derive all tokens and resolved values from the project's files — the configured `token_file`, and the authoritative Figma variables via the Desktop Bridge when connected — with zod validation only at the parse boundary. It SHALL NOT depend on a canonical IR store or a normalization pipeline.

#### Scenario: Tokens load from the token file
- **WHEN** the user opens the Tokens panel and no Figma bridge is connected
- **THEN** tokens SHALL be parsed from the configured token file and rendered

#### Scenario: Figma bridge provides authoritative values
- **WHEN** the Figma Desktop Bridge is connected
- **THEN** resolved values SHALL be taken from `figma_get_variables` and reconciled with the token file, flagging drift

### Requirement: Token mutations are gated and file-written
All token mutations (edit value, rename, merge, delete, promote a flagged literal) SHALL require explicit user confirmation and SHALL be applied by writing to project files — the token file directly for value edits, and the component source via a Claude Code run for changes that also rewrite code references (e.g. rename). There SHALL be no silent mutation and no IRPatch store.

#### Scenario: No silent mutation
- **WHEN** any token mutation is initiated
- **THEN** it SHALL require explicit confirmation before any file is written

#### Scenario: Rename rewrites code references via the engine
- **WHEN** the user renames a token
- **THEN** the rename SHALL be applied through a gated Claude Code run that updates the token file and every code reference, presented as an approvable diff

### Requirement: Navigable token where-used list
The token detail view SHALL present the components that use a token as a navigable list, grouping multiple property hits per component, and clicking a component SHALL open its source file.

#### Scenario: Jump from token to component
- **WHEN** the user opens a token that is used by a component and clicks that component in the where-used list
- **THEN** the component's source file SHALL open

