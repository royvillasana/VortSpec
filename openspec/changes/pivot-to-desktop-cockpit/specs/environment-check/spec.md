## ADDED Requirements

### Requirement: First-launch environment detection

On first launch (and on demand thereafter), VortSpec SHALL check the local environment and render each check as a row with a pass/fail state: Node version, git presence, Claude Code installation, and Claude Code login state.

#### Scenario: All checks pass

- **WHEN** the app launches on a machine with a supported Node, git, an installed Claude Code, and an active Claude Code login
- **THEN** every environment row renders as passing and the user can proceed to select a project

#### Scenario: A check fails with a fix action

- **WHEN** a required tool is missing or Claude Code is not logged in
- **THEN** the corresponding row renders as failing with a fix action (an install link, or an "open login" action that runs the login flow in the embedded terminal)

### Requirement: Login via embedded terminal

VortSpec SHALL run the Claude Code login flow inside the embedded terminal rather than proxying credentials, and SHALL re-evaluate the login check when the flow completes.

#### Scenario: User logs in from the failing check

- **WHEN** the user activates "open login" on a failing Claude Code login row
- **THEN** the login flow runs in the embedded terminal, and on success the row re-evaluates to passing without restarting the app

### Requirement: No account, no keys, opt-in telemetry

VortSpec SHALL NOT create a VortSpec account, SHALL NOT request or store any provider keys, and SHALL NOT send telemetry without explicit opt-in.

#### Scenario: Clean first run

- **WHEN** a user completes onboarding
- **THEN** no VortSpec account is created, no provider key is requested or stored, and no telemetry is sent unless the user opted in
