## ADDED Requirements

### Requirement: Reorderable editor tabs
The IDE editor tab strip SHALL let the user reorganize open tabs by dragging a tab left or right to a new position within the strip. The reorder SHALL preserve each tab's identity (active tab, unsaved/dirty state) — only the display order changes.

#### Scenario: Drag a tab to a new position
- **WHEN** the user drags an editor tab and drops it before/after another tab
- **THEN** the tab strip shows the tabs in the new order, and the dragged tab keeps its content, active state, and dirty indicator

#### Scenario: Reorder does not affect the chat drag
- **WHEN** an editor tab is dragged
- **THEN** it can only be dropped within the tab strip (it is not treated as a chat attachment), and dragging a file into the chat is unaffected
