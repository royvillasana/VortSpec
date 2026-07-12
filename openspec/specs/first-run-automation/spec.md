# first-run-automation Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Guided first-run automation

After the desktop app is installed and launched for the first time, VortSpec SHALL offer a one-click guided setup that automates getting the user to a ready state: opening a terminal session, authenticating Claude Code, and ensuring the Figma MCP is available. Each step SHALL report success or a clear next action, and the flow SHALL be resumable if interrupted.

#### Scenario: One-click first-run setup

- **WHEN** the user launches VortSpec for the first time (or reopens setup)
- **THEN** VortSpec presents a guided sequence that runs the terminal, Claude Code authentication, and Figma MCP steps in order, showing per-step status

#### Scenario: Setup resumes after interruption

- **WHEN** first-run setup is closed partway through and reopened
- **THEN** VortSpec re-detects which steps are already complete (login present, MCP installed) and resumes from the first incomplete step

### Requirement: Open a terminal session

VortSpec SHALL open an embedded terminal session (node-pty/xterm) as part of first-run setup, so authentication and any interactive step run transparently in view of the user.

#### Scenario: Terminal opens for setup

- **WHEN** the guided setup reaches an interactive step
- **THEN** an embedded terminal session opens and shows the running command's output live

### Requirement: Authenticate Claude Code via browser

VortSpec SHALL run the Claude Code login flow in the embedded terminal (Claude Code opens the browser for OAuth), and SHALL detect completion and re-verify login without requiring an app restart. VortSpec SHALL NOT handle or store the user's credentials itself.

#### Scenario: Browser authentication completes

- **WHEN** the user starts the Claude Code login step and completes OAuth in the browser
- **THEN** VortSpec detects the successful login, marks the step complete, and stores no credentials of its own

#### Scenario: Already logged in

- **WHEN** first-run setup detects Claude Code is already authenticated
- **THEN** the authentication step is marked complete and skipped

### Requirement: Install the Figma MCP when absent

VortSpec SHALL detect whether the Figma MCP is configured in the user's Claude Code, and when it is absent SHALL offer to install/configure it, then verify it is available. When already present, the step is skipped.

#### Scenario: Figma MCP missing

- **WHEN** first-run setup detects no Figma MCP in the user's Claude Code configuration
- **THEN** VortSpec offers to install it, runs the install in the terminal, and verifies the MCP is then present

#### Scenario: Figma MCP already present

- **WHEN** the Figma MCP is already configured
- **THEN** the step is marked complete and skipped

