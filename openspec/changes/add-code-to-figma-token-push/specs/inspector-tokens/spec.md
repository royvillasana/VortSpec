## ADDED Requirements

### Requirement: Create a new token
The Tokens panel SHALL let the user create a new design token by supplying a token name, a value, and a type (Color, Typography, Spacing, Radius, Shadow, Other). On confirm, the token SHALL be written to the project token file as a CSS custom property under the correct `@theme` grouping, marked `hand-edited`, and SHALL immediately appear in the panel and be eligible for the push plan. The system SHALL reject a name that collides (by normalized name) with an existing token and SHALL surface a human-readable message rather than silently overwriting.

#### Scenario: Create a color token
- **WHEN** the user creates a token named `--color-brand` with value `#7C6FF0` and type Color
- **THEN** `--color-brand: #7C6FF0;` SHALL be written to the token file
- **AND** the new token SHALL appear in the Color group marked `hand-edited`
- **AND** it SHALL be indicated as pushable

#### Scenario: Duplicate name is rejected
- **WHEN** the user attempts to create a token whose normalized name matches an existing token
- **THEN** the creation SHALL be rejected with a human-readable message
- **AND** the existing token SHALL be left unchanged

### Requirement: Send to Figma affordance
The Tokens panel SHALL provide a "Send to Figma" control that lets the user push code-side token changes into the Figma Variables collection on demand. The control SHALL be enabled only when a Figma writer is connected (`figma-cli` preferred, or the Figma MCP) and SHALL be disabled with an explanatory hint otherwise. Activating it SHALL open the push preview gate defined by the `figma-token-push` capability rather than writing to Figma immediately.

#### Scenario: Send to Figma is available when a writer is connected
- **WHEN** figma-cli or the Figma MCP is connected and the user opens the Tokens panel
- **THEN** a "Send to Figma" control SHALL be enabled

#### Scenario: Send to Figma opens the preview gate
- **WHEN** the user clicks "Send to Figma"
- **THEN** the push preview SHALL open showing what will be created and updated
- **AND** nothing SHALL be written to Figma until the user confirms

#### Scenario: Send to Figma is disabled without a writer
- **WHEN** neither figma-cli nor the Figma MCP is connected
- **THEN** the "Send to Figma" control SHALL be disabled
- **AND** a hint SHALL explain that a Figma writer must be connected

### Requirement: Pushable token indication
A token that exists in the code token file but has no matching Figma variable (previously surfaced only as `generated-code`), or whose value has drifted from Figma, SHALL be indicated as **pushable** so the user can see which tokens the "Send to Figma" action will affect. This indication SHALL NOT change the existing source-badge semantics for tokens that are already in sync.

#### Scenario: Code-only token is marked pushable
- **WHEN** a token exists in the token file with no matching Figma variable
- **THEN** it SHALL be indicated as pushable
- **AND** it SHALL be included in the push plan when "Send to Figma" is activated

#### Scenario: In-sync token is not marked pushable
- **WHEN** a token's value matches its Figma variable
- **THEN** it SHALL NOT be indicated as pushable
