# Capability: App Shell

## Purpose

Shared layout shell for the Design Inspector application, providing persistent navigation, chat strip, and dark theme across all inspector routes.
## Requirements
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

