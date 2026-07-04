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
Each token row SHALL display: a visual preview (color swatch for colors, "Ag" glyph for typography, bar for spacing, corner for radius), the token name in Geist Mono 12px `#E7E9EC`, the resolved value in Geist Mono 11px `#6B7280`, a provenance badge (confirmed=green `#30A46C`, inferred=amber `#FFB224`, pending=gray), and usage count.

#### Scenario: Color token displays swatch
- **WHEN** a color token `color/primary/500` with value `#2563EB` renders
- **THEN** it SHALL show a colored swatch (18x18px, border-radius 5px), the name, hex value, provenance dot, and usage count

#### Scenario: Inferred token shows amber provenance
- **WHEN** a token has `confidence: 'inferred'`
- **THEN** the provenance badge SHALL be amber (`#FFB224`)

### Requirement: Token detail view
Clicking a token SHALL open a detail view showing: full value editor (color picker for colors, text input for others), alias controls, and a "where used" listing of every component/node/property consuming this token.

#### Scenario: Token detail opens on click
- **WHEN** user clicks a token row
- **THEN** a detail panel SHALL open showing the token's value editor, alias controls, and usage listing

#### Scenario: Where-used listing with hover highlight
- **WHEN** user hovers over a usage entry in the "where used" list
- **THEN** the corresponding component preview SHALL highlight

### Requirement: Token rename with live preview
Users SHALL be able to rename a token. While typing, all usages of the token SHALL preview the new name in real-time.

#### Scenario: Token rename previews across usages
- **WHEN** user edits a token name in the detail view
- **THEN** all usage sites SHALL show the new name as a live preview
- **AND** confirming SHALL execute the rename as an IRPatch

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
