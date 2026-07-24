## MODIFIED Requirements

### Requirement: First-launch environment detection

On first launch (and on demand thereafter), VortSpec SHALL check the local environment and render each check as a row with a pass/fail state: Node version, git presence, Claude Code installation, Claude Code login state, and **Figma MCP availability**. The Figma MCP row SHALL report `present` (configured and connected), `needs authentication` (configured but unauthorized), or `missing`, and SHALL offer a fix action that installs/authorizes it. Detection of the Figma MCP SHALL be usage-free (read the user's Claude MCP configuration / `claude mcp list`, no metered run). The base **ready** gate that lets the user proceed SHALL remain the installable tools only — Node, git, and Claude Code installation — so a missing Figma MCP does not block non-Figma work; for a project whose design source is Figma, the Figma MCP SHALL be treated as required and surfaced as a blocking gap for that project.

#### Scenario: All checks pass

- **WHEN** the app launches on a machine with a supported Node, git, an installed Claude Code, an active Claude Code login, and a connected Figma MCP
- **THEN** every environment row renders as passing and the user can proceed to select a project

#### Scenario: A check fails with a fix action

- **WHEN** a required tool is missing or Claude Code is not logged in
- **THEN** the corresponding row renders as failing with a fix action (an install link, or an "open login" action that runs the login flow in the embedded terminal)

#### Scenario: Figma MCP is surfaced as an actionable row

- **WHEN** the Figma MCP is missing or needs authentication
- **THEN** its row renders with a fix action that installs/authorizes the Figma MCP (rather than being reported as merely informational)

#### Scenario: Core readiness is independent of the Figma MCP

- **WHEN** Node, git, and Claude Code are installed but the Figma MCP is missing
- **THEN** the base ready gate SHALL still allow the user to proceed, with the Figma MCP surfaced as a separate gap (and as blocking only when the selected project's design source is Figma)
