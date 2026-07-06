# Capability: Inspector Components

## Purpose

Component browsing, playground preview, variant matrix, and approval workflow within the Design Inspector.
## Requirements
### Requirement: Component cards grid
The Components panel SHALL display all components as cards in a grid, sourced from `.sdd-de/components.json` and the generated component source under `component_dir`. Each card SHALL show: component name, atomic level (atom/molecule/organism), a preview thumbnail from the Playground (or a last-rendered snapshot), and a status derived from the flow and verify reports (built / verified / has-issues). Any "issues" or completeness signal SHALL come from the `visual-verify` / `adversarial-review` reports, not an IR completeness score.

#### Scenario: Components render as cards from files
- **WHEN** user navigates to the Components panel
- **THEN** each component in `.sdd-de/components.json` with source under `component_dir` SHALL render as a card with name, level, preview, and status

#### Scenario: Status from verify reports
- **WHEN** a component has a passing `visual-verify` report
- **THEN** its card status SHALL show "verified"
- **WHEN** the report lists open discrepancies
- **THEN** its card status SHALL show "has-issues"

### Requirement: Component detail view with Playground
Clicking a component card SHALL open a detail view whose live preview is delegated to the `inspector-playground` capability, rendering the **real** generated component (not an IR render). The detail view SHALL show its variants, states, props (read from source), the tokens it consumes, and links to its spec and `visual-verify` report.

#### Scenario: Component detail opens with a live preview
- **WHEN** user clicks the Button component card
- **THEN** the detail view SHALL open with the Playground rendering the real Button component across its variants

### Requirement: Variant selector controls
The Playground SHALL generate a segmented control for each variant axis (e.g., primary/secondary/ghost). Selecting a variant SHALL re-render the preview with that variant's styles.

#### Scenario: Variant switching updates preview
- **WHEN** user clicks "secondary" in the variant selector
- **THEN** the preview SHALL re-render showing the secondary variant styling
- **AND** the segmented control SHALL highlight "secondary" as active

### Requirement: Prop controls from ControlHint
The detail view SHALL generate prop controls from the component's **source-declared** props (e.g. CVA variants, TypeScript prop types): selects for variant/enum props, toggles for boolean props, text inputs for string props. It SHALL NOT depend on IR `ControlHint` metadata.

#### Scenario: Variant prop control renders from source
- **WHEN** a component declares a `variant` prop with values primary/secondary/ghost in its source
- **THEN** a segmented/select control SHALL render for it
- **AND** changing it SHALL update the live preview

### Requirement: Inline token list
The Playground SHALL show an inline token list below the preview showing all tokens the component consumes. Editing a token value here SHALL propagate to every preview on the page.

#### Scenario: Token edit in playground propagates
- **WHEN** user edits a token value in the Playground's token list
- **THEN** all previews consuming that token SHALL update
- **AND** the edit SHALL be offered as an IRPatch ("Apply as change") rather than mutating silently

### Requirement: Checks row
Below the preview, a CHECKS row SHALL display computed checks: variant render coverage (e.g., "Renders 9/9"), text contrast ratio against WCAG AA, hit target size (>= 44px), and focus state presence. Failed checks SHALL link to their corresponding issue.

#### Scenario: Checks row displays pass/fail
- **WHEN** the Button component passes all variant renders but fails focus state check
- **THEN** the checks row SHALL show green "Renders 9/9" and red "No focus state" linking to an issue

### Requirement: Variant matrix
Below the Playground, a variant matrix SHALL render a grid of all variant combinations as thumbnail previews.

#### Scenario: Variant matrix renders combinations
- **WHEN** a component has 3 variant options and 3 states
- **THEN** the matrix SHALL render a 3x3 grid of variant combination previews

### Requirement: Component rename and edit
Users SHALL be able to rename components, rename/confirm/edit variant axes and options, edit prop definitions, and discard components.

#### Scenario: Rename component
- **WHEN** user edits the component name
- **THEN** the rename SHALL execute as an IRPatch and update everywhere

### Requirement: Component approval
Users SHALL mark a component as `approved`. Approval SHALL require zero error-severity issues. If warnings exist, a confirmation dialog SHALL list them.

#### Scenario: Approve component with warnings
- **WHEN** user clicks "Approve" on a component with 2 warnings and 0 errors
- **THEN** a confirmation dialog SHALL appear listing the 2 warnings
- **AND** confirming SHALL set the component status to `approved`

#### Scenario: Approval blocked by errors
- **WHEN** user clicks "Approve" on a component with 1 error-severity issue
- **THEN** the approval SHALL be blocked with a message indicating the error must be resolved

### Requirement: Components sourced from project files (no IR store)
The Components panel SHALL derive all components from `.sdd-de/components.json` and the generated source under `component_dir`, with zod validation only at the parse boundary. It SHALL NOT depend on a canonical IR store or a normalization pipeline.

#### Scenario: Component inventory from components.json
- **WHEN** the panel loads
- **THEN** it SHALL list exactly the components present in `.sdd-de/components.json` that have source under `component_dir`

### Requirement: Component modifications routed through the engine
Any change to a component (fix an issue, add a state, adjust a variant) SHALL be requested through the gated modify loop — a scoped Claude Code run or the resumable chat — and applied only after the user approves the resulting diff. VortSpec SHALL NOT edit component source directly.

#### Scenario: Fix request is gated
- **WHEN** the user requests a fix for a component issue from the detail view
- **THEN** VortSpec SHALL run a scoped Claude Code step and present the change for approval before writing it

