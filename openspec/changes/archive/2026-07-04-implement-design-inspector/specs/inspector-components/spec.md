## ADDED Requirements

### Requirement: Component cards grid
The Components panel SHALL display all components as cards in a grid. Each card SHALL show: component name, static preview thumbnail (rendered from IR), variant count, completeness score with color coding (green >= 80, amber >= 60, red < 60), and status chip (imported/normalized/approved).

#### Scenario: Components render as cards
- **WHEN** user navigates to the Components panel
- **THEN** all components SHALL render as cards with name, preview, variant count, completeness score, and status

#### Scenario: Completeness score color coding
- **WHEN** a component has completeness score 82
- **THEN** the score badge SHALL display in green (`#30A46C`)
- **WHEN** a component has completeness score 68
- **THEN** the score badge SHALL display in amber (`#FFB224`)

### Requirement: Component detail view with Playground
Clicking a component card SHALL open a detail view with a Playground at the top. The Playground SHALL render a live preview of the component from the IR with controls generated from metadata.

#### Scenario: Component detail opens with playground
- **WHEN** user clicks the Button component card
- **THEN** the detail view SHALL open with a live preview rendering the Button from IR data

### Requirement: Variant selector controls
The Playground SHALL generate a segmented control for each variant axis (e.g., primary/secondary/ghost). Selecting a variant SHALL re-render the preview with that variant's styles.

#### Scenario: Variant switching updates preview
- **WHEN** user clicks "secondary" in the variant selector
- **THEN** the preview SHALL re-render showing the secondary variant styling
- **AND** the segmented control SHALL highlight "secondary" as active

### Requirement: Prop controls from ControlHint
The Playground SHALL generate input controls from each prop's ControlHint: text inputs for text props, color pickers for color props, toggles for boolean props, selects for enum props.

#### Scenario: Text prop control renders
- **WHEN** a component has a text prop "label" with ControlHint "text"
- **THEN** a text input control SHALL render labeled "label"
- **AND** changing the input SHALL update the preview

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

### Requirement: Inferred items confirmation
Inferred items (variant axes, props, tokens) SHALL show a provenance badge and a one-click confirm button to change confidence from `inferred` to `confirmed`.

#### Scenario: Confirm inferred variant axis
- **WHEN** user clicks "Confirm" on an inferred variant axis
- **THEN** the axis confidence SHALL change to `confirmed` via IRPatch
- **AND** the provenance badge SHALL update to green
