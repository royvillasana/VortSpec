# profile

## ADDED Requirements

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
