## ADDED Requirements

### Requirement: Settings shows a software-update section

The Settings view SHALL include a software-update section that always displays the running app version, and a manual check control. The section SHALL be present regardless of whether an update is available, so a user can confirm their version and check on demand.

#### Scenario: Version is always visible

- **WHEN** the user opens Settings
- **THEN** the running app version is displayed alongside a control to check for updates

#### Scenario: Up to date

- **WHEN** the user activates the check control and the running version is the latest
- **THEN** the section reports that the app is up to date, and names the version checked against

#### Scenario: Update available

- **WHEN** the user activates the check control and a newer release exists
- **THEN** the section names the available version and offers Download and What's new actions

#### Scenario: Check in progress

- **WHEN** the user activates the check control
- **THEN** the section indicates a check is running and the control cannot be activated again until it settles

#### Scenario: GitHub unreachable

- **WHEN** the user activates the check control with no network connectivity
- **THEN** the section reports that it could not reach GitHub, distinctly from reporting the app is up to date, and the control can be activated again

#### Scenario: The manual check bypasses the throttle

- **WHEN** the user activates the check control shortly after an automatic launch check
- **THEN** a live check is performed rather than the cached result being displayed
