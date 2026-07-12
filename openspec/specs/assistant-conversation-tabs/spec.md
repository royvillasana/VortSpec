# assistant-conversation-tabs Specification

## Purpose
TBD - created by archiving change assistant-conversation-tabs. Update Purpose after archive.
## Requirements
### Requirement: Multiple independent conversation tabs
The assistant SHALL support multiple conversation tabs. The user SHALL be able to open a new conversation, switch between conversations, rename a conversation, and close a conversation. Each conversation SHALL be an independent Claude session with its own transcript, and an inactive conversation's session and transcript SHALL persist while it is not the active tab (switching away and back does not reset it).

#### Scenario: Open and switch conversations
- **WHEN** the user opens a second conversation, sends a message in it, and switches back to the first
- **THEN** both conversations retain their own transcript and session; sending in one does not affect the other

#### Scenario: Rename and close
- **WHEN** the user renames a conversation tab, and later closes a conversation
- **THEN** the tab shows the new label, and closing removes only that conversation (the others are unchanged)

#### Scenario: Cockpit unaffected
- **WHEN** the cockpit uses the single-conversation assistant
- **THEN** it behaves exactly as before (no tab strip, no regression)

### Requirement: Per-conversation agent
Each conversation SHALL have a selectable **agent** chosen from a single picker that offers both the session's Claude Code **subagents** (from the `init` event) and VortSpec **custom presets** (a named role with a system prompt, and optionally a model and toolset). Selecting an agent SHALL shape that conversation's run — its system prompt, model, and allowed tools — without affecting other conversations.

#### Scenario: Choose an agent per tab
- **WHEN** the user selects an agent (a subagent or a preset) for a conversation
- **THEN** that conversation's messages run with the agent's system prompt / model / tools, and other conversations keep their own agents

#### Scenario: Defaults
- **WHEN** the user opens a new conversation
- **THEN** it starts with a sensible default agent, shown in the conversation's header

