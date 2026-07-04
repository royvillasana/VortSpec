## ADDED Requirements

### Requirement: Issue list display
The Issues panel SHALL display a project-wide list of issues from all CompletenessReports. Each issue row SHALL show: severity icon (error=red diamond, warning=amber diamond, info=blue circle), issue title, affected component name, issue kind badge, and a timestamp.

#### Scenario: Issues render as list
- **WHEN** user navigates to the Issues panel
- **THEN** all issues SHALL render in a scrollable list with severity icon, title, component, kind, and timestamp

### Requirement: Filter by severity
The Issues panel SHALL provide filter controls for severity levels: Error, Warning, Info. Filters SHALL be toggleable and combine additively.

#### Scenario: Filter to errors only
- **WHEN** user enables only the "Error" filter
- **THEN** only error-severity issues SHALL be visible
- **AND** the issue count SHALL update to reflect the filtered count

### Requirement: Filter by kind
The Issues panel SHALL provide filter controls for issue kinds (e.g., token-conflict, missing-state, unflagged-literal, low-contrast). Active filters SHALL be visually indicated.

#### Scenario: Filter by token-conflict kind
- **WHEN** user selects "token-conflict" kind filter
- **THEN** only token-conflict issues SHALL be displayed

### Requirement: Filter by component
The Issues panel SHALL provide a component filter dropdown to scope issues to a specific component.

#### Scenario: Filter to Button component issues
- **WHEN** user selects "Button" from the component filter
- **THEN** only issues affecting the Button component SHALL be displayed

### Requirement: Deep link to target
Each issue SHALL provide a deep link that navigates to the affected token or component in the appropriate Inspector panel.

#### Scenario: Click issue navigates to component
- **WHEN** user clicks a "missing focus state" issue for the Button component
- **THEN** the application SHALL navigate to the Button component detail view

### Requirement: One-click suggested action
Issues with a `suggestedAction` patch SHALL display a one-click action button. Clicking it SHALL preview the patch diff and allow approval.

#### Scenario: Apply suggested action
- **WHEN** an issue has a suggested "Add focus state" action
- **THEN** a button labeled with the action SHALL appear on the issue row
- **AND** clicking it SHALL show a patch preview for approval

### Requirement: Issue count summary
The Issues panel header SHALL display the total count of issues and a breakdown by severity (e.g., "5 errors, 12 warnings, 14 info").

#### Scenario: Summary shows breakdown
- **WHEN** the project has 5 errors, 12 warnings, and 14 info issues
- **THEN** the header SHALL display "31 issues" with the severity breakdown
