## ADDED Requirements

### Requirement: Live component preview in Playground
The Playground SHALL render the generated component code in a sandboxed iframe using Sandpack (or equivalent). The preview SHALL show the component with actual styles from the design tokens.

#### Scenario: Preview shows rendered component
- **WHEN** a component has generated code
- **THEN** the Playground SHALL render the component in an iframe with real React rendering
- **AND** the component SHALL be styled using the generated token CSS

#### Scenario: Preview with variant controls
- **WHEN** the user selects a different variant in the Playground controls
- **THEN** the preview SHALL update to show the selected variant

### Requirement: Code viewer
Below the preview, the Playground SHALL show the generated code in a syntax-highlighted code viewer with tabs for: Component, Story, Types, Token CSS.

#### Scenario: View generated code
- **WHEN** user clicks the "Code" tab
- **THEN** the generated component code SHALL be displayed with syntax highlighting

### Requirement: Copy code to clipboard
Each code tab SHALL have a "Copy" button that copies the code to the clipboard.

#### Scenario: Copy component code
- **WHEN** user clicks "Copy" on the Component tab
- **THEN** the component code SHALL be copied to clipboard with a success toast

### Requirement: Fallback to IR preview
If no code has been generated yet, the Playground SHALL show the IR preview (current behavior) with a "Generate Code" call-to-action button.

#### Scenario: No code yet
- **WHEN** a component has no code artifacts
- **THEN** the Playground SHALL show the IR preview and a prominent "Generate Code" button
