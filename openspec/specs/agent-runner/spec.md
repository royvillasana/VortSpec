# agent-runner Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Headless Claude Code runs via an adapter

VortSpec SHALL run each SDD-DE step by spawning the user's local Claude Code headless with structured JSON streaming (e.g. `claude -p … --output-format stream-json`), through a single `AgentAdapter` boundary that owns all knowledge of CLI flags and event shapes. No other module SHALL depend on the CLI's flags or stream format directly.

#### Scenario: A step runs headless

- **WHEN** the flow triggers an SDD-DE step
- **THEN** the AgentAdapter spawns Claude Code headless in the project folder and exposes its output as a typed event stream

#### Scenario: CLI interface isolated

- **WHEN** Claude Code's flags or stream format change
- **THEN** only the AgentAdapter requires modification; renderer and flow code consume the typed events unchanged

### Requirement: Stream parsed into typed run events

The AgentAdapter SHALL parse the Claude Code event stream into typed run events (assistant text, tool calls, file edits, completion) validated at the boundary, so the renderer can render friendly progress.

#### Scenario: Events are typed and validated

- **WHEN** the stream emits assistant text, a tool call, a file edit, or a completion event
- **THEN** the adapter emits a corresponding typed, validated run event; malformed events are surfaced as adapter errors rather than crashing the run

### Requirement: Safe process invocation

VortSpec SHALL spawn child processes with argument arrays (never shell string interpolation of user input), only within the selected project folder.

#### Scenario: User input never interpolated into a shell string

- **WHEN** a run is launched with user-provided values
- **THEN** those values are passed as discrete process arguments and the process runs with the project folder as its working directory

### Requirement: PTY fallback for interactive moments

For steps that require interaction the headless stream cannot surface cleanly, VortSpec SHALL provide a PTY (node-pty) fallback and design the seams between headless and interactive modes explicitly.

#### Scenario: A step needs interaction

- **WHEN** a step requires interactive input that streaming mode does not surface
- **THEN** VortSpec routes that step through the PTY terminal so the user can respond, then resumes structured tracking

