# profile Specification

## Purpose
TBD - created by archiving change profile-and-usage-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Plan usage mirrored from Claude
The app SHALL display the user's Claude plan usage as percentage bars matching
Claude Code's own `/usage`, sourced by running the user's own Claude Code — no
proxying, no credentials, no token cost.

#### Scenario: Usage bars render
- **WHEN** the user opens Profile
- **THEN** the app runs `claude -p "/usage"`, parses the percentage bars (session,
  weekly, per-model) with reset times, and shows them as filling bars with Claude's
  own approximation disclaimer

#### Scenario: Usage unavailable
- **WHEN** usage can't be read (Claude Code missing/not logged in, or format
  changed)
- **THEN** a fix-it message is shown with a next step, and a Refresh action — never
  a fabricated number

### Requirement: Profile identity used by the assistant
The app SHALL let the user set a display name and optional avatar image, stored
locally, and address them by name when they chat with the assistant.

#### Scenario: Name injected into chat
- **WHEN** a name is set and the user sends a message to the assistant
- **THEN** the run includes an appendSystemPrompt telling Claude the user's name,
  applied for the whole session

#### Scenario: Avatar in the top bar
- **WHEN** a name or avatar image is set
- **THEN** the top-right avatar shows the initial or image; clicking it opens Profile

### Requirement: Intake defaults pre-fill setup
Default project preferences configured in Profile SHALL pre-fill the new-project
setup wizard, while each project keeps its own config.

#### Scenario: Defaults seed the wizard
- **WHEN** the user has set default framework/language/styling/test-runner and
  starts a new project
- **THEN** the wizard opens with those values pre-selected, overridable per project


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
