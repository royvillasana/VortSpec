## MODIFIED Requirements

### Requirement: Component detail view with Playground
Clicking a component card SHALL open a detail view with a Playground at the top. When the component has generated code, the Playground SHALL render the actual component via Sandpack instead of the IR preview. When no code exists, it SHALL show the IR preview with a "Generate Code" button.

#### Scenario: Component with generated code
- **WHEN** user opens a component that has code artifacts
- **THEN** the Playground SHALL render the component in a Sandpack iframe
- **AND** variant controls SHALL update the rendered component
- **AND** a "Code" tab SHALL show the generated source

#### Scenario: Component without code
- **WHEN** user opens a component without code artifacts
- **THEN** the Playground SHALL show the IR preview
- **AND** a "Generate Code" button SHALL be prominently displayed

### Requirement: Component status progression
Components SHALL progress through statuses: `imported` → `normalized` → `validated`. The `validated` status SHALL be set when code is generated and the user confirms the output.

#### Scenario: Code generation validates component
- **WHEN** code is generated and user clicks "Validate"
- **THEN** the component status SHALL change to `validated`
- **AND** the status chip SHALL update to show "validated" in green

### Requirement: Generate Code button in breadcrumb
The breadcrumb bar SHALL show a "Generate Code" button (alongside Approve) when the component has no code artifacts, or "Regenerate" when it does.

#### Scenario: Generate Code in header
- **WHEN** a normalized component has no code
- **THEN** the breadcrumb SHALL show [normalized] [score] [Generate Code]
- **WHEN** code exists
- **THEN** the breadcrumb SHALL show [validated] [score] [Regenerate] [View Code]
