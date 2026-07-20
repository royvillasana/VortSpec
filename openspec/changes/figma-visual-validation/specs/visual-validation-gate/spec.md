## ADDED Requirements

### Requirement: Validate in the order visual → token → code

Before a component is marked verified, the system SHALL run validation in a fixed order: first visual fidelity against the Figma reference, then token correctness, then code/compile correctness. A failure at an earlier layer SHALL be reported even if later layers pass; a component is not verified unless all three layers pass (or a real, listed reason blocks it).

#### Scenario: Visual failure is not hidden by passing code

- **WHEN** a component compiles cleanly and uses only design tokens but does not visually match its Figma reference
- **THEN** the gate reports a visual-fidelity failure and the component is not marked verified

#### Scenario: Layers are reported independently

- **WHEN** validation completes for a component
- **THEN** the result carries a distinct outcome for each of visual, token, and code layers

### Requirement: Visual validation compares a real render to the reference

The visual layer SHALL render the built component (e.g. via Storybook), capture a screenshot of each variant/state, and compare it to the component's Figma reference screenshot. The agent SHALL NOT report a visual pass based on reading source code; a pass requires an actual render-and-compare.

#### Scenario: No render means no visual pass

- **WHEN** no render surface (Storybook/preview URL) is available for the component
- **THEN** the visual layer returns BLOCKED, never PASS

#### Scenario: Mismatch against the reference is reported with specifics

- **WHEN** the rendered component differs from the reference (e.g. missing icon slot, wrong container shape, absent severity variants)
- **THEN** the gate returns a visual failure naming the concrete differences rather than a bare fail

### Requirement: Token validation confirms referenced tokens are used

The token layer SHALL confirm the component uses the design tokens the reference specifies (colors, spacing, radius, typography) and flags hardcoded values or wrong-token substitutions.

#### Scenario: Hardcoded value fails the token layer

- **WHEN** a component hardcodes a hex color instead of the token the reference uses
- **THEN** the token layer reports a failure identifying the hardcoded value and the expected token

### Requirement: A component is verified only when all layers pass on real evidence

The system SHALL mark a component "verified" only when the visual, token, and code layers each pass on actual evidence (a real render for visual, a real type-check/build for code). Absent that evidence, the status SHALL be "issues" or "blocked", never "verified".

#### Scenario: Self-certified pass without evidence is rejected

- **WHEN** the agent claims a pass without a render or without a successful build
- **THEN** the gate records the component as issues/blocked rather than verified

#### Scenario: Roster reflects per-layer status

- **WHEN** the guided flow displays a component's status
- **THEN** it reflects the visual/token/code outcome so a visual mismatch is visible to the user, not masked as verified
