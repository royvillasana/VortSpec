## ADDED Requirements

### Requirement: Surface session status from the init event
The assistant SHALL surface the session state carried by Claude Code's `system/init` stream-json event: the **model**, the available **skills**, the **agents/subagents**, the connected **MCP servers with their status** (connected / pending / failed / needs-auth), the **tools**, the **plugins**, and the **permission mode**. The model SHALL be shown inline in the assistant header; the fuller set SHALL be available in an expandable "session" panel.

#### Scenario: The model is shown
- **WHEN** a session initializes
- **THEN** the assistant header shows the active model (e.g. the resolved model id/alias) from the init event

#### Scenario: Skills and agents are listed
- **WHEN** the user opens the session panel
- **THEN** it lists the available skills and agents reported by the init event

#### Scenario: MCP servers show connection status
- **WHEN** the session panel is open and an MCP server is failed or needs auth
- **THEN** that server is listed with its status (e.g. "failed", "needs-auth"), distinct from connected servers

### Requirement: Parse the extended init fields
The stream-json parser and run-event contract SHALL carry the init event's `model`, `skills`, `agents`, `mcp_servers[].status`, `plugins`, `permissionMode`, and `slash_commands` (in addition to the tools/mcpServers already parsed), without breaking the existing `system-init` consumers or the cockpit.

#### Scenario: Extended init parses without regressions
- **WHEN** an init event with model/skills/agents/plugins is received
- **THEN** those fields are available on the parsed system-init event, and existing consumers (cockpit run views) continue to work unchanged
