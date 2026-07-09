## ADDED Requirements

### Requirement: Reference another conversation as context
A conversation SHALL be able to reference another open conversation by its label. Typing `@` in the composer SHALL list the open conversations alongside files; selecting one SHALL attach it as a reference chip. On send, the referenced conversation's **most recent transcript, capped** (newest-first, bounded length), SHALL be injected into the prompt so the current agent can reason about it.

#### Scenario: Reference by label
- **WHEN** the user, in conversation 2, `@`-mentions "Conversation 1" and sends a message
- **THEN** a bounded, most-recent-first slice of conversation 1's transcript is injected as context for that message, and the chip shows the referenced conversation

#### Scenario: Reference is bounded
- **WHEN** the referenced conversation is long
- **THEN** only a capped amount of its most recent content is injected (the context window is not blown), and this is transparent via the chip

### Requirement: Send a highlighted selection to another conversation
The user SHALL be able to select text inside a conversation's message and send it, as context, to another conversation. Selecting text SHALL surface a "Send to" control listing the other open conversations; choosing one SHALL add the selected text as an attachment in that target conversation.

#### Scenario: Highlight and hand off
- **WHEN** the user highlights text in conversation 1 and picks "Send to → Conversation 2"
- **THEN** conversation 2 gains an attachment containing that text (labelled with its source), which rides in conversation 2's next message
