## MODIFIED Requirements

### Requirement: First-launch environment detection

On first launch (and on demand thereafter), VortSpec SHALL check the local environment and render each check as a row with a pass/fail state: Node version, git presence, Claude Code installation, Claude Code login state, and Figma MCP availability. For the installable tools — **Node, git, and the Claude Code CLI** — a failing row's fix action SHALL **run an install** (not merely open a docs link): git via the platform installer, the Claude CLI into VortSpec's managed prefix, and Node satisfied by the bundled runtime; the row SHALL reflect install progress (running / waiting-for-approval / done / error) and re-verify on completion. The base **ready** gate SHALL remain the installable core deps (Node, git, Claude Code installation); the login and Figma MCP rows are surfaced separately as before.

#### Scenario: All checks pass

- **WHEN** the app launches on a machine with a supported Node, git, an installed Claude Code, an active Claude Code login, and a connected Figma MCP
- **THEN** every environment row renders as passing and the user can proceed to select a project

#### Scenario: A missing tool is installed from its row

- **WHEN** Node, git, or the Claude Code CLI is missing
- **THEN** the row's fix action SHALL run the install (bundled Node / platform git installer / managed Claude CLI install), show progress, and re-verify — rather than opening an external download page

#### Scenario: Login/Figma rows keep their existing fixes

- **WHEN** Claude is not logged in or the Figma MCP is missing/unauthed
- **THEN** those rows SHALL keep their existing fixes (open login in the terminal; add/authorize the Figma MCP)
