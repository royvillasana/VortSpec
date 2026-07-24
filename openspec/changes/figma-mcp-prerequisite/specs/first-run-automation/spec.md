## MODIFIED Requirements

### Requirement: Install the Figma MCP when absent

Because VortSpec's core features read design context through it, the Figma MCP SHALL be a first-class first-run step that **installs it automatically** when absent, not merely offers a command to copy. VortSpec SHALL detect whether the Figma MCP is configured in the user's Claude Code; when absent it SHALL run the documented install (`claude mcp add --transport http figma https://mcp.figma.com/mcp`) for the user (idempotent — an "already added" result is treated as success), then, because MCP authorization is interactive, guide the OAuth in the embedded terminal (`/mcp → Authenticate`, browser sign-in) and verify the server reports connected via `claude mcp list`. When already present and authenticated, the step SHALL be skipped. The step SHALL be idempotent and resumable, re-detecting state on entry. VortSpec SHALL NOT handle Figma or Claude credentials — authorization happens in the user's browser, and `claude mcp add` writes only into the user's own Claude MCP configuration.

#### Scenario: Figma MCP missing

- **WHEN** first-run setup detects no Figma MCP in the user's Claude Code configuration
- **THEN** VortSpec SHALL run `claude mcp add … figma …` for the user, guide the interactive `/mcp → Authenticate` OAuth in the terminal, and verify via `claude mcp list` that the Figma server is then connected

#### Scenario: Configured but not authenticated

- **WHEN** the Figma MCP is configured but reports it needs authentication
- **THEN** VortSpec SHALL guide the interactive `/mcp → Authenticate` OAuth in the terminal and re-verify, without re-adding the server

#### Scenario: Figma MCP already present

- **WHEN** the Figma MCP is already configured and connected
- **THEN** the step SHALL be marked complete and skipped

#### Scenario: Resume after interruption

- **WHEN** the Figma MCP step is re-entered after a partial setup
- **THEN** it SHALL re-detect the current state and resume from the first incomplete part (add, then authenticate, then verify) without repeating completed work

#### Scenario: Credentials are never handled by VortSpec

- **WHEN** the Figma MCP is installed and authorized
- **THEN** authorization SHALL occur in the user's browser and `claude mcp add` SHALL write only into the user's own Claude MCP config; VortSpec SHALL store no Figma or Claude credentials
