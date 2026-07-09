## ADDED Requirements

### Requirement: VS Code-style Explorer file operations
The IDE Explorer SHALL support creating, renaming, moving, and deleting files and folders, like VS Code. New File / New Folder SHALL be available from the Explorer header and a folder's context menu (via an inline name input). An entry SHALL be renamable (double-click or context menu). An entry SHALL be movable by dragging it onto a folder (or the root). An entry SHALL be deletable via the context menu. Every operation SHALL be confined to the workspace root (a path that escapes the root is rejected), and delete SHALL be reversible (sent to the OS Trash, never a hard delete).

#### Scenario: Create a file or folder
- **WHEN** the user invokes New File / New Folder and enters a name
- **THEN** the file/folder is created under the workspace (parents as needed) and appears in the Explorer; a new file opens

#### Scenario: Rename and move
- **WHEN** the user renames an entry, or drags it onto another folder
- **THEN** the entry is renamed/moved (without overwriting an existing target), and the tree refreshes

#### Scenario: Delete is reversible
- **WHEN** the user deletes an entry
- **THEN** it is sent to the OS Trash (recoverable), not permanently removed

#### Scenario: Failures are surfaced
- **WHEN** a file operation fails
- **THEN** the Explorer shows an inline error explaining why, instead of failing silently
