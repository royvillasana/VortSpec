# jira-integration Specification

## Purpose
TBD - created by archiving change git-provider-integration. Update Purpose after archive.
## Requirements
### Requirement: Connect the user's Jira account (multi-account aware)
The app SHALL connect the user's own Jira (Atlassian) account, storing no VortSpec-owned
account and, when multiple Jira sites/accounts are available, asking which to connect.

#### Scenario: Connect with account selection
- **WHEN** the user connects Jira and more than one site/account is available
- **THEN** the app prompts which to connect and uses only the chosen one

#### Scenario: Offer to install the Jira CLI (with permission)
- **WHEN** the user selects Jira connectivity and no Jira/Atlassian CLI is installed
- **THEN** the app asks the user's explicit permission to install it (showing what and how),
  installs it only on confirmation, then drives the CLI's own login

#### Scenario: The user's own credential
- **WHEN** Jira is connected
- **THEN** it uses the user's own Atlassian CLI (installed with permission if needed), or —
  only if the user declines the install — an Atlassian API token the user provides stored in
  the OS keychain; VortSpec stores no account of its own and sends no telemetry

### Requirement: Create and write stories
The app SHALL create stories/issues in a chosen Jira project and write/update their fields.

#### Scenario: Create a story
- **WHEN** the user creates a story in a selected project
- **THEN** the app creates the issue with summary, description, and acceptance criteria via
  the user's Jira account, and returns its key/URL

#### Scenario: Write from a spec ("the spec is the story")
- **WHEN** the user turns a VortSpec spec (enriched brief / component / interaction / page
  spec) into a story
- **THEN** the spec becomes the story content and the spec/component/screen is linked to the
  issue; every write is an explicit user action

### Requirement: Track story status
The app SHALL read story status so tracking is visible against the design-engineering work.

#### Scenario: Show linked status
- **WHEN** a component/screen is linked to a story
- **THEN** the app can read and display that story's status

