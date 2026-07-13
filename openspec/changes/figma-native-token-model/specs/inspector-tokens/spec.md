## MODIFIED Requirements

### Requirement: Token collections grouped by type
The Tokens panel SHALL present tokens as Figma's variable tree: scoped to a **collection** (a selector is shown when more than one collection exists), organized into **collapsible group folders** that mirror the Figma `/` group hierarchy with left-indentation per nesting depth (leaf label = the final path segment), and filterable by type (Color, Typography, Spacing, Radius, Shadow, Other) as a secondary chip filter. Each group-folder header SHALL show its name and the count of tokens beneath it. A project with a single collection, a single mode, and flat (non-slashed) names SHALL render as a shallow tree equivalent to the prior type-grouped view.

#### Scenario: Tokens render as an indented folder tree
- **WHEN** the token panel loads variables named `primitive/color/primary` and `primitive/color/accent`
- **THEN** they SHALL be displayed under a collapsible `primitive` → `color` folder path with indentation reflecting depth, each leaf showing its final-segment label
- **AND** each group-folder header SHALL show the count of tokens beneath it

#### Scenario: Flat project degrades to a shallow tree
- **WHEN** a project has one collection, one mode, and flat token names with no `/`
- **THEN** tokens SHALL render grouped without deep nesting, and the type chips SHALL still filter them

## ADDED Requirements

### Requirement: Mode switcher selects the displayed and edited values
When the active collection defines more than one mode, the Tokens panel SHALL present a **mode switcher**. Changing the active mode SHALL swap every token's displayed value, swatch, source badge, and drift state to that mode's value, and value edits SHALL apply to the active mode's code context. When a mode has no mapped code context, its values SHALL be shown read-only.

#### Scenario: Switching mode swaps values and drift
- **WHEN** the user switches the active mode from `Light` to `Dark`
- **THEN** each token SHALL display its `Dark` value and swatch, and drift SHALL be recomputed against Figma's `Dark` mode

#### Scenario: Editing applies to the active mode's context
- **WHEN** the active mode is `Dark` (mapped to `.dark`) and the user edits a token value
- **THEN** the new value SHALL be written into the `.dark` context of the token file, leaving the default-mode value unchanged

#### Scenario: Unmapped mode is read-only
- **WHEN** the active mode has no mapped code context
- **THEN** its values SHALL be shown from Figma as read-only and the value editor SHALL be disabled for that mode
