## MODIFIED Requirements

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

### Requirement: Prop controls from ControlHint
The detail view SHALL generate prop controls from the component's **source-declared** props (e.g. CVA variants, TypeScript prop types): selects for variant/enum props, toggles for boolean props, text inputs for string props. It SHALL NOT depend on IR `ControlHint` metadata.

#### Scenario: Variant prop control renders from source
- **WHEN** a component declares a `variant` prop with values primary/secondary/ghost in its source
- **THEN** a segmented/select control SHALL render for it
- **AND** changing it SHALL update the live preview

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Inferred items confirmation
**Reason**: v2 has no IR inference — components come from generated source, so there are no "inferred" axes/props to confirm.
**Migration**: Component correctness is validated via the Playground and the `visual-verify` / `adversarial-review` reports, and corrected through the gated modify loop — not via IR confirmation.
