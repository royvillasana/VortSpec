## ADDED Requirements

### Requirement: The initial screen surfaces an available update

The IDE SHALL check for a newer release once on launch and, when one is available and not dismissed for that version, display an update prompt on the initial screen — the screen shown before a workspace is open. The prompt SHALL state the available version, and offer a download action, a release-notes action, and a dismiss action. When no update is available, or the check could not reach the network, the initial screen SHALL be unchanged.

#### Scenario: Update available on launch

- **WHEN** the IDE launches, no workspace is open, and a newer release is available
- **THEN** the initial screen shows a prompt naming the available version with Download, What's new, and Dismiss actions

#### Scenario: Up to date

- **WHEN** the IDE launches and the running version is the latest
- **THEN** no update prompt is shown on the initial screen

#### Scenario: Offline launch

- **WHEN** the IDE launches with no network connectivity
- **THEN** the initial screen renders normally with no prompt and no error

#### Scenario: The check never delays the initial screen

- **WHEN** the IDE launches and the update request is still in flight
- **THEN** the initial screen is already interactive, and the prompt appears only once a result arrives

#### Scenario: Dismissed for this version

- **WHEN** the user has already dismissed the prompt for the available version
- **THEN** the initial screen shows no prompt on subsequent launches
