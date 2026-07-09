## ADDED Requirements

### Requirement: Reference files, folders, and selections as context
The assistant SHALL let the user bring workspace files, folders, and code selections into the conversation, the way the Claude Code extension does. The user SHALL be able to: type `@` in the composer to fuzzy-search and attach a file/folder; drag a file/folder from the Explorer into the chat to attach it; and "Open in Chat" from an editor text selection to attach that selection (path + line range + text). Each reference SHALL appear as a removable chip, and all references SHALL be expanded into the prompt on send (files as `@path`, selections with the snippet) so Claude reads them; the chips SHALL clear after sending.

#### Scenario: @-mention a file
- **WHEN** the user types `@` and a query in the composer and picks a result
- **THEN** the file/folder becomes an attachment chip and, on send, is referenced in the prompt

#### Scenario: Drag a file into the chat
- **WHEN** the user drags a file or folder from the Explorer onto the chat
- **THEN** it is attached as a reference chip

#### Scenario: Open a selection in chat
- **WHEN** the user selects text in the editor and clicks the "Open in Chat" button
- **THEN** the selection (file, line range, and text) is attached and the assistant opens

### Requirement: Selectable folder tree preview
When a folder is attached, the user SHALL be able to preview it as a lazily-loaded File Tree and select the whole folder or individual files/subfolders inside it to add as context.

#### Scenario: Pick a file out of an attached folder
- **WHEN** the user expands an attached folder's tree and clicks a file inside it
- **THEN** that file is added as its own attachment (and both the folder and the file are referenced on send)
