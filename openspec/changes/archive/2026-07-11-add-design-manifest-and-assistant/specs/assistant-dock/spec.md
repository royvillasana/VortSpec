## ADDED Requirements

### Requirement: Persistent assistant dock across project screens
The system SHALL provide a collapsible assistant chat dock, toggled from the top
bar, that is available on every project screen. Its open/closed state SHALL
persist for the session so navigation between screens does not reset it.

#### Scenario: Toggle the dock open
- **WHEN** the user clicks the assistant toggle in the top bar
- **THEN** a chat dock opens alongside the current screen and remains open as the user navigates between project screens

#### Scenario: Collapse the dock
- **WHEN** the user closes the dock
- **THEN** the dock hides and the current screen reclaims the space

### Requirement: Project-scoped Claude Code chat
The assistant SHALL talk to the user's own Claude Code with the active project as
its working directory, using a resumable session so a conversation continues
across turns. The system SHALL NOT proxy model traffic, store provider keys, or
require any account.

#### Scenario: Ask the assistant about the project
- **WHEN** the user sends a message in the dock
- **THEN** the system runs Claude Code in the project and streams the reply into the dock, keeping the session for follow-ups

#### Scenario: No usage spent until first use
- **WHEN** the dock is open but the user has not sent a message
- **THEN** no Claude Code session is started and no usage is spent

### Requirement: Switching project resets the assistant scope
The assistant session SHALL be scoped to the active project; opening a different
project SHALL start a fresh session for that project's working directory.

#### Scenario: Change active project
- **WHEN** the user opens a different project
- **THEN** the dock's session targets the new project's directory and does not carry over the previous project's conversation
