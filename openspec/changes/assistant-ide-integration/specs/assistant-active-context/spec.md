## ADDED Requirements

### Requirement: Assistant grounded in the open file and selection
The assistant SHALL be grounded in the currently-active editor file and, when present, the user's text selection — matching the Claude Code extension's "knows your current file and selection" behavior. The open file and selection SHALL be made available to Claude for each message (via the IDE MCP bridge and/or the seeded context), and the assistant SHALL show a visible context chip naming the file and, when text is selected, the selected line count.

#### Scenario: The active file is context
- **WHEN** the user has a file open and sends an assistant message
- **THEN** the context chip shows that file, and Claude can reference/read it without the user pasting it

#### Scenario: A selection becomes context
- **WHEN** the user selects lines in the editor and sends a message
- **THEN** the context chip shows `⧉ <N> lines from <file>`, and the selected text is available to Claude for that message

#### Scenario: Context updates as focus changes
- **WHEN** the user switches the active file or changes the selection
- **THEN** the context chip updates to reflect the new active file / selection
