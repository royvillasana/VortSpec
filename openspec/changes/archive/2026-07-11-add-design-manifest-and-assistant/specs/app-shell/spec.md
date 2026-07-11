## MODIFIED Requirements

### Requirement: Chat strip toggle
The top bar SHALL display a chat toggle. Activating it SHALL open a persistent
Assistant dock on the right that stays open across project-screen navigation
(not a one-off drawer). The toggle icon SHALL be `#9BA1AB` with hover to
`#E7E9EC`, and its open/closed state SHALL persist for the session.

#### Scenario: Chat toggle opens the persistent assistant dock
- **WHEN** the user clicks the chat toggle in the top bar
- **THEN** the Assistant dock SHALL open from the right
- **AND** it SHALL remain open as the user moves between project screens until explicitly closed

## ADDED Requirements

### Requirement: Design manifest stage in the guided flow
The guided flow SHALL include a gated Design-manifest stage positioned after
Verification and before Publish, producing the `DESIGN.md` artifact. The stage
SHALL link to the Design Manifest screen and SHALL not let Publish proceed for
the manifest until it is approved.

#### Scenario: Manifest stage appears after verification
- **WHEN** the guided flow renders its stages
- **THEN** a "Design manifest" stage SHALL appear between Verification and Publish, showing the `DESIGN.md` artifact and a link to open it

#### Scenario: Manifest stage gates publish
- **WHEN** the Design-manifest stage has not been approved
- **THEN** the flow SHALL show it as needing review and SHALL not advance to Publish

### Requirement: Design manifest navigation destination
The application SHALL provide a way to reach the Design Manifest screen for a
project once the manifest stage is available (from the flow stage and the nav).

#### Scenario: Open the manifest screen
- **WHEN** the user activates the Design-manifest destination
- **THEN** the Design Manifest screen SHALL open for the active project
