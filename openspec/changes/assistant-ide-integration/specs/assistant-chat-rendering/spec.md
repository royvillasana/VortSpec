## ADDED Requirements

### Requirement: Rich chat rendering (shadcn/ai)
The assistant SHALL render Claude's stream with rich, purpose-built components rather than plain text. Assistant prose SHALL render as streaming-safe Markdown with syntax-highlighted code and copy (Streamdown/`Response`). Tool activity SHALL be surfaced (previously invisible): each tool call SHALL render as a card (per-tool icon, target, live status) grouped into a collapsible "Working · N steps" section, and SHALL expand to show its output — Bash output in a Terminal-style block with the command as a copyable Snippet. Extended thinking SHALL render in a collapsible Reasoning block. Claude's TodoWrite SHALL render as a live Plan checklist. Loading SHALL use a Shimmer.

#### Scenario: Assistant markdown + code
- **WHEN** an assistant reply contains Markdown and fenced code
- **THEN** it renders as formatted Markdown with highlighted, copyable code

#### Scenario: Tool activity is visible
- **WHEN** Claude calls tools (Read, Edit, Bash, an MCP tool…) during a turn
- **THEN** the tools render as a collapsible group of cards with a per-tool status (running → ok/error), and a Bash card expands to its terminal output

#### Scenario: Thinking and plan
- **WHEN** Claude emits extended thinking and/or a TodoWrite plan
- **THEN** the thinking renders in a collapsible Reasoning block and the plan renders as a checklist with per-item status

### Requirement: Cockpit unaffected
The chat-rendering components SHALL live in shared `@vortspec/ui` and be usable by both app shells, without changing the cockpit's existing behavior or breaking its tests.

#### Scenario: Shared without regression
- **WHEN** the shared `AssistantDock` is upgraded with the render components
- **THEN** the cockpit continues to function and its component tests stay green
