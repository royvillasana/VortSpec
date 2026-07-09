## ADDED Requirements

### Requirement: Local IDE MCP server loaded by headless Claude
The interactive `claude --ide` WebSocket/lockfile bridge is unavailable to VortSpec's headless assistant — a real-run spike proved `claude -p --ide` never connects. The IDE SHALL instead run a **local stdio MCP server** that Claude loads via `--mcp-config` (which does load headless). Claude spawns the server (`server.mjs`), which connects back to the main-process bridge over a **local unix socket** authenticated with a per-run token; the AgentAdapter SHALL pass `--mcp-config <file>` for IDE-originated runs. Cockpit runs SHALL NOT pass it.

#### Scenario: Claude loads the IDE MCP server
- **WHEN** a workspace is open and the user sends an assistant message
- **THEN** the run includes `--mcp-config`, Claude spawns and lists the `vortspec-ide` server (shown `connected` in `init.mcp_servers`), and it can call the server's tools; the server↔bridge socket accepts only the matching token

#### Scenario: The server lifecycle is bound to the app
- **WHEN** the app quits
- **THEN** the bridge closes its socket and removes its temp files

### Requirement: Editor context tools
The bridge SHALL expose tools that let Claude read the editor state — `get_selection` (current text selection), `get_open_editors`, `get_workspace_folders` — and act on the editor via `open_file` (optionally at a line range). Reads are answered from a cache the renderer keeps fresh.

#### Scenario: Claude reads the current selection
- **WHEN** Claude calls the selection tool while the user has text selected in the editor
- **THEN** it receives the file path, the selected text, and the line/column range

#### Scenario: Claude opens a file in the editor
- **WHEN** Claude calls the open-file tool with a workspace-relative path
- **THEN** the IDE opens that file in the editor (path-guarded to the workspace root)

### Requirement: IDE-control tools (open / clone / switch project)
The bridge SHALL expose VortSpec IDE-control tools so the user can ask the assistant to change the workspace: **open_folder** (open a folder as the workspace), **clone_repo** (clone a git URL then open it), and **switch_project** (open a known/recent project). These actions change application state and SHALL be confirmed by the user (not performed silently).

#### Scenario: The assistant opens a cloned repo on request
- **WHEN** the user asks the assistant to clone a repository and the assistant calls cloneRepo with the URL
- **THEN** the IDE prompts the user to confirm, clones into a chosen location, and opens it as the workspace on approval

#### Scenario: State-changing IDE tools are gated
- **WHEN** an IDE-control tool that changes the workspace (openFolder/cloneRepo/switchProject) is invoked
- **THEN** the IDE surfaces a confirmation the user must accept before the action runs; declining leaves the workspace unchanged

### Requirement: Security of the bridge
The bridge SHALL use a **local unix socket** (not a network port), require the per-run auth token on every connection, write its temp files (server script + config) with owner-only permissions (0600), and confine every file/path tool to the open workspace root. No provider keys are stored or proxied.

#### Scenario: Unauthenticated access is refused
- **WHEN** a connection to the bridge socket arrives without the matching token
- **THEN** it is rejected
