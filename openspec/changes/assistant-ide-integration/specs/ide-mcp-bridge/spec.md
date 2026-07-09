## ADDED Requirements

### Requirement: Local IDE MCP server discoverable by Claude Code
The IDE SHALL run a local WebSocket MCP server (JSON-RPC 2.0, MCP 2024-11-05) bound to `127.0.0.1` and write a lockfile to `~/.claude/ide/<port>.lock` (mode 0600) containing the pid, workspace folders, an IDE name, `transport: "ws"`, and a random auth token — the discovery contract Claude Code uses. The AgentAdapter SHALL pass `--ide` for IDE-originated runs so `claude` connects; cockpit runs SHALL NOT pass `--ide`.

#### Scenario: Claude connects to the running IDE
- **WHEN** a workspace is open and the user sends an assistant message
- **THEN** the IDE MCP server is running with a valid lockfile, `claude -p --ide` connects to it over `127.0.0.1`, and the connection is accepted only with the matching auth token (unauthenticated connections are rejected)

#### Scenario: The server lifecycle is bound to the workspace
- **WHEN** the workspace changes or the app quits
- **THEN** the previous lockfile is removed and its socket closed, and a fresh server/lockfile is created for the new workspace

### Requirement: Editor context tools
The bridge SHALL expose tools that let Claude read the editor state: the current text selection, the open editors, the workspace folders, and language diagnostics; and act on the editor: open a file (optionally at a line range) and show a diff.

#### Scenario: Claude reads the current selection
- **WHEN** Claude calls the selection tool while the user has text selected in the editor
- **THEN** it receives the file path, the selected text, and the line/column range

#### Scenario: Claude opens a file in the editor
- **WHEN** Claude calls the open-file tool with a workspace-relative path
- **THEN** the IDE opens that file in the editor (path-guarded to the workspace root)

### Requirement: IDE-control tools (open / clone / switch project)
The bridge SHALL expose VortSpec IDE-control tools so the user can ask the assistant to change the workspace: **openFolder** (open a folder as the workspace), **cloneRepo** (clone a git URL then open it), and **switchProject** (open a known/recent project). These actions change application state and SHALL be confirmed by the user (not performed silently).

#### Scenario: The assistant opens a cloned repo on request
- **WHEN** the user asks the assistant to clone a repository and the assistant calls cloneRepo with the URL
- **THEN** the IDE prompts the user to confirm, clones into a chosen location, and opens it as the workspace on approval

#### Scenario: State-changing IDE tools are gated
- **WHEN** an IDE-control tool that changes the workspace (openFolder/cloneRepo/switchProject) is invoked
- **THEN** the IDE surfaces a confirmation the user must accept before the action runs; declining leaves the workspace unchanged

### Requirement: Security of the bridge
The server SHALL bind only to `127.0.0.1`, require the per-session auth token on every connection, write the lockfile with owner-only permissions, and confine every file/path tool to the open workspace root. No provider keys are stored or proxied.

#### Scenario: Remote and unauthenticated access is refused
- **WHEN** a connection arrives without the auth token or from a non-loopback address
- **THEN** it is rejected
