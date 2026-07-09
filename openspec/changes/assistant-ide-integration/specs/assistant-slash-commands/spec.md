## ADDED Requirements

### Requirement: Claude Code feature surface in the composer
The assistant composer SHALL expose the Claude Code feature surface via a `/` command palette, mirroring the extension's in-input commands. Typing `/` SHALL open a filterable menu (keyboard-navigable) of commands. Informational **meta commands** (`/mcp`, `/model`, `/context`, `/skills`, `/agents`, `/tools`, `/plugins`, `/status`, `/help`, `/clear`) SHALL render locally from the session's `init` data with no model round-trip. The session's real slash commands (from `init.slashCommands`) SHALL also be listed and, when picked, inserted into the input for the user to add arguments and send to Claude.

#### Scenario: Slash menu lists commands
- **WHEN** the user types `/` (optionally followed by a query) in the composer
- **THEN** a filterable menu appears with the meta commands and the session's slash commands, navigable with the arrow keys and Enter

#### Scenario: A meta command renders a local panel
- **WHEN** the user runs `/mcp` (or `/model`, `/context`, `/skills`, …)
- **THEN** a card renders inline from the session's `init` data (e.g. MCP servers with their status) without spending a model turn

### Requirement: Model switching
The assistant SHALL let the user switch the model — from the `/model` card or an always-visible Model Selector in the composer — and apply the choice via `--model` on subsequent messages (new sessions and follow-ups).

#### Scenario: Switching the model
- **WHEN** the user picks a different model in `/model` or the Model Selector
- **THEN** the selector reflects the choice and the next message runs with that `--model`
