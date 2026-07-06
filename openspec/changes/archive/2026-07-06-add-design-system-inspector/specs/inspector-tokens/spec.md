## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Token rename with live preview
**Reason**: The live "rename as IRPatch" mechanism assumed a canonical IR store and usage graph that v2 does not have; renaming a token also requires rewriting code references, which is Claude Code's job, not an in-app IR mutation.
**Migration**: Renaming is performed through the gated modify loop — see "Token mutations are gated and file-written" (Claude Code updates the token file and all code references, surfaced as an approvable diff).
