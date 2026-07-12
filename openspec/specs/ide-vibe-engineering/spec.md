# ide-vibe-engineering Specification

## Purpose
TBD - created by archiving change vortspec-ide. Update Purpose after archive.
## Requirements
### Requirement: Integrated assistant chat drives Claude Code runs
The IDE SHALL provide the assistant chat (AssistantDock) in the right rail, able to launch Claude Code runs against the open workspace using the shared run pipeline. Runs SHALL use the user's own `claude` binary, non-bare, with their login — never `--bare` and never injected credentials.

#### Scenario: Vibe-engineer from the chat
- **WHEN** the user asks the assistant to make a code change in the open workspace
- **THEN** the IDE launches a Claude Code run via the shared AgentAdapter (non-bare, user's login) and streams its events into the chat/run view

### Requirement: Chat is seeded with editor and preview context
The assistant chat SHALL be seeded with the currently open file and the live preview context, so requests are grounded in what the user is looking at.

#### Scenario: Context reflects the open file
- **WHEN** a file is open in the editor and the user asks the assistant about "this component"
- **THEN** the run is seeded with the open file's path (and preview URL when present) as context

### Requirement: Spec-first gates hold in the IDE
Generating or altering gated artifacts (briefs, specs, `DESIGN.md`) from the IDE SHALL require the same explicit user approval as the cockpit, recorded through the shared approval path. No gated artifact SHALL advance downstream without a recorded approval.

#### Scenario: Artifact change requires approval
- **WHEN** an IDE run produces or modifies a gated artifact
- **THEN** the user must explicitly approve it before implementation proceeds, and the approval is recorded exactly as in the cockpit

### Requirement: Runs are observable and resumable
IDE runs SHALL be observable (holistic progress with surfaced blockers) and resumable across interruptions and app restarts, reusing the shared run-manager/recorder.

#### Scenario: Resume an interrupted IDE run
- **WHEN** an IDE-launched run is interrupted and the user returns
- **THEN** the IDE offers to resume it from where it stopped rather than restarting from scratch

### Requirement: Errors render as fix-it guidance
Run and integration failures shown in the IDE (auth, MCP, billing, missing binary) SHALL render as human sentences with a next step, never raw exceptions.

#### Scenario: Missing/again-unauthenticated tool
- **WHEN** a run fails because a required tool is not authenticated or installed
- **THEN** the IDE shows a fix-it card explaining what to do, not a raw stack trace

