## ADDED Requirements

### Requirement: Interactive terminal in both apps
Both the cockpit (`apps/desktop`) and the IDE (`apps/ide`) SHALL provide an interactive terminal backed by a real PTY (node-pty) and rendered with xterm.js. The terminal implementation SHALL be shared: the PTY/process layer in `packages/core` and the xterm renderer component in `packages/ui`, so both apps mount the same terminal.

#### Scenario: Terminal available in the cockpit
- **WHEN** the user opens the terminal in the cockpit
- **THEN** an interactive shell session appears and accepts input/produces output like a native terminal

#### Scenario: Terminal available in the IDE
- **WHEN** the user opens the terminal panel in the IDE
- **THEN** the same shared terminal component is mounted, backed by the same core PTY layer

### Requirement: Terminal is scoped to the workspace folder
Each terminal session SHALL spawn with its working directory set to the selected project/workspace root and SHALL run only there, consistent with the safe-process-handling invariant (spawned in the selected folder, never shell-string interpolation of app-controlled input).

#### Scenario: Session starts in the workspace
- **WHEN** a terminal session starts for a project
- **THEN** its initial working directory is that project's root

#### Scenario: Switching projects starts a workspace-scoped session
- **WHEN** the user switches to a different project and opens a terminal
- **THEN** the new session is scoped to the new project's root and does not inherit the previous project's directory

### Requirement: Run the local host environment and CLI tools from the terminal
The terminal SHALL let the user run the local host/dev environment and command-line tools (e.g. `git`, `gh`, `glab`, `jira`, package managers, dev servers) interactively, without leaving the app.

#### Scenario: Start the local host
- **WHEN** the user runs the project's dev/host command in the terminal
- **THEN** the process runs interactively in-app, streaming its output to the terminal, and can be interrupted with standard signals (e.g. Ctrl-C)

#### Scenario: Interactive CLI login
- **WHEN** the user runs an interactive command that prompts for input (e.g. a CLI auth login)
- **THEN** the terminal relays the prompts and the user's typed responses to the process

### Requirement: Terminal lifecycle is safe and observable
Terminal sessions SHALL be resizable (PTY resize follows the xterm viewport), SHALL be cleanly terminated when closed, and SHALL NOT leak processes across app restarts. The terminal SHALL NOT be used to bypass the additive-only Git guardrails enforced by the app's own Git actions, but the user's own typed commands run under the user's own authority.

#### Scenario: Resize keeps output aligned
- **WHEN** the user resizes the terminal panel
- **THEN** the PTY is resized to match and subsequent output wraps correctly

#### Scenario: Closing the terminal ends the process
- **WHEN** the user closes a terminal session (or the app quits)
- **THEN** the underlying PTY process is terminated and not left running
